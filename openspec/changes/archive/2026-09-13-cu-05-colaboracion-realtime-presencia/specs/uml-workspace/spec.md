## MODIFIED Requirements

### Requirement: Historial local Undo y Redo
El sistema SHALL mantener historial local de operaciones aceptadas con Undo y Redo, límite inicial configurable de 100 operaciones y limpieza de Redo cuando se ejecuta un comando nuevo después de Undo. Para una eliminación aceptada de clase, enumeración, relación, atributo o literal, SHALL capturar un `DeletionSnapshot` exacto y acotado. La unión SHALL conservar el elemento eliminado y su índice original en toda colección observable: clases, enumeraciones y relaciones; atributos en su clase; literales en su enumeración; y layouts eliminados en `layout.elements`. Un snapshot de clase SHALL incluir además cada relación incidente y su índice original, y sus layouts eliminados e índices originales; los de enumeración y relación SHALL incluir sus layouts eliminados e índices originales; los de atributo y literal SHALL incluir respectivamente `classId` o `enumerationId`, el valor completo eliminado y su índice original. No SHALL capturar snapshot ni historial para un comando rechazado. El sistema SHALL exponer `RestoreDeletionSnapshot` únicamente para restaurar ese snapshot como una operación atómica validable: SHALL rechazar determinísticamente todo índice que no sea entero seguro o esté fuera del rango de inserción de su colección, y SHALL conservar el documento sin cambios si falla ese control, la existencia de contenedores/IDs, referencias o la validación completa. En un workspace colaborativo, Undo SHALL solicitar esa restauración como intención autorizada nueva con `operationId` nuevo y la revisión confirmada, y Redo SHALL solicitar una operación semántica nueva con otro `operationId`; ninguna acción SHALL modificar directamente el estado autoritativo. Una actualización remota aceptada, conflicto, rechazo de restauración o resync SHALL invalidar el historial local que ya no corresponde a la revisión actual.

#### Scenario: Historial de comando aceptado
- **WHEN** un comando se ejecuta correctamente
- **THEN** el estado anterior queda disponible para Undo dentro del historial local.

#### Scenario: Undo restaura estado anterior
- **WHEN** el usuario ejecuta Undo después de una operación aceptada
- **THEN** el `ProjectDocument` vuelve al estado anterior correspondiente.

#### Scenario: Redo restaura estado siguiente
- **WHEN** el usuario ejecuta Redo después de Undo
- **THEN** el `ProjectDocument` vuelve al estado posterior correspondiente.

#### Scenario: Comando nuevo limpia Redo
- **WHEN** el usuario ejecuta un comando nuevo después de Undo
- **THEN** el historial de Redo se limpia.

#### Scenario: Límite de historial
- **WHEN** el historial supera el límite configurado de operaciones
- **THEN** el sistema conserva solo las operaciones más recientes dentro de ese límite.

#### Scenario: Estado habilitado de Undo y Redo
- **WHEN** no hay estados disponibles para Undo o Redo
- **THEN** las acciones correspondientes aparecen deshabilitadas o no ejecutan cambios.

#### Scenario: Undo o Redo colaborativo
- **WHEN** un usuario ejecuta Undo o Redo en una revisión colaborativa vigente
- **THEN** Undo de una eliminación envía `RestoreDeletionSnapshot` y Redo una operación semántica nueva, cada una con `operationId` nuevo, y solo cambia el workspace tras confirmación autoritativa.

#### Scenario: Historial invalidado por actualización remota
- **WHEN** el workspace recibe una operación remota aceptada, conflicto, rechazo de restauración o aplica un resync
- **THEN** invalida Undo y Redo locales que fueron construidos sobre una revisión anterior.

#### Scenario: Restauración atómica y ordenada de eliminación aceptada
- **WHEN** el usuario solicita Undo de una eliminación de clase, enumeración, relación, atributo o literal previamente aceptada
- **THEN** el sistema restaura mediante `RestoreDeletionSnapshot` todos los elementos UML y layouts contenidos en el snapshot, en sus índices originales para cada colección observable, o no restaura ninguno si el candidato no es válido.

#### Scenario: Índice de restauración inválido
- **WHEN** `RestoreDeletionSnapshot` contiene un índice negativo, no entero, no seguro o fuera del rango de inserción de la colección correspondiente
- **THEN** el sistema lo rechaza determinísticamente con diagnóstico estructurado, sin mutar documento ni historial.

#### Scenario: Eliminación rechazada
- **WHEN** una eliminación de clase, enumeración, relación, atributo o literal es rechazada por validación o referencias
- **THEN** el sistema no crea `DeletionSnapshot` ni entrada de historial para restaurarla.
