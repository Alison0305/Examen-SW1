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

### Cancelar frente a rechazar

Cancelar o cerrar la vista previa es solo del cliente: sin petición, sin cambio de estado y sin cambio UML. Rechazar es `POST .../reject`: transición condicional `PENDING → REJECTED` persistida, sin tocar el documento. Una propuesta rechazada no puede aplicarse (`PROPOSAL_REJECTED`). El issue #6 no exige motivo, por lo que no se añade.

### API

| Método | Ruta | Cuerpo | Resultado |
|---|---|---|---|
| POST | `/projects/:projectId/mentor/proposals` | `{ instruction }` (string, `trim`, 1..500) | `MentorProposalResponse` (`PENDING`) |
| GET | `/projects/:projectId/mentor/proposals/:proposalId` | — | `MentorProposalResponse` |
| POST | `/projects/:projectId/mentor/proposals/:proposalId/apply` | vacío | `MentorProposalResponse` (`APPLIED`) |
| POST | `/projects/:projectId/mentor/proposals/:proposalId/reject` | vacío | `MentorProposalResponse` (`REJECTED`) |

El cuerpo de creación no admite `userId`, `projectId`, `baseRevision`, comando ni UUID; el DTO rechaza propiedades extra. La revisión base procede del proyecto cargado por el servidor. Apply y reject no aceptan cuerpo con datos de operación.

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

### Aplicación mediante `ProjectOperationService`

CU-06 no escribe `Project.document`. Apply invoca `ProjectOperationService.apply(userId, { operationId: proposal.id, projectId: proposal.projectId, baseRevision: proposal.baseRevision, command: proposal.command })`, reutilizando `requireEdit`, cola por proyecto, control de revisión, recibo e idempotencia. Respuestas: ACK → `APPLIED` con `resultingRevision = ack.revision`; `STALE_REVISION` → `STALE_PROPOSAL`; `INVALID_OPERATION` → `INVALID_PROPOSAL` con diagnósticos.

Idempotencia y doble aplicación, por capas: guarda síncrona en el cliente; transición condicional `updateMany({ where: { id, projectId, status: "PENDING" } })`; y recibo con `operationId = proposal.id`. Como la transacción de `ProjectOperationService` es propia, aplicar y marcar el estado no son atómicos entre sí: antes de aplicar se consulta el recibo `(projectId, operationId = proposal.id)` y, si existe, se marca `APPLIED` con su ACK en lugar de reaplicar (reconciliación dentro de la ventana del recibo). La integración exacta se cierra en la Fase 5.

### Tiempo real (pendiente técnico)

Una aplicación exitosa debe ser observable por los clientes conectados igual que una operación normal del editor. No se crea una segunda infraestructura: en la Fase 5 se decidirá la modificación aditiva mínima para exportar `ProjectOperationService` desde `RealtimeModule` y difundir el ACK `ACCEPTED` a la sala del proyecto.

### Persistencia `MentorProposal` (diseño; se implementa en la Fase 4)

Entidad separada; no se extiende `MentorInteraction`. Campos previstos:

| Campo | Obligatorio | Motivo |
|---|---|---|
| `id` (uuid) | Sí | Identidad pública y `operationId` del recibo |
| `projectId` (FK `Project`, cascade) | Sí | Aislamiento; búsqueda por `(id, projectId)` |
| `authorUserId` (FK `User`, restrict) | Sí | Autor de la solicitud, como `MentorInteraction.userId` |
| `authorEmail` | Sí | Instantánea para CU-2P-07, como `MentorInteraction.authorEmail` |
| `instruction` | Sí | Trazabilidad de la solicitud (no se expone en la respuesta CU-06) |
| `baseRevision` | Sí | Detección de obsolescencia |
| `status` (enum, por defecto `PENDING`) | Sí | Ciclo de vida |
| `command` (Json) | Sí | Fuente de verdad única para vista previa y aplicación |
| `summary` (Json, diff) | Sí | Diff mostrado al crear; base de la proyección CU-2P-07 |
| `createdAt` | Sí | Orden y trazabilidad |
| `resolvedAt` | No | Solo `APPLIED` o `REJECTED` |
| `resolvedByUserId` (FK `User`, restrict) | No | Quién aplicó o rechazó; puede no ser el autor |
| `resultingRevision` | No | Solo `APPLIED` (= `ack.revision`) |

Invariantes: `PENDING` ⇔ `resolvedAt` y `resolvedByUserId` nulos; `APPLIED` ⇒ `resultingRevision` presente; `REJECTED` ⇒ `resultingRevision` nulo. Índices previstos: `(projectId, createdAt, id)` para la futura proyección y `(authorUserId)`. No se incluye `mentorInteractionId` en v1: CU-2P-05 no entrega ese identificador y no se modifica su recorder. La decisión final sobre cada columna se revisa antes de la Fase 4 y requiere una migración aditiva.

### Errores de dominio y HTTP

| Código | HTTP | Caso |
|---|---|---|
| `INVALID_PROPOSAL` | 422 | Intent mal formado, campos extra o identificadores, multiplicidad inválida, candidato rechazado por validación canónica |
| `UNSUPPORTED_OPERATION` | 422 | Operación fuera de la allow-list |
| `ELEMENT_NOT_FOUND` | 422 | Clase destino ausente o ambigua |
| `UNKNOWN_TYPE` | 422 | Tipo no resoluble |
| `STALE_PROPOSAL` | 409 | `baseRevision` distinta de la revisión actual |
| `PROPOSAL_ALREADY_APPLIED` | 409 | Apply o reject sobre `APPLIED` |
| `PROPOSAL_REJECTED` | 409 | Apply o reject sobre `REJECTED` |
| — | 403 | VIEWER (`requireEdit`) |
| — | 404 | Sin acceso, proyecto inexistente o propuesta de otro proyecto |
| — | 400 | Cuerpo inválido según el DTO (`instruction` ausente, vacía, > 500, propiedades extra) |
| — | 503 | Generación estructurada no disponible (Fase 7), como en CU-2P-01, 04 y 05 |

El cuerpo de error sigue el patrón de CU-2P-07: `{ statusCode, error, code, message }`, más `diagnostics` públicos cuando correspondan. Los contratos puros solo fijan los códigos; el mapeo HTTP pertenece al controlador.

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
