## Context

- CU-2P-01/03: `MentorService.query(projectId, user, question)` autoriza con la identidad del JWT y `requireView`, construye el contexto UML, usa la memoria del proyecto, invoca Qwen (`ASSISTANT_LOCAL_MODEL`, una cola de una petición a la vez, máximo 5 en espera, límite de tiempo configurable) y registra la interacción en `MentorInteraction`. Lanza `BadRequestException` (pregunta inválida), `NotFoundException` (sin acceso) o `ServiceUnavailableException` (modelo no configurado, tiempo agotado, cola llena o fallo).
- Tiempo real: `ProjectRealtimeGateway` mantiene la sala `project:<id>`, a la que se entra con `requireView` y de la que se sale al perder el acceso. CU-2P-06 ya expuso un emisor por token (`PROJECT_OPERATION_BROADCASTER`, `useExisting` del gateway).
- CU-2P-07: patrón de lectura keyset con cursor opaco y DTO público sin datos internos.

## Decisions

### Datos

```prisma
enum ProjectChatMessageKind { USER MENTOR NOTICE PROPOSAL }

model ProjectChatMessage {
  id             String                 @id @default(uuid()) @db.Uuid
  projectId      String                 @db.Uuid
  kind           ProjectChatMessageKind
  authorUserId   String?                @db.Uuid   // solo USER
  authorEmail    String?                           // instantánea, solo USER
  body           String
  mentionsMentor Boolean                @default(false)
  replyToId      String?                @db.Uuid   // respuesta del Mentor o aviso → mensaje humano
  proposalId     String?                @db.Uuid   // reservado para PROPOSAL (incremento 2)
  createdAt      DateTime               @default(now())
  @@index([projectId, createdAt, id])
  @@index([authorUserId])
}
```

- `Project` → `Cascade`; autor → `Restrict` (convención del repositorio); `replyTo` → `SetNull` sobre la misma tabla. `proposalId` no tiene FK para no acoplar la tabla al ciclo de vida de `MentorProposal`; su lectura pasará por la API pública de CU-2P-06.
- `PROPOSAL` y `proposalId` se crean ya, sin uso en el incremento 1, para no necesitar una segunda migración al integrar las tarjetas de propuesta.
- Un CHECK de la migración fija la coherencia: `USER` tiene autor; `MENTOR`, `NOTICE` y `PROPOSAL` no.

### API

| Método | Ruta | Cuerpo / query | Respuesta |
|---|---|---|---|
| POST | `/projects/:id/chat/messages` | `{ body }` (1..2000 tras `trim`, sin propiedades extra) | 201 mensaje público |
| GET | `/projects/:id/chat/messages` | `limit` 1..50 (30), `cursor` | `{ items, nextCursor }`, más reciente primero |

`JwtAuthGuard`, `ParseUUIDPipe` y `requireView` antes de leer o escribir; sin acceso o proyecto inexistente: 404. Errores de query: 400 `{ statusCode, error, code, message }` con `INVALID_LIMIT`, `INVALID_CURSOR` o `UNKNOWN_PARAMETER`.

Mensaje público: `{ id, kind, author: { email } | null, body, replyToId, proposalId, createdAt }`.

### Tiempo real

Eventos nuevos en `RealtimeEvent`: `project.chat.message` (el mensaje público) y `project.chat.mentor` (`{ projectId, replyToId, state: "THINKING" | "IDLE" }`). El gateway implementa `ProjectChatBroadcaster` (token `PROJECT_CHAT_BROADCASTER`, `useExisting`, exportado por `RealtimeModule`), con el mismo patrón que el emisor de operaciones. Se emite siempre después de persistir.

### Mención y respuesta asíncrona

- `@mentor` se reconoce sin distinguir mayúsculas y como palabra completa; la pregunta es el texto sin la mención, recortado.
- `POST` persiste y difunde el mensaje humano y responde 201 de inmediato; la respuesta de la IA no bloquea la petición HTTP.
- Tarea en segundo plano: emite `THINKING`, llama a `MentorService.query`, persiste y difunde un `MENTOR` con `replyToId`, y emite `IDLE`. Ante un fallo, persiste y difunde un `NOTICE` con un texto seguro según la excepción (no disponible u ocupado; pregunta inválida). Si el autor perdió el acceso (`NotFoundException`), no se publica nada.
- Las menciones comparten la cola de Qwen; el orden de respuesta es el de llegada. No se añade un mutex propio.
- La tarea se expone internamente como una promesa para las pruebas; los errores inesperados se registran en el log sin datos del mensaje.

### Fuera del incremento 1

Frontend, acciones explícitas de CU-2P-04/05/06 dentro del chat, tarjetas de propuesta, «Historial anterior», contexto de la conversación para la IA (cambiaría el prompt y exigiría pruebas reales) y presencia de «escribiendo» de personas.

## Risks / Trade-offs

- Cola de Qwen compartida: con muchas menciones simultáneas la cola se llena y el chat recibe avisos de «ocupado»; es visible y no bloquea la conversación.
- Respuesta asíncrona perdida si el proceso se reinicia mientras la IA responde: el mensaje humano queda sin respuesta; aceptado para un chat (se puede volver a mencionar).
- La respuesta del Mentor no ve los mensajes humanos del chat, solo el modelo UML y su memoria: decisión explícita para no tocar el prompt validado.

## Migration Plan

Migración aditiva `add_project_chat_messages` con enum, tabla, FK, índices y CHECK. En Railway la aplica `prisma migrate deploy` al arrancar. Rollback: retirar el módulo y la migración aditiva.

## Incremento 2 (decisiones)

- **Acciones en el chat:** `POST /projects/:id/chat/actions` con `{ action: "RECOMMENDATION" | "PROPOSAL", text }` (1..500, sin propiedades extra). `RECOMMENDATION` usa `MentorService.recommend` (CU-2P-05, sin cambios) y publica un `MENTOR` legible (Problema, Alternativas, Razón, Limitaciones), sin `confidence`, revisión ni estado. `PROPOSAL` exige `requireEdit` antes de escribir y usa `MentorProposalCreationService.create` (CU-2P-06, sin cambios; `MentorProposalsModule` lo exporta): publica un `PROPOSAL` con el diff determinista y `proposalId`, o un `NOTICE` con el mensaje público del error. La misma tarea asíncrona (THINKING → resultado → IDLE) sirve para la mención y las acciones, con un único mapeo de errores.
- **Tarjeta de propuesta:** el estado se lee de la proyección pública de CU-2P-07 (`GET /mentor/history/proposals`, `requireView`), así que todos los miembros lo ven. Aplicar y Rechazar (solo OWNER y EDITOR) llaman a las rutas existentes de CU-2P-06; el diagrama cambia solo por el ACK autoritativo `project.operation.accepted`, que además refresca la tarjeta (su `operationId` es el id de la propuesta). Un rechazo no se difunde por la sala: los demás ven el estado nuevo al refrescar.
- **Análisis UML (CU-2P-04):** se conserva como herramienta plegable dentro del panel del chat, no como mensaje: depende de la selección del lienzo y su resultado es estructurado (hechos, conflictos, diagnósticos).
- **Historial anterior (CU-2P-07):** la sección existente se muestra dentro del panel, con su propio despliegue.
- **Frontend:** `ProjectChatPanel` sustituye al panel Mentor cuando la página le pasa la conexión del chat (el panel antiguo sigue disponible sin ella). La página reenvía al panel los eventos `project.chat.message` y `project.chat.mentor` del proyecto abierto, la reconexión del socket (el panel recarga la última página) y los ACK aceptados. Los mensajes se deduplican por id y se muestran como texto, nunca como HTML.
