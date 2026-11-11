## Context

La auditoría de Fase 0 (Gate B) estableció:

- CU-2P-05 (`POST /projects/:id/mentor/recommendations`) devuelve `status: "READ_ONLY"`, texto estructurado y `requiresUmlChange: boolean`, sin operaciones, referencias estructuradas ni identificador de interacción (`MentorInteractionRecorder.record` devuelve `void`).
- `MentorContextBuilder` expone a Qwen solo nombres de clases, atributos, enumeraciones y relaciones; nunca identificadores.
- `UmlCommandExecutor.execute` es puro: clona el documento, aplica un comando, incrementa `revision` en 1 y ejecuta `validateProjectDocument` completo; un candidato inválido se rechaza devolviendo el documento original. `UmlCommandBus` con `historyLimit: 0` es el patrón de copia desechable (`previewImportFragment`, `ProjectOperationService`).
- `AddAttribute` admite `attributeId` opcional; si falta, el executor genera un UUID no determinista.
- `ProjectOperationService.apply(userId, { operationId, projectId, baseRevision, command })` es la ruta de mutación autoritativa: `requireEdit`, cola serializada por proyecto, transacción con comparación de `revision`, `ProjectOperationReceipt` (TTL 24 h, fingerprint por actor, proyecto, revisión y comando) y respuesta `STALE_REVISION` o `INVALID_OPERATION`. `RealtimeModule` no la exporta, y la difusión del ACK `ACCEPTED` la realiza el gateway, no el servicio.
- `normalizePrimitiveTypeName` (uml-core) normaliza sinónimos de primitivos; los primitivos canónicos son `string`, `integer`, `boolean`, `number`, `date` y `datetime`. `Multiplicity` es `{ lower: number; upper: number | "unbounded" }`.
- El validador canónico no restringe los caracteres de nombres de atributo; solo exige nombre y unicidad.

## Goals / Non-Goals

**Goals:**
- Convertir una instrucción de modificación en una propuesta UML estructurada, validada contra el documento autoritativo, previsualizada de forma determinista y aplicada solo tras confirmación (RF-18 a RF-21).
- Reutilizar el executor, los validadores y `ProjectOperationService` sin crear una segunda ruta de mutación.
- Dejar un estado persistente consultable por CU-2P-07 sin modificar esa rama.

**Non-Goals:**
- Operaciones distintas de `ADD_ATTRIBUTE` (crear, renombrar o borrar clases, editar atributos, relaciones, multiplicidades de relaciones, enumeraciones, N:M, layout).
- Secuencias de varios comandos, comandos compuestos o cambios en `uml-core`.
- Modificar CU-2P-05 (`mentor.service.ts`, `local-qwen-mentor.provider.ts`, `mentor-recommendation-context.ts`, contrato de recomendaciones) o convertir `alternatives[]` en comandos.
- Motivo de rechazo, edición de propuestas o regeneración automática de propuestas obsoletas.

## Decisions

### Dos representaciones separadas

`MentorProposalIntent` es lo único que la IA (o un parser determinista) puede producir: `{ operation: "ADD_ATTRIBUTE", className, attributeName, attributeType, multiplicity? }`, todo texto y sin identificadores. `MentorProposalCommand` es interno: `AddAttributeCommand` con `attributeId` obligatorio. Solo el servidor construye el comando, resolviendo `className` a `classId` sobre el documento autoritativo y generando `attributeId`. Un intent con campos extra o identificadores es `INVALID_PROPOSAL`. Las uniones están discriminadas por `operation` y `kind` para que una operación futura sea un miembro adicional sin romper el formato.

### Una propuesta = exactamente un `UmlCommand`

`ADD_ATTRIBUTE` se traduce a un único `AddAttribute`. El executor ya garantiza todo-o-nada por comando y una sola revisión nueva, y los clientes en tiempo real reproducen ese mismo comando con `applyAuthoritativeCommand`. No se introducen lotes.

### Identificadores fijados al crear

`proposalId` y `attributeId` se asignan al crear la propuesta y se persisten dentro del comando. Vista previa, aplicación y reproducción en clientes usan el mismo comando. La aplicación nunca genera un identificador nuevo.

### Resolución de tipo y multiplicidad

- Clase destino: igualdad exacta tras `trim().toLocaleLowerCase()`, la misma regla con la que `validateProjectDocument` detecta nombres duplicados; sin coincidencias parciales ni expresiones regulares. Como la unicidad de clases es por paquete, el mismo nombre puede existir en dos paquetes: esa ambigüedad se rechaza en lugar de elegir una. Ausente, vacía o ambigua → `ELEMENT_NOT_FOUND`, sin generar identificadores. La operación pública publica el nombre canónico de la clase del documento.
- Tipo: `normalizePrimitiveTypeName` de uml-core, con su tabla real de sinónimos (por ejemplo `String` → `string`, `int` → `integer`, `double` → `number`, `LocalDate` → `date`, `timestamp` → `datetime`); si no es primitivo, v1 lo rechaza con `UNKNOWN_TYPE`, incluidos nombres de clase o enumeración. Nunca se usa el respaldo a `string` de `buildImportFragment`. Las referencias a enumeración o clase se podrán añadir después como ampliación explícita.
- Multiplicidad: opcional; si falta, ni el comando ni la operación pública la incluyen. Si existe, `parseMentorProposalMultiplicity` acepta solo `n`, `n..m` y `n..*` con enteros no negativos sin ceros a la izquierda, `m >= n` y enteros seguros (por ejemplo `1`, `0..1`, `0..*`, `1..*`, `2..5`); cualquier otra forma (`*`, `5..2`, `muchos`, espacios internos) es `INVALID_PROPOSAL`. Se transforma a `Multiplicity` (`0..*` → `{ lower: 0, upper: "unbounded" }`) y se publica en forma canónica (`1..1` → `1`). La validación canónica decide la coherencia final.
- Nombre del atributo: se conserva tal como se pidió tras `trim`, sin transliterar, cambiar mayúsculas ni traducir (`teléfono`, `fechaNacimiento`).
- Errores esperables: el resolver y la vista previa devuelven un resultado discriminado (`ok: true | false`) con `MentorProposalError = { code, message, diagnostics }`; no lanzan excepciones de dominio.

### Vista previa y diff deterministas

La vista previa (`previewMentorProposal`) ejecuta el comando resuelto con `UmlCommandExecutor`, que clona su entrada y aplica la validación completa; se prefiere al `UmlCommandBus` porque es la pieza pura que el bus envuelve y admite inyectar `nowFactory` para resultados reproducibles. El executor incrementa la revisión del candidato: `baseRevision` es siempre la revisión del documento recibido y el candidato solo representa el resultado potencial (por ejemplo 10 → 11), nunca una revisión persistida. Si la ejecución lanza, es rechazada por la validación o el candidato no contiene exactamente el `attributeId` ya resuelto, el resultado es `INVALID_PROPOSAL` con los diagnósticos proyectados; una clase eliminada después de resolver también termina así. El resultado interno conserva el documento candidato para el diff de la Fase 3 y no forma parte del contrato público. El diff es la función pura `diffCanonicalUml(before: CanonicalUmlModel, after: CanonicalUmlModel)` (`backend/src/mentor-proposals/uml-diff.ts`, sin tocar `uml-core`), que produce `MentorProposalDiffLine[]` (`kind`: `added`, `removed`, `changed`; `element`: `class`, `attribute`, `relationship`, `enumeration`). `previewMentorProposal` la invoca con `document.uml` y `candidate.uml` y añade `diff` a su resultado interno. El diff se calcula al crear y se persiste como `summary`; nunca procede de la instrucción ni del modelo de IA.

- Correlación: los elementos se emparejan por identificador interno (clases por `id`, atributos por `id` en todo el modelo). Los identificadores solo sirven para emparejar y como desempate de orden; nunca aparecen en `label`.
- Exclusión de metadatos: la firma recibe solo `uml`, por lo que `revision`, `createdAt`, `updatedAt` y `layout` no pueden producir líneas; un modelo semánticamente igual devuelve `[]`, sin mensajes artificiales.
- Orden determinista: primero por categoría según `MENTOR_PROPOSAL_DIFF_ELEMENTS` (`class`, `attribute`, `enumeration`, `relationship`); dentro de clases por nombre e `id`; dentro de atributos por nombre de clase, `id` de clase, nombre de atributo e `id` de atributo. La comparación es por punto de código, independiente del locale del runtime y del orden de los arreglos.
- Formato de atributo: `Clase.atributo: tipo`, más ` [multiplicidad]` con `formatMentorProposalMultiplicity` cuando existe (`Cliente.correos: string [0..*]`); sin multiplicidad no se muestra ninguna. Los primitivos muestran su nombre canónico; un tipo de referencia muestra el nombre del elemento referenciado en el mismo modelo, y el texto fijo `referencia no resuelta` solo si el modelo no lo contiene (no ocurre en documentos válidos).
- Alcance v1 cubierto por pruebas: atributos agregados, eliminados y modificados (`changed` solo por nombre, tipo o multiplicidad, con etiqueta `antes → después`; la visibilidad y `generationMetadata` no forman parte de la etiqueta ni de la comparación) y clases agregadas, eliminadas y renombradas (`Clase Pago`, `Clase A → Clase B`). Agregar un atributo no emite una línea de clase. Los atributos de una clase agregada o eliminada aparecen como líneas propias de atributo. Enumeraciones y relaciones forman parte del vocabulario del contrato, pero la implementación v1 todavía no las compara.

Un candidato rechazado por la validación canónica al crear devuelve `INVALID_PROPOSAL` con diagnósticos y no se persiste. El detalle de una propuesta `PENDING` cuya base ya no coincide con la revisión actual devuelve el `summary` persistido, `valid: false` y un diagnóstico `STALE_PROPOSAL`, sin recalcular contra la revisión nueva.

### Diagnósticos públicos

`MentorProposalDiagnostic = { code, severity: "error" | "warning", message }`. No se reutiliza directamente `Diagnostic` de `uml-core` porque incluye `path` y `elementId` (identificadores internos); `toMentorProposalDiagnostic` construye un objeto nuevo solo con `code`, `severity` y `message`, por lo que tampoco se filtra ninguna otra propiedad. Los mensajes del validador y del executor son textos fijos sin identificadores interpolados. Los códigos `UML_*` se transportan como texto.

### Estados

Persistentes: `PENDING`, `APPLIED` (terminal) y `REJECTED` (terminal). `STALE` no se persiste: se calcula como `status === "PENDING" && baseRevision !== project.revision`.

`APPLIED` es terminal siempre. `REJECTED` es terminal para las acciones normales del usuario, salvo una reconciliación excepcional cuando existe evidencia autoritativa (un `ProjectOperationReceipt` aceptado para `proposal.id`) de que el cambio UML ya fue aceptado: entonces `REJECTED → APPLIED` mediante `reconcileAcceptedOperation`. Nunca se revierte el UML ni se declara `REJECTED` una propuesta cuyo cambio consta como aceptado; eventualmente, recibo aceptado implica `APPLIED`.

### Cancelar frente a rechazar

Cancelar o cerrar la vista previa es solo del cliente: sin petición, sin cambio de estado y sin cambio UML. Rechazar es `POST .../reject`: transición condicional `PENDING → REJECTED` persistida, sin tocar el documento. Una propuesta rechazada no puede aplicarse (`PROPOSAL_REJECTED`). El issue #6 no exige motivo, por lo que no se añade.

`MentorProposalRejectionService.reject(projectId, proposalId, user)`: `requireEdit` → búsqueda `(projectId, proposalId)` → `APPLIED` da `PROPOSAL_ALREADY_APPLIED` y `REJECTED` da `PROPOSAL_REJECTED`, sin tocar el store → si hay recibo aceptado de `proposal.id`, se reconcilia a `APPLIED` y se responde `PROPOSAL_ALREADY_APPLIED` → si no, `reject` condicional → segundo chequeo del recibo inmediatamente después; si apareció, `REJECTED → APPLIED` y `PROPOSAL_ALREADY_APPLIED` → si no, `REJECTED`. Si el `ACCEPTED` llega después del segundo chequeo, el servicio de aplicación lo corrige al encontrar `REJECTED` en `markApplied`. Ambas capas se complementan.

### API

| Método | Ruta | Cuerpo | Resultado |
|---|---|---|---|
| POST | `/projects/:projectId/mentor/proposals` | `{ instruction }` (string, `trim`, 1..500) | `MentorProposalResponse` (`PENDING`) |
| GET | `/projects/:projectId/mentor/proposals/:proposalId` | — | `MentorProposalResponse` |
| POST | `/projects/:projectId/mentor/proposals/:proposalId/apply` | vacío | `MentorProposalResponse` (`APPLIED`) |
| POST | `/projects/:projectId/mentor/proposals/:proposalId/reject` | vacío | `MentorProposalResponse` (`REJECTED`) |

Estado (Fase 6): `MentorProposalController` expone GET detalle, `apply` y `reject` con `JwtAuthGuard`, `ParseUUIDPipe` en `projectId` y `proposalId`, identidad solo desde el JWT y `@HttpCode(200)` en los POST; `MentorProposalsModule` (con `AuthModule`, `ProjectsPersistenceModule` y `RealtimeModule`) está registrado en `AppModule`.

Estado (Fase 7): `POST .../proposals` responde 201 con la propuesta `PENDING`. El cuerpo se valida con `CreateMentorProposalDto` (`instruction` recortada, 1..500, `DtoValidationPipe` con `forbidNonWhitelisted`). `MentorProposalsModule` importa además `AssistantModule` para reutilizar el único `ASSISTANT_LOCAL_MODEL`.

El cuerpo de creación no admite `userId`, `projectId`, `baseRevision`, comando ni UUID; el DTO rechaza propiedades extra. La revisión base procede del proyecto cargado por el servidor. Apply y reject no declaran `@Body()`: cualquier cuerpo (por ejemplo `{ baseRevision: 999, command: { type: "DeleteClass" } }`) se ignora por completo y la operación usa solo la propuesta persistida.

Detalle (`MentorProposalQueryService`): `requireEdit` → búsqueda `(projectId, proposalId)` → revisión actual con `ProjectsPersistenceService.findProject` (el mismo servicio que usan Mentor, análisis UML y exportaciones) → `toMentorProposalResponse`. La respuesta se construye solo desde los snapshots persistidos (`operation`, `summary`, `diagnostics`); no se recalculan diff, comando ni vista previa. Una propuesta `PENDING` con `baseRevision` distinta de la revisión actual responde `preview.valid = false` y añade `STALE_PROPOSAL` a los diagnósticos almacenados; con la misma revisión, `valid = true`. Las propuestas `APPLIED` y `REJECTED` conservan su vista previa tal como se creó (`valid = true`, porque solo se persisten propuestas con vista previa válida) y no se tratan como obsoletas aunque el proyecto avance: su estado terminal ya informa el resultado. Las respuestas de `apply` y `reject` usan el mismo constructor; el ACK no es parte del contrato HTTP.

`MentorProposalResponse` expone `id`, `status`, `baseRevision`, `operation` por nombre (`kind`, `target.className`, `change`), `preview` (`valid`, `diff`, `diagnostics`), `createdAt`, `resolvedAt?` y `resultingRevision?`. No expone `authorUserId`, el comando persistido, la instrucción, identificadores internos de clase o atributo, prompts, contexto Qwen, rutas ni trazas.

### Autorización

| Operación CU-06 | OWNER | EDITOR | VIEWER | Sin acceso |
|---|---:|---:|---:|---:|
| Crear propuesta | Sí | Sí | 403 | 404 |
| Ver detalle o vista previa | Sí | Sí | 403 | 404 |
| Aplicar | Sí | Sí | 403 | 404 |
| Rechazar | Sí | Sí | 403 | 404 |

Todas usan `ProjectAccessService.requireEdit` antes de cargar proyecto, propuesta o contexto. La propuesta se busca siempre por `(proposalId, projectId)`; otra combinación responde 404. CU-2P-07 tendrá su propia proyección de lectura con `requireView`, separada de este contrato.

### Control de revisión

La propuesta captura `baseRevision` desde la revisión autoritativa al crearse. Apply exige `proposal.baseRevision === project.revision`; si no, `STALE_PROPOSAL` (409), sin regenerar ni aplicar sobre la revisión nueva. La comprobación definitiva la realiza `ProjectOperationService` (`STALE_REVISION`), que se traduce a `STALE_PROPOSAL`.

### Aplicación mediante `ProjectOperationService` (Fase 5)

CU-06 no escribe `Project.document`, no usa `PUT /projects/:id` ni ejecuta el executor contra la persistencia. `MentorProposalApplicationService.apply(projectId, proposalId, user)` recibe solo esos tres datos; comando, revisión base y `operationId` salen de la propuesta persistida.

Infraestructura real auditada:

- `ProjectOperationService.apply(userId, { operationId, projectId, baseRevision, command })` hace `requireEdit`, serializa por proyecto en una cola en memoria y, en una transacción: busca el recibo `(projectId, operationId)`; si existe y no expiró devuelve el mismo ACK cuando el fingerprint coincide (`sha256` de actor, proyecto, `baseRevision` y comando) o `INVALID_OPERATION` si otro actor reutiliza el `operationId`; si la revisión difiere devuelve `STALE_REVISION`; si el comando es inválido, `INVALID_OPERATION` con diagnósticos; si no, actualiza documento y revisión (`updateMany` condicionado a `baseRevision`) y crea el recibo. Resultados: `ProjectOperationAck { operationId, projectId, revision, command }`, `ProjectOperationConflict { code: "STALE_REVISION", revision, requiresResync }`, `ProjectOperationRejected { code: "INVALID_OPERATION" | "FORBIDDEN", diagnostics }`.
- Los recibos solo se crean dentro de la transacción de una operación aceptada: un recibo existente prueba que la operación se aplicó. Expiran a las 24 h (`RECEIPT_TTL_MS`) y se podan de forma perezosa; no son un historial permanente. La fuente de verdad duradera del estado es `MentorProposal`.
- Cambios aditivos en `realtime`: `RealtimeModule` exporta `ProjectOperationService` y el token `PROJECT_OPERATION_BROADCASTER` (`useExisting` del gateway); `ProjectOperationService.findAcceptedOperation(projectId, operationId)` lee un recibo sin autorizar (los llamadores autorizan antes) y devuelve ACK, actor, revisión resultante y hora; el gateway centraliza la emisión en `broadcastAccepted(ack)`, que también usa su manejador `project.operation.apply`. El contrato de `apply` no cambia.

Orden: `requireEdit` (404 sin acceso, 403 VIEWER) → `findByProjectAndId(projectId, proposalId)` → estado (`APPLIED` → `PROPOSAL_ALREADY_APPLIED`, `REJECTED` → `PROPOSAL_REJECTED`, sin llamar a `apply`) → recibo de `proposal.id` → `apply` → emisión → `markApplied`. La propuesta solo se lee después de autorizar, por lo que su existencia no se filtra.

Traducción del resultado:

| Resultado de `apply` | CU-06 | Propuesta | Emisión |
|---|---|---|---|
| ACK | éxito; `markApplied` con `resultingRevision = ack.revision` (nunca `baseRevision + 1`) y `resolvedByUserId` = quien aplica | `APPLIED` | sí, una vez |
| `STALE_REVISION` | `STALE_PROPOSAL` | sigue `PENDING` | no |
| `INVALID_OPERATION` con recibo de `proposal.id` | colisión con otro actor concurrente: se reconcilia desde el recibo | `APPLIED` | no |
| `INVALID_OPERATION` sin recibo | `INVALID_PROPOSAL` con diagnósticos públicos (`code`, `severity`, `message`) | sigue `PENDING` | no |
| `FORBIDDEN` | `ForbiddenException` | sin cambios | no |

Atomicidad y recuperación: aplicar (transacción de `ProjectOperationService`) y persistir `APPLIED` (store) son dos transacciones. Si el proceso falla entre ambas, el modelo cambió y la propuesta sigue `PENDING`. Antes de llamar a `apply`, el servicio busca el recibo de `proposal.id`; si existe, persiste `APPLIED` desde él (actor real del recibo, su hora y su revisión resultante), sin reejecutar ni emitir, y devuelve `reconciled: true`. Esto también evita la colisión de fingerprint cuando reintenta otro editor. Funciona dentro del TTL del recibo; pasado el TTL, un reintento se rechaza como `STALE_PROPOSAL` porque el proyecto ya avanzó al menos a `baseRevision + 1`, así que nunca se aplica dos veces.

Concurrencia: no hay mutex propio. La cola por proyecto, la comparación de revisión y el recibo único garantizan una sola mutación; la transición condicional de `markApplied` garantiza un solo `APPLIED`. Mismo actor en paralelo: el segundo `apply` obtiene el ACK repetido y su `markApplied` pierde (`PROPOSAL_ALREADY_APPLIED`). Actores distintos: el segundo obtiene `INVALID_OPERATION` por colisión de fingerprint y se reconcilia desde el recibo. Si una propuesta se rechaza concurrentemente después de que su operación fue aceptada, `markApplied` encuentra `REJECTED` y el servicio la corrige con `reconcileAcceptedOperation` usando el ACK aceptado (revisión del ACK, quien aplicó), con un aviso en el log; responde éxito con `reconciled: true`. Una propuesta `REJECTED` con recibo aceptado también se reconcilia al intentar aplicarla, sin reejecutar ni emitir. Una reconciliación que encuentra la propuesta ya `APPLIED` (`changed: false`) se informa como `PROPOSAL_ALREADY_APPLIED`.

Autor y resolución: `authorUserId` y `authorEmail` nunca cambian; `resolvedByUserId` es quien aplicó realmente (el llamador en el camino normal, el actor del recibo al reconciliar).

### Tiempo real (Fase 5)

La emisión sigue exactamente la regla del gateway: cada resultado `ACCEPTED` que devuelve `apply` en esa llamada se emite una vez, de inmediato y antes de `markApplied`, para que la sala conozca la mutación aunque persistir `APPLIED` falle después. El evento es `project.operation.accepted` a la sala `project:<projectId>`, con el ACK autoritativo como payload, mediante `broadcastAccepted` del gateway (un único camino de emisión). Igual que el gateway con los reintentos, un ACK repetido por una llamada concurrente del mismo actor se emite otra vez con payload idéntico; los clientes lo deduplican por `operationId`. Los errores (`STALE`, `INVALID`, `FORBIDDEN`, `NOT_FOUND`, estados terminales) no emiten. La reconciliación nunca emite: no hay mutación nueva, y el cliente fija su revisión desde el ACK y solo deduplica dentro de su sesión, por lo que reemitir un ACK antiguo podría hacer retroceder la revisión de un cliente que entró después. Un cliente que no recibió la emisión original se resincroniza en su siguiente `STALE_REVISION`. La prueba con dos clientes reales queda para la prueba E2E (tarea 10).

### Persistencia `MentorProposal` (Fase 4)

Entidad separada; no se extiende `MentorInteraction`. Esquema real en `backend/prisma/schema.prisma`, migración aditiva `20261110170000_add_mentor_proposals` (enum, tabla, FK, índices y un CHECK), sin tocar migraciones ni tablas existentes salvo las relaciones inversas en `User` y `Project`.

```prisma
enum MentorProposalStatus { PENDING APPLIED REJECTED }

model MentorProposal {
  id                String               @id @default(uuid()) @db.Uuid
  projectId         String               @db.Uuid
  authorUserId      String               @db.Uuid
  authorEmail       String
  instruction       String
  baseRevision      Int
  status            MentorProposalStatus @default(PENDING)
  command           Json
  operation         Json
  summary           Json
  diagnostics       Json
  createdAt         DateTime             @default(now())
  resolvedAt        DateTime?
  resolvedByUserId  String?              @db.Uuid
  resultingRevision Int?
  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  author     User    @relation("MentorProposalAuthor", fields: [authorUserId], references: [id], onDelete: Restrict)
  resolvedBy User?   @relation("MentorProposalResolvedBy", fields: [resolvedByUserId], references: [id], onDelete: Restrict)
  @@index([projectId, createdAt, id])
  @@index([authorUserId])
  @@index([resolvedByUserId])
}
```

| Campo | Obligatorio | Motivo |
|---|---|---|
| `id` | Sí | Identidad de la propuesta y futuro `operationId` del recibo. Lo asigna el servidor (`buildNewMentorProposal`); el `@default(uuid())` solo sigue la convención del esquema |
| `projectId` | Sí | Aislamiento; toda lectura y transición filtra por `(id, projectId)` en la propia consulta |
| `authorUserId` | Sí | Quien generó la propuesta; viene de la identidad autorizada, nunca del cliente |
| `authorEmail` | Sí | Instantánea para CU-2P-07, como `MentorInteraction.authorEmail`; no se usa para autorizar |
| `instruction` | Sí | Instrucción procesada (recortada, 1..500); no se expone en la respuesta CU-06 |
| `baseRevision` | Sí | `preview.baseRevision`, la revisión autoritativa; nunca la del candidato |
| `status` | Sí | Siempre `PENDING` al crear |
| `command` | Sí | Exactamente el `AddAttributeProposalCommand` resuelto; nunca se expone |
| `operation` | Sí | Exactamente la operación pública resuelta (`AddAttributeProposalOperation`, por nombre, sin UUID); base del detalle |
| `summary` | Sí | Exactamente `preview.diff`; no se recalcula al leer |
| `diagnostics` | Sí | Exactamente `preview.diagnostics`, ya proyectados sin `path` ni `elementId` |
| `createdAt` | Sí | Hora del servidor, inyectable con `nowFactory` |
| `resolvedAt`, `resolvedByUserId` | No | Solo `APPLIED` o `REJECTED`; quien resuelve puede no ser el autor |
| `resultingRevision` | No | Solo `APPLIED` |

- Relaciones: dos relaciones con nombre explícito hacia `User` (`MentorProposalAuthor`, `MentorProposalResolvedBy`) para evitar ambigüedad, siguiendo el precedente `ProjectInvitationInvitedBy`.
- `onDelete`: `Project` → `Cascade` (como `MentorInteraction`, invitaciones, membresías y recibos; no quedan propuestas huérfanas). `User` → `Restrict` (como `MentorInteraction.author`, `ProjectMembership.user` y `ProjectInvitation.invitedBy`; un usuario con propuestas no se borra).
- Índices: `(projectId, createdAt, id)` para la futura proyección CU-2P-07 por proyecto con orden estable; `authorUserId` y `resolvedByUserId` para las FK, como el repositorio indexa cada FK a `User`. La búsqueda por `(id, projectId)` usa la PK. No se crea `(projectId, status, createdAt, id)` porque ninguna consulta actual ni prevista filtra por estado: CU-2P-07 muestra todas las propuestas con su estado.
- Invariante de estado: `PENDING` sin resolución; `REJECTED` con `resolvedAt` y `resolvedByUserId` y sin `resultingRevision`; `APPLIED` con los tres. La garantizan el tipo `StoredMentorProposal` (unión por `status`), el store (escribe solo esos campos y revalida cada fila al leer) y el CHECK `MentorProposal_resolution_check` añadido a mano en la migración, porque `schema.prisma` no puede expresarlo; Prisma no gestiona ese CHECK y no lo elimina.
- Parsers estrictos: `parseStoredMentorProposalCommand`, `parseStoredMentorProposalOperation`, `parseStoredMentorProposalSummary` y `parseStoredMentorProposalDiagnostics` validan claves exactas, `AddAttribute`, UUID con la forma del validador de uml-core, nombre recortado no vacío, primitivo de `UML_PRIMITIVE_TYPES`, multiplicidad entera coherente, operación pública con texto de multiplicidad canónico, líneas de diff del vocabulario del contrato y diagnósticos solo con `code`, `severity` y `message`; los textos públicos (`className`, `attributeName`, etiquetas, códigos y mensajes) no pueden contener UUID. Se aplican antes de escribir y en cada lectura; un JSON corrupto lanza `MentorProposalDataError` (`MENTOR_PROPOSAL_DATA_CORRUPTED`, solo con el nombre del campo, nunca el JSON), que la API traduce a un 500 genérico (`No fue posible procesar la propuesta.`). La base no puede saltarse la allow-list.
- Store (`MentorProposalStore`, implementado por `PrismaMentorProposalStore`): `create` (siempre `PENDING`, solo campos de creación), `findByProjectAndId` (`findFirst` con `id` y `projectId`), `reject` y `markApplied`. Las transiciones son un único `updateMany` condicional `WHERE id AND projectId AND status = 'PENDING'` que solo escribe `status` y los campos de resolución; si no actualiza nada, se lee el estado y se devuelve `NOT_FOUND`, `PROPOSAL_ALREADY_APPLIED` o `PROPOSAL_REJECTED`. `command`, `summary`, `baseRevision`, `instruction` y autor no cambian nunca. `markApplied` solo persiste un resultado obtenido aplicando de verdad. `reconcileAcceptedOperation` es la única transición excepcional: un `updateMany` condicional `WHERE id AND projectId AND status IN (PENDING, REJECTED)` a `APPLIED` con la revisión aceptada; si la propuesta ya era `APPLIED` no se reescribe (`changed: false`, misma revisión). Solo la invocan los servicios de aplicación y rechazo cuando un recibo o un ACK aceptado prueba el cambio.
- Corrección de Fase 6 (antes de aplicar o compartir la migración): se añadieron `operation` y `diagnostics` (`JSONB NOT NULL`) a la misma migración `20261110170000_add_mentor_proposals`, regenerada con `prisma migrate diff`; el CHECK `MentorProposal_resolution_check` no cambia y admite `REJECTED → APPLIED` porque solo restringe la combinación final de estado y resolución.
- Creación: `buildNewMentorProposal` convierte comando resuelto, vista previa, identidad autorizada e instrucción en el registro persistible. Una vista previa inválida, un diff vacío o una instrucción fuera de 1..500 no producen propuesta.
- No se incluye `mentorInteractionId` en v1: CU-2P-05 no entrega ese identificador y no se modifica su recorder.
- Verificación PostgreSQL: `prisma-mentor-proposal.store.integration.test.ts` (DB-01 a DB-13, más el CHECK y el `Restrict` de usuario) sigue la convención del repositorio (`process.loadEnvFile(".env")`). En la PC donde se implementó no hay `backend/.env` ni PostgreSQL, por lo que la migración no se aplicó y esas pruebas quedan pendientes; el SQL se generó con `prisma migrate diff` desde el esquema anterior y se revisó.

### Errores de dominio y HTTP

| Código | HTTP | Caso |
|---|---|---|
| `INVALID_PROPOSAL` | 422 | Intent mal formado (incluida una salida del modelo que no es un único objeto JSON), campos extra o identificadores, multiplicidad inválida, candidato rechazado por validación canónica |
| `UNSUPPORTED_OPERATION` | 422 | Operación fuera de la allow-list |
| `ELEMENT_NOT_FOUND` | 422 | Clase destino ausente o ambigua |
| `UNKNOWN_TYPE` | 422 | Tipo no resoluble |
| `STALE_PROPOSAL` | 409 | `baseRevision` distinta de la revisión actual |
| `PROPOSAL_ALREADY_APPLIED` | 409 | Apply o reject sobre `APPLIED` |
| `PROPOSAL_REJECTED` | 409 | Apply o reject sobre `REJECTED` |
| — | 403 | VIEWER (`requireEdit`) |
| — | 404 | Sin acceso, proyecto inexistente o propuesta de otro proyecto |
| — | 400 | Cuerpo inválido según el DTO (`instruction` ausente, vacía, > 500, propiedades extra) |
| — | 503 | Modelo local no configurado o no disponible (`MentorProposalGenerationUnavailableError`), cuerpo `{ statusCode, error, message }` como en CU-2P-01, 04 y 05 |
| — | 500 | `MentorProposalDataError` (JSON persistido corrupto): cuerpo genérico, sin JSON, campo, traza ni error de Prisma |

El cuerpo de error sigue el patrón de CU-2P-07: `{ statusCode, error, code, message }`, más `diagnostics` públicos en `INVALID_PROPOSAL` (`toMentorProposalHttpException`). `NOT_FOUND` usa el 404 estándar, idéntico al de un proyecto sin acceso, para no revelar si la propuesta existe en otro proyecto. Los contratos puros solo fijan los códigos; el mapeo HTTP pertenece al controlador.

### Generación estructurada (Fase 7)

`MentorProposalCreationService.create(projectId, user, instruction)`: `requireEdit` → instrucción recortada (1..500) → `ProjectsPersistenceService.findProject` → `MENTOR_PROPOSAL_INTENT_GENERATOR` → `resolveMentorProposal` → `previewMentorProposal` → `buildNewMentorProposal` → `store.create`. Se autoriza antes de inferir, así que VIEWER (403), un usuario sin acceso o un proyecto inexistente (404) nunca invocan el modelo. La vista previa se calcula sobre el documento con `revision` igual a la columna `Project.revision`, la misma que comprueba `ProjectOperationService` al aplicar, por lo que `baseRevision` es siempre la revisión autoritativa. Cualquier fallo anterior a `store.create` no persiste nada; crear nunca llama a `ProjectOperationService`, no cambia revisión ni documento y no genera recibos.

`LocalQwenMentorProposalIntentProvider` usa `generateStructured` del `QueuedLocalTextModel` compartido (cola, timeout y extracción `parseSingleJsonObject` + `grammar.parse` del motor existente) con:

- System prompt corto: generador de propuestas UML estructuradas; sin código, sin identificadores, sin modificar el modelo; solo `ADD_ATTRIBUTE`; si no aplica, `{"operation":"UNSUPPORTED"}`; solo el JSON del schema.
- Contexto mínimo: los nombres de clase del documento autoritativo y la instrucción. Nunca identificadores, atributos, layout ni el documento completo.
- Schema cerrado `MENTOR_PROPOSAL_INTENT_SCHEMA`: `oneOf` de `ADD_ATTRIBUTE` sin multiplicidad, `ADD_ATTRIBUTE` con `multiplicity` (node-llama-cpp trata como obligatorias todas las propiedades listadas, por eso la multiplicidad opcional es una variante) y `UNSUPPORTED` sin texto libre. Todas con `additionalProperties: false` y strings 1..80 (multiplicidad 1..16). `className` es texto libre a propósito: un `enum` de clases forzaría una petición sobre una clase inexistente hacia otra clase; el servidor resuelve el nombre y responde `ELEMENT_NOT_FOUND`.

La salida se valida otra vez con `parseMentorProposalIntent` como dato no confiable: objeto plano, `operation` en la allow-list (si no, `UNSUPPORTED_OPERATION`, incluida la salida `UNSUPPORTED`), claves exactas (cualquier otra, como `classId`, `attributeId` o `command`, es `INVALID_PROPOSAL`), strings no vacíos de una línea dentro de los límites y sin UUID. No repara, completa ni adivina; tipo y multiplicidad siguen siendo texto hasta el resolver. `LocalModelError("INVALID_OUTPUT")` (texto que no es un único objeto JSON conforme) es `INVALID_PROPOSAL`; `NOT_CONFIGURED`, `MODEL_NOT_FOUND`, `RUNTIME_NOT_AVAILABLE`, `INFERENCE_ERROR`, `TIMEOUT`, `BUSY` y la ausencia de modelo son `MentorProposalGenerationUnavailableError` → 503 con el cuerpo de CU-2P-01/04/05. Los logs registran solo etapa y código, nunca instrucción, prompt, salida cruda ni ruta del modelo.

La tarea 7.1 (resolver la forma del criterio de aceptación sin Qwen) no se implementa en esta fase: contradice la decisión de que la intención la genere el modelo local y de no derivar comandos de texto libre de forma heurística. Queda pendiente de decisión explícita.

### Relación con CU-2P-05

CU-2P-05 permanece `READ_ONLY` y sin cambios. La integración futura mostrará "Generar propuesta" solo cuando `requiresUmlChange === true && needsClarification === false`, y CU-06 generará su propia intención estructurada desde la instrucción; nunca convierte `alternatives[]` en comandos. La generación (Fase 7) reutilizará `parseSingleJsonObject` y un schema cerrado propio, con validador estricto equivalente a `parseRecommendation`.

### Relación con CU-2P-07

No se toca la rama de CU-2P-07. Se deja documentada la proyección futura `MentorProposalHistoryProjection = { proposalId, status, summary, createdAt, resolvedAt? }`, leída por proyecto con `requireView`. La integración real se hará tras fusionar CU-06.

## Risks / Trade-offs

- [Aplicar y marcar `APPLIED` en transacciones distintas] → reconciliación por recibo `operationId = proposal.id` antes de reaplicar; la columna `status` es la verdad duradera porque el recibo caduca a las 24 h.
- [Clientes conectados desfasados si no se difunde el ACK] → requisito explícito de la Fase 5; mientras tanto, la siguiente operación de otro cliente recibiría `STALE_REVISION` y resincronizaría.
- [Qwen pequeño produce intents inválidos] → schema cerrado, validación estricta y resolución en servidor; un parser determinista para la forma del criterio de aceptación reduce la dependencia del modelo.
- [Allow-list mínima] → limita la utilidad inicial, a cambio de cerrar el flujo completo con seguridad; las uniones discriminadas permiten ampliarla.
- [Nombres con tildes] → se conservan como se pidieron; el validador canónico los admite. El efecto en generadores posteriores no forma parte de este CU.

## Migration Plan

1. Fase 1: solo contrato puro y OpenSpec; sin migración.
2. Fase 4: migración Prisma aditiva para `MentorProposal` y su enum de estado, sin cambios en tablas existentes.
3. Rollback: retirar el módulo y la migración aditiva; los documentos de proyecto solo cambian mediante operaciones normales, con sus recibos.
