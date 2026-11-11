# CU-2P-06 - Revisar y aplicar una propuesta IA sobre el modelo UML

## Estado

Completado en la rama `feat/s2-cu06-aplicar-propuestas-uml` (issue #6), sin fusionar. OpenSpec activo en `openspec/changes/s2-cu06-aplicar-propuestas-uml/`, válido en modo `--strict` y con todas sus tareas cerradas (7.1 retirada). El caso de aceptación funciona con Qwen real, PostgreSQL, realtime y dos navegadores reales. Queda la integración: PR con `Closes #6`, merge a `main` y archivo del OpenSpec.

## Objetivo Y Alcance

Permitir que el Mentor IA proponga un cambio al modelo UML que el desarrollador revisa y confirma antes de que se aplique.

- **RF-18:** el sistema recibe de la IA propuestas de cambios UML en una estructura conocida y validable.
- **RF-19:** el sistema muestra una vista previa del cambio antes de aplicarlo.
- **RF-20:** el sistema solicita confirmación del desarrollador antes de modificar el modelo.
- **RF-21:** el sistema ejecuta los cambios mediante los comandos y validadores existentes y registra su resultado.

Alcance v1: una única operación, `ADD_ATTRIBUTE` (agregar un atributo a una clase existente).

## Dependencias

- CU-2P-01: panel Mentor y modelo local Qwen compartido (`ASSISTANT_LOCAL_MODEL`).
- CU-2P-02: identidad derivada del JWT y `ProjectAccessService`.
- CU-2P-05: recomendaciones técnicas `READ_ONLY` con `requiresUmlChange`; CU-2P-06 ofrece iniciar una propuesta desde ellas.
- Colaboración CU-05 (primer parcial): `ProjectOperationService`, recibos de operación e idempotencia, y el gateway realtime.

## Flujo

```text
instrucción del usuario
  → requireEdit (antes de inferir)
  → Qwen local, generación estructurada con schema cerrado
  → MentorProposalIntent (solo nombres, sin identificadores)
  → validación estricta y de nombres literales (un único reintento)
  → resolveMentorProposal (classId del documento, attributeId del servidor)
  → previewMentorProposal (UmlCommandExecutor sobre una copia) y diff determinista
  → MentorProposal PENDING (sin tocar el modelo)
  → tarjeta de revisión: Aplicar / Rechazar / Cancelar
  → Aplicar: ProjectOperationService.apply (operationId = id de la propuesta)
  → ACK realtime project.operation.accepted → el diagrama cambia una sola vez
```

## Decisión De API

| Método | Ruta | Resultado |
|---|---|---|
| POST | `/projects/:projectId/mentor/proposals` (`{ instruction }`, 1..500) | 201 `PENDING` |
| GET | `/projects/:projectId/mentor/proposals/:proposalId` | detalle; `STALE_PROPOSAL` si la revisión cambió |
| POST | `.../:proposalId/apply` (sin cuerpo) | 200 `APPLIED` |
| POST | `.../:proposalId/reject` (sin cuerpo) | 200 `REJECTED` |

Todas usan `JwtAuthGuard`, `ParseUUIDPipe` y `requireEdit`: OWNER y EDITOR pueden operar, VIEWER recibe 403 y un usuario sin acceso recibe 404. La respuesta pública contiene `id`, `status`, `baseRevision`, `operation` por nombre, `preview` (`valid`, `diff`, `diagnostics`), `createdAt`, `resolvedAt?` y `resultingRevision?`. Nunca expone el comando persistido, identificadores UML internos, la instrucción, el autor, recibos, prompts ni salida del modelo.

Errores: `INVALID_PROPOSAL`, `UNSUPPORTED_OPERATION`, `ELEMENT_NOT_FOUND` y `UNKNOWN_TYPE` → 422; `STALE_PROPOSAL`, `PROPOSAL_ALREADY_APPLIED` y `PROPOSAL_REJECTED` → 409; modelo local no disponible → 503 con el cuerpo de CU-2P-01/04/05; cuerpo inválido → 400.

## Implementación Realizada

- **Contrato** (`mentor-proposal.contracts.ts`): intención generada separada del comando resuelto; allow-list `ADD_ATTRIBUTE`; estados `PENDING`, `APPLIED` y `REJECTED` (una propuesta obsoleta sigue `PENDING`); diff y diagnósticos públicos.
- **Resolver y vista previa**: la clase se resuelve por nombre sobre el documento autoritativo (ambigua o inexistente → `ELEMENT_NOT_FOUND`), el tipo con la tabla de sinónimos de `uml-core` sin respaldo a `string` y la multiplicidad con un parser estricto. El `attributeId` lo genera el servidor al crear la propuesta; la vista previa ejecuta ese mismo comando con el executor y el validador reales sobre una copia, y el diff se calcula entre ambos modelos.
- **Persistencia**: entidad `MentorProposal`, migración aditiva `20261110170000_add_mentor_proposals` con un CHECK de la invariante de estado. Las transiciones son actualizaciones condicionales desde `PENDING`, y los JSON se revalidan al leer.
- **Aplicación**: solo `ProjectOperationService.apply` con `operationId` igual al id de la propuesta, la revisión base y el comando persistidos (autorización de edición, cola por proyecto, control de revisión, recibo e idempotencia). Un recibo aceptado es la verdad autoritativa: si una aplicación concurrente o interrumpida ya se ejecutó, la propuesta se reconcilia a `APPLIED` y nunca se reaplica. El ACK aceptado se difunde a la sala con el gateway existente.
- **Generación con Qwen** (`LocalQwenMentorProposalIntentProvider`):
  - usa `generateStructured` del modelo local compartido, con un schema cerrado (`ADD_ATTRIBUTE` con clase, atributo y tipo, o `UNSUPPORTED` sin texto libre) y el contexto mínimo: solo los nombres de clase;
  - un prompt corto y restrictivo, con la regla de copia literal y un único ejemplo acentuado;
  - la salida se valida como dato no confiable: claves exactas, sin identificadores ni campos extra, nunca se repara ni se completa;
  - `attributeName` debe aparecer literalmente en la instrucción; `className`, ignorando solo mayúsculas;
  - un único reintento si un nombre no es literal; si persiste, `INVALID_PROPOSAL` con el diagnóstico `NON_LITERAL_NAME`.
- **Frontend**:
  - el botón «Proponer cambio UML» en el panel Mentor y `MentorProposalCard` con operación, clase, atributo, tipo, diff, diagnósticos, revisión base y estado;
  - Cancelar solo oculta la tarjeta, sin petición: la propuesta sigue `PENDING`;
  - Rechazar llama a reject; Aplicar llama a apply con guarda contra doble clic;
  - la respuesta HTTP no modifica el diagrama: el único cambio llega por el ACK realtime, deduplicado por `operationId`, y sin conexión realtime se ofrece «Recargar versión»;
  - los errores se traducen a textos fijos.
- **Integración CU-2P-05**: una recomendación con `requiresUmlChange` verdadero y sin aclaración pendiente muestra «Generar propuesta UML» a usuarios con edición. La instrucción enviada es la consulta del usuario que produjo la recomendación, mostrada antes de enviarla; las alternativas no se reutilizan porque pueden omitir el tipo. El resto del flujo es el mismo de CU-2P-06. La recomendación sigue siendo de solo lectura (delta MODIFIED de `mentor-technical-recommendations`).
- **Preparación para CU-2P-07** (tarea 11.1): `MentorProposalHistoryService.list(projectId, userId, limit)` con `requireView`, la lectura `MentorProposalHistoryStore.listByProject` (solo ese proyecto, más reciente primero, límite 1..50) y la proyección pública `MentorProposalHistoryProjection`. No incluye ruta HTTP, cursor ni UI.

## Seguridad

- Qwen no genera UUID, `classId`, `attributeId` ni comandos; no escribe el documento ni decide revisiones.
- El cliente envía solo `{ instruction }` al crear; apply y reject no leen cuerpo.
- Se autoriza antes de inferir: VIEWER, usuarios ajenos y proyectos inexistentes nunca invocan el modelo.
- Ningún fallo anterior a la persistencia crea filas, modifica el UML o genera recibos.
- Los logs del proveedor registran solo etapa y código, nunca la instrucción, el prompt, la salida cruda ni la ruta del modelo.

## Errores Encontrados Y Correcciones

- **Multiplicidad inventada** (validación real): con una variante del schema con `multiplicity`, Qwen3-1.7B la elegía siempre y la rellenaba con `"*"`, por lo que toda propuesta se rechazaba. La generación v1 ya no expone multiplicidad al modelo; el backend conserva su soporte interno.
- **Tildes perdidas**: Qwen convertía `teléfono` en `telefono`. La validación literal lo detecta y no se corrige en código. Un ejemplo con otro nombre acentuado («dirección») no bastó; con el ejemplo de «teléfono» en el prompt el caso pasa y el comportamiento generaliza (`teléfono` en otra clase, `código`, `género`).
- **Clase en minúsculas** (prueba con navegadores): «…a cliente» se rechazaba porque Qwen devuelve el nombre real `Cliente`. La clase se compara ahora sin distinguir mayúsculas pero sí tildes, y el rechazo explica el motivo con `NON_LITERAL_NAME`.
- **Parser determinista retirado** (tarea 7.1): no se implementa; toda instrucción pasa por Qwen y nunca se derivan comandos de texto libre de forma heurística.

## Pruebas Automatizadas

- `mentor-proposals`: 326/326 (contratos, resolver, vista previa, diff, JSON persistido, store, aplicación, rechazo, consulta, creación, proveedor Qwen con modelo simulado, controlador HTTP con el módulo real, módulo y proyección de historial). Incluye PostgreSQL real: store 14 casos (DB-01 a DB-15), aplicación 3 y creación 8.
- Frontend: 260/260, con 44 de CU-2P-06 (panel, tarjeta, cliente API y página con realtime simulado, incluida la ausencia de doble mutación y la integración CU-2P-05).
- Backend completo sin las suites de modelos reales: 724 correctas y 3 omitidas (Vosk real). `mentor*` 571/571, `realtime` 21/21, `uml-core` 85/85 y `spring-generator` 57/57.

## Pruebas Reales

Con Qwen3-1.7B-Q8_0, PostgreSQL y clientes Socket.IO reales (2026-11-10):

- «Agrega el atributo teléfono de tipo String a Cliente»: 3 de 3 ejecuciones limpias con 201 `PENDING`, salida `{"operation":"ADD_ATTRIBUTE","className":"Cliente","attributeName":"teléfono","attributeType":"String"}` sin reintento, diff `Cliente.teléfono: string`, revisión sin cambios y 0 recibos. Aplicar una: 200 `APPLIED`, revisión 1 → 2, `resultingRevision` 2, un recibo, un único ACK y un solo atributo.
- «Agrega el atributo telefono de tipo string a cliente»: 3 de 3 con 201 sobre `Cliente`; aplicar funciona igual.
- Cancelar: la propuesta sigue `PENDING` sin cambios ni recibos. Rechazar: `REJECTED` sin cambios, y aplicar después responde 409 `PROPOSAL_REJECTED`. `STALE_PROPOSAL`: tras otra operación no se aplica ni se ajusta `baseRevision`. Segundo apply: 409 `PROPOSAL_ALREADY_APPLIED`. Estas pruebas se hicieron antes del ejemplo acentuado, con instrucciones que indicaban la multiplicidad.
- Dos clientes Socket.IO (OWNER y EDITOR) recibieron exactamente un `project.operation.accepted` por operación.
- Prueba visual con dos navegadores (aprobada por el usuario): sesiones distintas, OWNER en A y EDITOR en B en el mismo workspace. El UML no cambió antes de Aplicar; el cambio aplicado en A apareció una sola vez en A y en B por realtime sin recargar, sin doble mutación, y tras recargar ambos mostraron el mismo estado persistido.

## Limitaciones De V1

- Solo `ADD_ATTRIBUTE`.
- Qwen no genera multiplicidad; el contrato, el resolver y el parser estricto la conservan internamente.
- Se exige que `attributeName` aparezca literalmente en la instrucción y `className` ignorando solo mayúsculas; un único reintento por pérdida de literalidad.
- El ejemplo del prompt coincide con el criterio de aceptación; la validación literal sigue siendo la garantía para cualquier otro nombre.
- Sin ruta HTTP ni interfaz de historial de propuestas: corresponden a CU-2P-07.

## Archivos Principales

- Backend: `backend/src/mentor-proposals/` (contratos, intención, proveedor Qwen, resolver, vista previa, diff, store Prisma, servicios de creación, consulta, aplicación, rechazo e historial, controlador y módulo) y `backend/prisma/migrations/20261110170000_add_mentor_proposals/`.
- Frontend: `frontend/app/workspace/mentor-proposal-section.tsx`, `mentor-panel.tsx`, `workspace-client.tsx`, `frontend/app/projects/[id]/workspace/page.tsx` y `frontend/app/auth/api.ts`.

## Commits

`a2d99a5`, `ac2aafa`, `a268312`, `efa30eb`, `cfe6e57`, `3cb97e5`, `841008d`, `16880cc`, `f38ab79`, `4d56160`, `d30d557`, `17b0403`, `f4e2d11` y `1ce8811`, más el commit de documentación de cierre.
