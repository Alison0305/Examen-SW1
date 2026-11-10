## 1. Contrato y OpenSpec

- [x] 1.1 Crear el cambio OpenSpec `s2-cu06-aplicar-propuestas-uml` con proposal, design, tasks y la capacidad `mentor-uml-proposals`, usando RF-18 a RF-21 oficiales sin modificar su texto.
- [x] 1.2 Definir el contrato puro `backend/src/mentor-proposals/mentor-proposal.contracts.ts`: allow-list `ADD_ATTRIBUTE`, estados `PENDING`/`APPLIED`/`REJECTED`, solicitud `{ instruction }`, intención sin identificadores, comando resuelto `AddAttribute` con `attributeId` obligatorio, respuesta pública, diff, diagnósticos públicos, códigos de error y proyección futura para CU-2P-07.
- [x] 1.3 Fijar con pruebas estructurales la allow-list, los estados, la separación intención/comando, la ausencia de identificadores en la intención y de datos internos en la respuesta, y el vocabulario del diff.

## 2. Resolver y vista previa pura

- [ ] 2.1 Validar estrictamente un intent desconocido (`unknown`): claves exactas, tipos, longitudes, operación en allow-list, sin identificadores; verificar `INVALID_PROPOSAL` y `UNSUPPORTED_OPERATION`. Pendiente: se hará junto con la generación estructurada (7.x), que es la primera fuente de entrada no tipada; el resolver actual ya rechaza en ejecución una operación fuera de la allow-list.
- [x] 2.2 Resolver `className` a `classId` sobre el documento autoritativo, normalizar el tipo con `normalizePrimitiveTypeName` sin respaldo a `string` y analizar la multiplicidad con un parser estricto; verificar `ELEMENT_NOT_FOUND`, `UNKNOWN_TYPE` y multiplicidad ausente o inválida.
- [x] 2.3 Construir exactamente un `AddAttribute` con `attributeId` asignado por una fábrica inyectable y ejecutar la vista previa sobre una copia con `UmlCommandBus` (`historyLimit: 0`); verificar que el documento original, su revisión y su layout no cambian y que un candidato inválido produce `INVALID_PROPOSAL` con diagnósticos públicos sin `path` ni `elementId`.

## 3. Diff determinista

- [x] 3.1 Implementar una función pura de diff entre `uml` antes y después por identificador; verificar `Cliente.teléfono: string`, la etiqueta con multiplicidad y la estabilidad ante repeticiones.
- [x] 3.2 Integrar el diff en el resultado interno de `previewMentorProposal` y verificar que revisión, timestamps y layout no producen líneas, que no se exponen identificadores y que ninguna entrada se modifica.

## 4. Persistencia `MentorProposal`

- [x] 4.1 Revisar las decisiones de columnas del diseño y añadir el modelo `MentorProposal`, su enum y las relaciones inversas con la migración aditiva `20261110170000_add_mentor_proposals` (incluido el CHECK de la invariante de estado); verificar `prisma validate`, `prisma generate` y el SQL generado con `prisma migrate diff`.
- [x] 4.2 Implementar los parsers estrictos de `command` y `summary` persistidos con `MentorProposalDataError`; verificar JSON válido, corrupto, operación distinta, UUID, tipo, multiplicidad, campos faltantes o extra y líneas de diff inválidas.
- [x] 4.3 Implementar `MentorProposalStore` y `PrismaMentorProposalStore` (creación siempre `PENDING`, búsqueda por `(id, projectId)`, `reject` y `markApplied` condicionales desde `PENDING`, revalidación al leer) y `buildNewMentorProposal` desde la vista previa; verificar con pruebas unitarias y un doble en memoria la invariante de estado, las transiciones bloqueadas, la inmutabilidad de comando y summary, `baseRevision` 10 frente a candidato 11 y `summary` igual al diff.
- [ ] 4.4 Aplicar la migración en PostgreSQL (`prisma migrate`, `migrate status`) y ejecutar `prisma-mentor-proposal.store.integration.test.ts` (DB-01 a DB-13, CHECK y `Restrict` de usuario). Pendiente: la PC de implementación no tiene `backend/.env` ni PostgreSQL; la suite falló con `ENOENT backend/.env` antes de ejecutar sus 12 pruebas.

## 5. Aplicación, concurrencia y tiempo real

- [ ] 5.1 Exportar `ProjectOperationService` y aplicar mediante `apply` con `operationId = proposal.id`, `baseRevision` y comando persistidos; traducir `STALE_REVISION` e `INVALID_OPERATION`.
- [ ] 5.2 Reconciliar por recibo antes de reaplicar y cubrir doble aplicación secuencial y concurrente con una sola revisión nueva.
- [ ] 5.3 Difundir el ACK `ACCEPTED` a la sala del proyecto con la modificación aditiva mínima; verificar que un segundo cliente observa el mismo resultado que una operación del editor.

## 6. API y autorización

- [ ] 6.1 Exponer crear, detalle, aplicar y rechazar con `JwtAuthGuard`, `ParseUUIDPipe`, DTO de `instruction` sin propiedades extra y `requireEdit`; verificar 403 para VIEWER, 404 sin acceso o con propuesta de otro proyecto y los códigos 409/422.
- [ ] 6.2 Verificar que crear y leer el detalle no modifican el documento, que el detalle de una propuesta obsoleta conserva el diff y reporta `STALE_PROPOSAL`, y que rechazar no modifica el modelo.

## 7. Generación estructurada

- [ ] 7.1 Resolver de forma determinista la forma inequívoca del criterio de aceptación ("Agrega el atributo X de tipo T a C") sin invocar Qwen.
- [ ] 7.2 Generar el intent con Qwen local mediante schema cerrado, `parseSingleJsonObject` y validación estricta, con contexto solo por nombres; verificar 503 controlado y ausencia de identificadores.

## 8. Frontend

- [ ] 8.1 Añadir el cliente API y la sección de propuesta con diff, diagnósticos, Aplicar, Rechazar y Cancelar (sin petición), guarda contra doble clic y ocultación para VIEWER; verificar con pruebas de UI.

## 9. Integración con CU-2P-05

- [ ] 9.1 Mostrar "Generar propuesta" solo si `requiresUmlChange && !needsClarification`, manteniendo la recomendación de solo lectura; evaluar si requiere un delta de `mentor-technical-recommendations` y aplicarlo si corresponde.

## 10. E2E y prueba manual

- [ ] 10.1 Probar el criterio "Agrega el atributo teléfono de tipo String a Cliente": propuesta sin modificación, cancelación sin cambios, confirmación con una sola revisión, rechazo, propuesta obsoleta, VIEWER y usuario ajeno; registrar capturas antes y después.
- [ ] 10.2 Ejecutar regresiones del editor UML, Mentor (CU-2P-01 a 05) y generador Spring Boot en las rutas afectadas.

## 11. Integración CU-2P-07 y documentación

- [ ] 11.1 Dejar disponible la lectura por proyecto para `MentorProposalHistoryProjection`; la integración visual se hará en CU-2P-07 tras fusionar CU-06.
- [ ] 11.2 Crear el PUDS de CU-2P-06 y actualizar STATUS y HANDOFF con resultados reales; ejecutar typecheck, lint, tests, build, Prisma, OpenSpec strict y diff-check antes del PR con `Closes #6`.
