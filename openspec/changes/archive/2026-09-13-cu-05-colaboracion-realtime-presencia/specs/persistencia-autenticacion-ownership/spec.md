## MODIFIED Requirements

### Requirement: Revisión optimista de proyectos
El sistema SHALL requerir `expectedRevision` para toda escritura persistida de `ProjectDocument`, autorizarla únicamente a OWNER o EDITOR y realizar una actualización atómica condicionada por `id` y revisión actual. Las operaciones colaborativas autorizadas SHALL reutilizar `Project.revision` como la misma revisión externa autoritativa sin confiar en la revisión interna del documento. Una `baseRevision` distinta SHALL resolverse como conflicto antes de ejecutar el comando; una operación con revisión vigente que falla su validación SHALL resolverse como rechazo sin persistencia. Dentro de la transacción colaborativa, tras autenticar y autorizar, SHALL consultar primero el recibo por `(projectId, operationId)`; si expiró, SHALL eliminarlo de forma segura antes de aplicar el flujo normal de revisión. Cuando una operación colaborativa aceptada, incluida `RestoreDeletionSnapshot`, cree un recibo idempotente, SHALL actualizar el proyecto y crear el recibo en la misma transacción; la unicidad `(projectId, operationId)` SHALL ser la última defensa y permitir como máximo una ejecución e incremento de revisión concurrentes.

#### Scenario: Actualización vigente
- **WHEN** OWNER o EDITOR envía una escritura con `expectedRevision` coincidente con la revisión actual del proyecto
- **THEN** el documento se guarda y la revisión pasa de 1 a 2.

#### Scenario: Actualización desactualizada
- **WHEN** `expectedRevision` no coincide con la revisión actual
- **THEN** el sistema responde 409 con conflicto estructurado para recargar, sin sobrescribir documento ni alterar revisión.

#### Scenario: Operación colaborativa autorizada
- **WHEN** una operación realtime válida de OWNER o EDITOR parte de la revisión autoritativa vigente
- **THEN** su persistencia incrementa la misma revisión externa una sola vez y queda disponible al recuperar el proyecto.

#### Scenario: Fallo de escritura atómica con recibo
- **WHEN** falla la transacción que actualiza el proyecto y crea el recibo de una operación colaborativa
- **THEN** no queda ni documento/revisión actualizados ni recibo reproducible de esa operación.

#### Scenario: Recibo vencido y revisión antigua
- **WHEN** la transacción encuentra un recibo vencido para un reintento cuyo `baseRevision` es anterior a `Project.revision`
- **THEN** elimina el recibo vencido de forma segura, continúa con la comprobación de revisión y responde conflicto sin actualizar el documento ni la revisión.

#### Scenario: Restauración rechazada no persiste
- **WHEN** una restauración colaborativa con revisión vigente es rechazada por el validador
- **THEN** no actualiza `ProjectDocument` ni `Project.revision`, no crea recibo y no deja una operación reproducible.
