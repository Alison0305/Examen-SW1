# CU-2P-08 - Chat colaborativo del proyecto con el Mentor IA

## Estado

Implementado en la rama `feat/chat-colaborativo-mentor` (issue #17), sin fusionar. OpenSpec activo en `openspec/changes/s2-cu08-chat-colaborativo/`. Prueba real aprobada por el usuario el 2026-11-11 en el entorno de pruebas «Prueba» de Railway (base de datos, volumen y dominios propios; producción sin cambios). Pendiente: integración con PostgreSQL automatizada (tarea 1.6), push, PR con `Closes #17`, revisión, merge y despliegue en producción.

## Objetivo Y Alcance

Un chat por proyecto, persistente y en tiempo real, en el que conversan los integrantes y en el que el Mentor IA interviene cuando se le pide. Fusiona el panel del Mentor (CU-2P-01, 04, 05 y 06) y el historial (CU-2P-07) en una sola experiencia compartida. El chat reemplaza al panel «Mentor IA» del workspace.

## Actores

- **OWNER y EDITOR:** escriben, mencionan al Mentor, piden recomendaciones, proponen cambios UML y los aplican o rechazan.
- **VIEWER:** escribe, menciona al Mentor y pide recomendaciones; no propone ni aplica cambios (CU-2P-06).
- **Mentor IA:** responde solo cuando se le menciona (`@mentor`) o se le pide una acción explícita. Sus mensajes los publica siempre el servidor.

## Dependencias

- CU-2P-01/03: `MentorService.query` (contexto UML, memoria y registro), sin cambios de prompt.
- CU-2P-05: `MentorService.recommend`.
- CU-2P-06: `MentorProposalCreationService.create`, rutas de aplicar y rechazar y ACK autoritativo `project.operation.accepted`.
- CU-2P-07: proyección pública de propuestas (estado de las tarjetas) y la sección de historial («Historial anterior»).
- Colaboración en tiempo real: la sala Socket.IO `project:<id>` existente.

## Flujo Principal

1. Un integrante abre el workspace; el panel «Chat del proyecto» carga la última página de mensajes.
2. Escribe un mensaje y lo envía: el servidor lo guarda con el autor del JWT y lo difunde a la sala; todos lo ven sin recargar.
3. Si el mensaje menciona `@mentor`, la sala ve «Mentor IA está respondiendo…» y, al terminar, la respuesta enlazada a la pregunta.
4. «Recomendación técnica» publica la petición y, después, la recomendación legible.
5. «Proponer cambio UML» (OWNER y EDITOR) publica la petición y, después, una tarjeta con el diff y el estado de la propuesta `PENDING`. El diagrama no cambia.
6. Un editor pulsa «Aplicar»: CU-2P-06 aplica la operación y el ACK autoritativo actualiza el diagrama de todos una sola vez; la tarjeta pasa a «Aplicada». «Rechazar» no toca el diagrama.
7. Si la IA no está disponible, está ocupada o la propuesta no es válida, la sala recibe un aviso.

## API

| Método | Ruta | Cuerpo / query | Respuesta |
|---|---|---|---|
| POST | `/projects/:id/chat/messages` | `{ body }` (1..2000) | 201 mensaje |
| POST | `/projects/:id/chat/actions` | `{ action: "RECOMMENDATION" \| "PROPOSAL", text }` (1..500) | 201 mensaje de petición |
| GET | `/projects/:id/chat/messages` | `limit` 1..50 (30), `cursor` | `{ items, nextCursor }`, más reciente primero |

Mensaje público: `{ id, kind, author: { email } | null, body, replyToId, proposalId, createdAt }`, con `kind` `USER`, `MENTOR`, `NOTICE` o `PROPOSAL`. Eventos de la sala: `project.chat.message` y `project.chat.mentor` (`THINKING` / `IDLE`). Sin acceso o proyecto inexistente: 404; VIEWER que propone: 403; cuerpo o query inválidos: 400 con código público.

## Implementación Realizada

- Backend: módulo `backend/src/project-chat/` (contratos, parsers estrictos, store Prisma, servicio, controlador); tabla `ProjectChatMessage` con migración aditiva `20261111180000_add_project_chat_messages` y CHECK de autoría; emisor `PROJECT_CHAT_BROADCASTER` implementado por el gateway existente. `MentorModule` exporta `MentorService` y `MentorProposalsModule` exporta `MentorProposalCreationService`.
- La IA trabaja de forma asíncrona: el POST responde de inmediato y el resultado llega por la sala. Una sola tarea genérica (THINKING → resultado → IDLE) sirve para menciones y acciones, con un único mapeo de errores a avisos seguros.
- Frontend: `ProjectChatPanel` en lugar del panel Mentor; la página reenvía los eventos del chat del proyecto abierto, la reconexión (recarga) y los ACK aceptados (refresco de tarjetas). Mensajes deduplicados por id y mostrados como texto.
- El análisis UML (CU-2P-04) queda como herramienta plegable del panel: depende de la selección del lienzo y su resultado es estructurado.

## Pruebas

- Automatizadas: backend del chat 41 (parsers, servicio, store, HTTP con el módulo real e inyección de dependencias) y gateway; frontend: panel 13 y página 10 (garantías de CU-2P-06 adaptadas al chat y filtrado por proyecto). Gates del 2026-11-11: backend sin integraciones 889/889, frontend 379/379, build, `tsc` y ESLint.
- Integración PostgreSQL (`prisma-project-chat.store.integration.test.ts`, CHAT-DB-01 a 03): escrita, pendiente de ejecutar en un equipo con base de datos.
- Prueba real (2026-11-11, entorno «Prueba» de Railway, Qwen3-1.7B Q4_K_M en CPU con 8 hilos): mensajes en tiempo real entre dos navegadores, `@mentor`, recomendación técnica, propuesta con tarjeta, aplicación con un único atributo en ambos diagramas, persistencia tras recargar y restricciones de VIEWER. Aprobada por el usuario: «Funciona todo a la perfección».

## Limitaciones

- La respuesta del Mentor no ve los mensajes humanos del chat, solo el modelo UML y su memoria (decisión para no tocar el prompt validado).
- Un rechazo de propuesta no se difunde: los demás ven el estado nuevo al refrescar.
- Si el backend se reinicia mientras la IA responde, la pregunta queda sin respuesta (se puede volver a mencionar).
- Las menciones comparten la cola de Qwen (una petición a la vez, máximo 5 en espera); con mucha demanda aparecen avisos de «ocupado».
- No hay indicador de «escribiendo» para personas ni edición o borrado de mensajes.
