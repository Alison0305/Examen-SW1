## Context

- CU-2P-01 registra cada consulta completada de `POST /projects/:id/mentor/query` mediante `MentorInteractionRecorder`.
- CU-2P-02 deriva la identidad del JWT y autoriza con `ProjectAccessService.requireView`.
- CU-2P-03 persiste las interacciones en `MentorInteraction` (`id`, `projectId`, `userId`, `authorEmail`, `accessRole`, `occurredAt`, `projectRevision`, `question`, `answer`, `grounded`, `createdAt`) con índice `(projectId, occurredAt, id)`, FK a `Project` en cascada y a `User` restringida. Su lector `PrismaMentorInteractionMemory.recent` devuelve las 6 interacciones más recientes, recortadas y en orden cronológico, para el prompt de Qwen.
- Solo `MentorService` escribe interacciones: las consultas libres de CU-2P-01 (respuesta en texto) y las recomendaciones técnicas de CU-2P-05 (la respuesta completa serializada como JSON en `answer`, incluidos `status`, `confidence` y `projectRevision`). No hay columna de tipo. Las respuestas de diagnóstico (`INSUFFICIENT_CONTEXT`, `ELEMENT_NOT_FOUND`), las aclaraciones de CU-2P-05, los 503 y los análisis de CU-2P-04 no se registran.
- CU-2P-06 guarda sus propuestas en una tabla propia (`MentorProposal`) y expone para CU-2P-07 `MentorProposalHistoryService` (`requireView`, límite 1..50, más reciente primero, sin cursor) con la proyección pública `MentorProposalHistoryProjection` (`proposalId`, `status`, `operation`, `summary`, `baseRevision`, `createdAt`, `resolvedAt?`, `resultingRevision?`). No hay vínculo entre una propuesta y una interacción.
- El repositorio no tiene ninguna convención previa de paginación ni de parámetros `@Query`.

## Goals / Non-Goals

**Goals:**

- Que cualquier integrante autorizado de un proyecto vea las interacciones de todos los integrantes de ese proyecto, con autor, fecha, pregunta y respuesta.
- Paginar sin duplicados ni huecos y buscar dentro del proyecto.
- Garantizar en el servidor la autorización y el aislamiento entre proyectos.
- Funcionar sin el modelo local.

**Non-Goals:**

- Editar, borrar o limpiar el historial; tiempo real; resúmenes o búsqueda con IA; búsqueda semántica.
- Registrar los análisis de CU-2P-04 o cambiar cómo CU-2P-05 registra sus recomendaciones.
- Un feed único que mezcle interacciones y propuestas, o leer la tabla de propuestas directamente.
- Cambiar CU-2P-06, el esquema Prisma o la memoria de CU-2P-03.

## Decisions

### Misma tabla, lector distinto

El historial lee `MentorInteraction` (única fuente de verdad), pero no reutiliza `recent()`: la memoria tiene un tope fijo, recorta texto, omite el autor, no pagina y devuelve orden cronológico para el prompt. El historial define su propio puerto `MentorHistoryReader` (`MENTOR_HISTORY_READER`).

### Independiente del modelo local

La lectura del historial funciona sin modelo local configurado y nunca lo invoca. La ruta de interacciones es JWT → `requireView` → PostgreSQL → DTO, y las fuentes de `backend/src/mentor-history/` no importan `mentor-analysis`, `node-llama-cpp` ni el proveedor del Mentor. Para leer las propuestas, CU-2P-07 puede necesitar importar `MentorProposalsModule`, el único que exporta `MentorProposalHistoryService`, que a su vez importa `AssistantModule`. Se acepta: sin `ASSISTANT_MODEL_PATH` el modelo es `undefined`, no se carga nada, y en la aplicación es la misma instancia única. Lo que se exige y se prueba es el comportamiento (responder sin modelo y no generar inferencias), no la estructura de módulos.

### Contrato HTTP

```http
GET /projects/:id/mentor/history?limit=20&cursor=<opaco>&q=<texto>
```

```json
{ "items": [ { "id": "…", "author": { "email": "…" }, "question": "…", "answer": "…", "occurredAt": "2026-11-10T10:30:00.123Z" } ], "nextCursor": "…" }
```

GET porque es una lectura idempotente. `:id` se valida con `ParseUUIDPipe`. El `userId` sale únicamente de `request.authenticatedUser`; la consulta no admite `userId`, `projectId` ni otros parámetros.

Contratos TypeScript (`mentor-history.contracts.ts`):

- `MentorHistoryRawQuery`: entrada HTTP cruda.
- `MentorHistoryQuery { limit; cursor?; search? }`: consulta interna normalizada.
- `MentorHistoryItem` y `MentorHistoryPage`: DTO público.
- `MentorHistoryRecord`: los únicos campos de la fila que el historial lee.
- `MentorHistoryQueryParse`: resultado discriminado `{ ok: true, query } | { ok: false, error }`, como `interpret-request.ts`.

### Orden y paginación keyset

Más reciente primero: `ORDER BY occurredAt DESC, id DESC`. `id` desempata interacciones con la misma fecha. La página siguiente se lee con:

```text
projectId = :id AND (occurredAt < c.occurredAt OR (occurredAt = c.occurredAt AND id < c.id))
```

El lector pide `limit + 1` filas: la fila extra solo indica que hay otra página (`toMentorHistoryPage`) y el cursor apunta al último elemento entregado. Sin offset, para que una interacción nueva no desplace ni duplique elementos durante el recorrido.

- `limit`: por defecto 20, entero decimal entre 1 y 50; otro valor es `INVALID_LIMIT`.
- El orden por `id` de PostgreSQL (`uuid`) coincide con el orden lexicográfico del UUID canónico en minúsculas, que es el que usa la referencia en memoria de las pruebas.

### Cursor opaco

`base64url(JSON { v: 1, t: <ISO con milisegundos>, i: <uuid> })`, generado con `encodeHistoryCursor` y validado con `decodeHistoryCursor`. No está firmado ni cifrado: no concede nada, porque toda lectura sigue autorizada y filtrada por proyecto; un cursor de otro proyecto solo define una posición en el proyecto autorizado. El decodificador nunca lanza y devuelve un motivo distinguible: `MALFORMED_CURSOR` (tipo, longitud > 256, alfabeto, base64url no canónico, JSON o claves), `UNSUPPORTED_CURSOR_VERSION`, `INVALID_CURSOR_DATE` (formato o fecha imposible) o `INVALID_CURSOR_ID`. La consulta lo expone como `INVALID_CURSOR` con su `reason`.

### Búsqueda

`q` opcional; se recorta y debe tener entre 1 y 200 caracteres, sin caracteres de control (PostgreSQL rechaza NUL). Vacía o solo con espacios es `INVALID_SEARCH`: el cliente omite `q` para no buscar. El lector la aplica sin distinguir mayúsculas sobre `question` OR `answer`, combinada con `projectId` mediante AND.

Búsqueda literal (medido en la fase 2): Prisma 6.19 traduce `contains` a `ILIKE '%' || valor || '%'` sin escapar el valor. Contra PostgreSQL, `q = "100%"` también encontró «¿100 por ciento?» y `q = "cliente_id"` encontró «clienteXid». `PrismaMentorHistoryReader` escapa `\`, `%` y `_` con la barra invertida, el carácter de escape por defecto de `LIKE`/`ILIKE`; las pruebas de integración verifican `%`, `_` y `\` literales. Las letras acentuadas se comparan sin distinguir mayúsculas (`relación uml` encuentra `RELACIÓN UML`).

### Lector PostgreSQL

`PrismaMentorHistoryReader` implementa `MENTOR_HISTORY_READER` con `findMany`: `where` construido por `mentorHistoryWhere` (`projectId` en el nivel superior; keyset y búsqueda como `OR` dentro de `AND`), `orderBy` `[{ occurredAt: "desc" }, { id: "desc" }]`, `take: limit + 1` y `select` limitado a `MentorHistoryRecord`. No captura errores de Prisma: se propagan como errores de infraestructura y su traducción corresponde al servicio o al controlador.

Orden de UUID (medido): Prisma genera `UuidFilter` con `lt` para `id @db.Uuid`, y en PostgreSQL `ORDER BY id DESC` coincide con el orden lexicográfico de la representación canónica en minúsculas, también con ids que solo difieren en el último grupo y cruzan la frontera dígito/letra. El keyset `(occurredAt, id)` se conserva sin cambios.

### Servicio y autorización

`MentorHistoryService.list(projectId, userId, rawQuery)` solo orquesta, en este orden: `ProjectAccessService.requireView` → `parseMentorHistoryQuery` → `MENTOR_HISTORY_READER.page`. `projectId` y `userId` llegan de fuentes confiables (parámetro de ruta y JWT); `rawQuery` es la entrada HTTP sin confiar.

- Autorizar primero: sin acceso se propaga la `NotFoundException` existente de `requireView` (proyecto inexistente y usuario ajeno no se distinguen), aunque la consulta también sea inválida, y no se lee nada del historial.
- Con acceso, una consulta inválida devuelve `{ ok: false, error }` (`MentorHistoryListResult`) sin llamar al reader; el controlador la traducirá a 400.
- Los errores del reader se propagan; nunca se convierten en una página vacía.
- No hay lógica de roles en el servicio: OWNER, EDITOR y VIEWER los decide `requireView`.

`MentorHistoryModule` importa `AuthModule` y `ProjectsPersistenceModule` (exporta el `ProjectAccessService` compartido) y usa el `PrismaService` del `PrismaModule` global. Registra `MentorHistoryController`, `PrismaMentorHistoryReader`, `MENTOR_HISTORY_READER` con `useExisting` y el servicio. No importa `AssistantModule`. Está registrado en `AppModule`.

`AuthModule` es necesario (medido en la fase 4): `JwtAuthGuard` necesita `JwtService` y `AuthService` en el ámbito del módulo del controlador, y `ProjectsPersistenceModule` importa `AuthModule` sin reexportarlo. Sin esa importación Nest falla con «can't resolve dependencies of the JwtAuthGuard». Es el mismo patrón de `MentorModule` y `MentorAnalysisModule`. Durante la fase 3, sin controlador, no hacía falta.

### Controlador HTTP

`MentorHistoryController` (`@Controller("projects")`, `@UseGuards(JwtAuthGuard)`, `@Get(":id/mentor/history")`) sigue el patrón de `MentorController` y `UmlAnalysisController`:

- `:id` con `ParseUUIDPipe`: UUID inválido → 400 antes del servicio; UUID válido de un proyecto inexistente → 404 de `requireView`.
- `userId` = `request.authenticatedUser.id`; si faltara, 404 defensivo, igual que `MentorController`.
- `@Query() rawQuery: unknown` se pasa sin tocar al servicio. No hay DTO de class-validator ni `DtoValidationPipe` para la query: `parseMentorHistoryQuery` es la única fuente de verdad. El `ValidationPipe` global de `createApp` no altera el objeto, porque su metatipo es `Object`; las pruebas lo verifican con el mismo pipe.
- `{ ok: true, page }` → 200 con `page` (`items`, `nextCursor`), sin el envoltorio interno.
- `{ ok: false, error }` → `BadRequestException` con cuerpo `{ statusCode: 400, error: "Bad Request", code, reason?, message }`. Mantiene la forma estándar de Nest y añade el código estable; `reason` solo aparece con `INVALID_CURSOR`.
- `NotFoundException` y cualquier otro error se propagan sin capturar: 404, o 500 genérico de Nest (`{ statusCode: 500, message: "Internal server error" }`) sin detalles de Prisma.

Parámetros repetidos (medido en la fase 4): el parser de query de Fastify no colapsa valores repetidos. `?limit=10&limit=20` llega como `{ limit: ["10", "20"] }` y `?q=uml&q=prisma` como `{ q: ["uml", "prisma"] }`. `parseMentorHistoryQuery` solo acepta cadenas, así que responden `INVALID_LIMIT` e `INVALID_SEARCH` sin ningún cambio en el contrato. Las claves con corchetes (`limit[]`, `limit[a]`) llegan literales y son `UNKNOWN_PARAMETER`.

Fastify expone automáticamente `HEAD` para cada ruta `GET`. `HEAD /projects/:id/mentor/history` pasa por el mismo guard, la misma autorización y la misma lectura, y no devuelve cuerpo.

### Cursor fuera de su contexto

El cursor no lleva `projectId` ni el texto de búsqueda, y no se añaden:

- Un cursor obtenido en el proyecto A y enviado al proyecto B solo define una posición `(occurredAt, id)`: devuelve las filas de B anteriores a esa posición y nunca filas de A (verificado).
- Un cursor obtenido con `q=patrón` y reutilizado con `q=relación` devuelve las filas que coinciden con «relación» anteriores a esa posición dentro del mismo proyecto. Es una navegación semánticamente extraña pero no expone nada; el cliente debe reiniciar la paginación (sin cursor) al cambiar la búsqueda.

### DTO público y privacidad

`toMentorHistoryItem` construye el objeto campo a campo desde `MentorHistoryRecord`: `id`, `author.email` (copia `authorEmail` guardada por CU-2P-02, sin join con `User` ni riesgo N+1), `question`, `answer` y `occurredAt` en ISO 8601. Nunca salen `userId`, `projectId`, `accessRole`, `projectRevision`, `grounded`, `createdAt`, prompts, contexto enviado a Qwen, rutas del modelo, causas de error, trazas ni JWT. Mostrar el email del autor a todos los integrantes, incluido VIEWER, es una decisión aprobada del CU.

### Errores

| Caso | Contrato | HTTP |
|---|---|---|
| Historial vacío | `{ items: [], nextCursor: null }` | 200 |
| Cursor inválido | `INVALID_CURSOR` + `reason` | 400 |
| `limit` fuera de rango o no entero | `INVALID_LIMIT` | 400 |
| Búsqueda inválida | `INVALID_SEARCH` | 400 |
| Parámetro no admitido | `UNKNOWN_PARAMETER` | 400 |
| Sin token | — | 401 |
| Sin acceso o proyecto inexistente | `requireView` | 404 |
| Base de datos no disponible | — | 5xx sin detalles internos |

### Frontend

Sección plegable «Historial del proyecto» dentro de `MentorPanel`, después de la consulta (CU-2P-01) y del análisis UML (CU-2P-04): búsqueda, lista (autor, fecha, pregunta), respuesta desplegable en texto plano y «Cargar más». Sin tiempo real ni polling.

Decisiones de la fase 6:

- **Estado encapsulado.** `MentorHistorySection` guarda su propio estado. `WorkspaceClient` solo reenvía `mentorHistory = { projectKey, onLoad }`, y la página construye `onLoad` con `api.getMentorHistory(project.id, params)`.
- **Carga diferida.** No hay petición hasta la primera apertura. Al cerrar y reabrir se conservan los datos y no se repite la petición, salvo que haya algo pendiente o la última carga fallara.
- **Búsqueda.** Se envía al servidor como `q`, recortada, con una espera de 400 ms y sin dependencias nuevas. Un texto vacío o en blanco vuelve al historial sin filtro y nunca envía `q=""`. Cada búsqueda nueva empieza en la primera página y descarta el cursor anterior, que es la regla de la fase 2.
- **«Cargar más»** envía el cursor y la búsqueda actuales, añade al final en el orden del servidor y omite los `id` ya mostrados. Si falla, conserva lo ya cargado y permite reintentar. Desaparece cuando `nextCursor` es `null`.
- **«Actualizar»** recarga la primera página sin cursor, con la misma búsqueda, y reemplaza la lista.
- **Refresco tras una interacción propia.** `MentorPanel` incrementa `interactionVersion` después de cada interacción registrada correctamente. La sección recarga si está abierta, queda marcada para recargar al reabrirse si ya se había cargado, y no hace nada si nunca se abrió. Una interacción fallida (503) no refresca, y el historial sigue visible: no depende de Qwen. Implementado en la fase 6 para la consulta libre; la recomendación técnica de CU-2P-05, que también se registra, se añade en la tarea 9.2. Sin tiempo real: las interacciones de otros integrantes aparecen al actualizar o al reabrir.
- **Carreras.** Un contador de peticiones descarta cualquier respuesta que no sea la última: una búsqueda anterior lenta, una actualización o un «Cargar más» adelantado por una búsqueda nueva.
- **Cambio de proyecto.** La sección se monta con `key={projectKey}`. El estado se reinicia, incluida la búsqueda; la sección vuelve a estar cerrada; y una respuesta tardía del proyecto anterior se ignora, porque pertenece a una instancia ya desmontada.
- **Errores** con mensajes seguros, sin el detalle técnico del servidor:

  | Caso | Mensaje |
  |---|---|
  | 400 | «No se pudo cargar el historial.» |
  | 401 | «Tu sesión expiró. Inicia sesión nuevamente.» (además, el cliente aplica su manejo global de sesión) |
  | 404 | «Proyecto no encontrado o no disponible.» (no distingue entre proyecto inexistente y sin acceso) |
  | 5xx o red | «No se pudo cargar el historial en este momento.» |

- **Fecha** con `Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" })`. El ISO original se conserva en `<time dateTime>`.
- **Texto plano.** Pregunta y respuesta se renderizan como texto de React (`pre-wrap`), sin `dangerouslySetInnerHTML`.
- **Solo el DTO público.** La interfaz de interacciones usa `id`, `author.email`, `question`, `answer` y `occurredAt`. Las propuestas se muestran aparte (ver «Propuestas de CU-2P-06»).
- **Compatibilidad verificada.** El parser de query de Fastify (`fast-querystring`) decodifica la salida de `URLSearchParams`: `+` como espacio, `%2B` como `+` y el cursor base64url intacto. No hizo falta ningún cambio en el backend.

### Recomendaciones registradas (CU-2P-05)

CU-2P-05 guarda cada recomendación como el JSON completo de `MentorRecommendationResponse` en `answer`. Mostrarlo tal cual expondría `projectRevision`, `confidence` y `status` y mostraría JSON bruto. Decisión: un mapper estricto en la lectura del historial reconoce una `answer` con la forma exacta de una recomendación y la convierte en texto legible solo con problema, alternativas, razón y limitaciones; cualquier otra respuesta se devuelve sin cambios. El DTO público no cambia (sigue teniendo cinco campos). Sin columna de tipo, sin migración y sin cambios en CU-2P-05.

### Propuestas de CU-2P-06

Composición en dos fuentes separadas, sin feed global:

- Interacciones: `MentorInteraction`, con la paginación keyset y la búsqueda actuales, sin cambios.
- Propuestas: `MentorProposalHistoryService` y `MentorProposalHistoryProjection` de CU-2P-06, consumidos tal cual. CU-2P-07 no lee la tabla `MentorProposal` ni `StoredMentorProposal`, no duplica la proyección ni el servicio, no crea otro store y no modifica CU-2P-06.

Por qué no un feed único: las dos tablas no comparten una clave de orden ni un cursor (el servicio de CU-2P-06 solo admite `limit`), y un keyset global exigiría cambiar CU-2P-06 o leer Prisma directamente. No hay vínculo entre una propuesta y una interacción. La interfaz muestra ambas fuentes dentro de la sección de historial como subconjuntos separados. Autorización igual que el resto del historial (`requireView`: OWNER, EDITOR y VIEWER; 404 sin acceso o proyecto inexistente).

## Risks / Trade-offs

- Búsqueda con `contains` sin índice de texto → recorre solo las filas del proyecto (filtradas por el índice existente); suficiente para la escala del proyecto.
- Comodines `%` y `_` en `q` → confirmado que Prisma no los escapa; resuelto escapándolos en el lector y cubierto con pruebas de integración.
- El email del autor queda visible para VIEWER, que hoy no puede listar miembros → decisión aceptada; no se expone ningún otro dato del usuario.
- Primer uso de parámetros `@Query` en el repositorio → el parser propio evita depender de que `DtoValidationPipe` maneje objetos de query; el comportamiento real de Fastify con parámetros repetidos se midió y está cubierto por pruebas HTTP.
- Si el recorder falla, la consulta del Mentor falla aunque Qwen haya respondido → comportamiento existente de CU-2P-01/03, fuera de alcance.
- La búsqueda `q` opera sobre el texto guardado: en una recomendación es su JSON, así que términos como `problem` coinciden con todas ellas → limitación aceptada para no cambiar CU-2P-05 ni el esquema.
- La lista de propuestas no tiene cursor porque el servicio de CU-2P-06 solo admite `limit` (máximo 50) → se muestran las más recientes.

## Migration Plan

No hay migración. El índice `(projectId, occurredAt, id)` cubre el orden y el filtro por proyecto. Revertir consiste en retirar el módulo; no se alteran datos.
