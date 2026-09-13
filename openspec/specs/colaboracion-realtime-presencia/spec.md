# colaboracion-realtime-presencia Specification

## Purpose
Permite que miembros autorizados editen simultáneamente un proyecto UML persistido y observen presencia efímera, manteniendo una única fuente de verdad autoritativa y revisionada.

## Requirements

### Requirement: Conexión realtime autenticada y salas autorizadas
El sistema SHALL autenticar cada conexión realtime con el JWT Bearer existente antes de exponer datos, y SHALL permitir unirse solo a una sala del proyecto para el que el usuario tenga acceso vigente. OWNER, EDITOR y VIEWER podrán observar; solo OWNER y EDITOR podrán emitir operaciones mutables.

#### Scenario: Conexión autenticada autorizada
- **WHEN** un usuario con JWT válido y acceso vigente se une a un proyecto
- **THEN** recibe el estado autoritativo inicial y queda asociado únicamente a la sala de ese proyecto.

#### Scenario: Conexión o sala no autorizada
- **WHEN** falta el JWT, es inválido, expiró o el usuario no puede acceder al proyecto solicitado
- **THEN** el servidor rechaza la conexión o la unión sin exponer documento, presencia ni existencia del proyecto.

#### Scenario: VIEWER intenta mutar
- **WHEN** un VIEWER emite una operación UML mutable
- **THEN** el servidor la rechaza sin alterar documento ni revisión.

### Requirement: Operaciones UML autoritativas y revisionadas
El sistema SHALL recibir una intención UML por operación con un identificador de operación y `baseRevision`, ejecutarla mediante la misma semántica de comando y validación, y asignar una nueva revisión únicamente tras aceptación autoritativa. Para Undo de una eliminación aceptada SHALL admitir `RestoreDeletionSnapshot` como una intención nueva y atómica. Su unión de snapshots SHALL cubrir clase, enumeración, relación, atributo y literal, e incluirá los índices originales de los elementos y layouts en todas las colecciones observables para conservar el orden de clases, enumeraciones, relaciones, atributos, literales y layouts; no SHALL incluir un documento completo ni índices de datos no coleccionables.

#### Scenario: Operación vigente aceptada
- **WHEN** OWNER o EDITOR envía una operación válida cuya `baseRevision` coincide con la revisión autoritativa
- **THEN** el sistema acepta exactamente esa operación, persiste su resultado y comunica el comando aplicado y la nueva revisión a los participantes autorizados.

#### Scenario: Operación inválida
- **WHEN** una operación viola las reglas UML o de validación
- **THEN** el sistema la rechaza con diagnósticos estructurados y conserva documento y revisión.

#### Scenario: Restauración vigente aceptada
- **WHEN** OWNER o EDITOR envía `RestoreDeletionSnapshot` con `baseRevision` vigente y un snapshot que forma un documento UML válido
- **THEN** el sistema restaura todos los elementos y layouts del snapshot en una sola operación, incrementa la revisión una vez y comunica el comando y la nueva revisión.

#### Scenario: Restauración incompatible
- **WHEN** OWNER o EDITOR envía `RestoreDeletionSnapshot` con revisión vigente pero el snapshot contiene IDs existentes, datos incompletos, un índice negativo, no entero, no seguro o fuera del rango de inserción, o produce un documento inválido
- **THEN** el sistema la rechaza con diagnósticos estructurados sin modificar documento, revisión, recibo ni participantes.

### Requirement: Conflicto de revisión, idempotencia y resync
El sistema SHALL exigir un `operationId` nuevo para cada intención nueva y permitir su reutilización solo para reintentar esa misma intención. SHALL autenticar y autorizar cada operación contra el acceso vigente antes de consultar o crear su recibo idempotente. Dentro de la transacción SHALL consultar primero el recibo por `(projectId, operationId)`. Para cada operación aceptada SHALL conservar un `ProjectOperationReceipt` persistente con `id`, `projectId`, `operationId`, `actorUserId`, `baseRevision`, `resultingRevision`, `fingerprint`, ack mínimo, `createdAt` y `expiresAt`; SHALL imponer unicidad en `(projectId, operationId)`. El `fingerprint` SHALL ser SHA-256 determinista de actor, proyecto, `baseRevision` y la representación canónica de `UmlCommand`. Un recibo no expirado con la misma huella SHALL reproducir solo su ack mínimo sin ejecutar ni incrementar revisión; una huella distinta SHALL ser una colisión inválida. Si el recibo encontrado expiró, el sistema SHALL eliminarlo de forma segura dentro de la misma transacción antes de continuar el flujo normal, sin reproducirlo ni reutilizarlo. Después SHALL aplicar la revisión autoritativa, por lo que una `baseRevision` antigua SHALL producir conflicto y resync. Los recibos SHALL expirar a las 24 horas y contar con índice para limpieza oportunista, que no sustituye ese tratamiento transaccional. La actualización condicionada del proyecto y la creación del nuevo recibo SHALL ocurrir en una sola transacción; la unicidad SHALL ser la última defensa de concurrencia y permitir como máximo una ejecución e incremento de revisión para el mismo `(projectId, operationId)`. El sistema SHALL permitir recuperar explícitamente el documento autoritativo con su revisión. No SHALL almacenar recibos dentro de `ProjectDocument` ni mantener un event log; `Project.revision` SHALL ser la revisión autoritativa expuesta por Socket.IO y HTTP y la revisión de `ProjectDocument` SHALL permanecer interna.

#### Scenario: Operación stale
- **WHEN** dos clientes parten de la misma revisión y una operación aceptada adelanta la revisión antes de que llegue la otra
- **THEN** la segunda recibe un conflicto estructurado con la revisión vigente y no sobrescribe el resultado aceptado.

#### Scenario: Restauración stale
- **WHEN** un cliente intenta `RestoreDeletionSnapshot` con `baseRevision` distinta de la revisión autoritativa actual
- **THEN** el sistema responde conflicto estructurado y resync sin ejecutar la restauración, crear recibo ni alterar documento o revisión.

#### Scenario: Reintento de operación aceptada
- **WHEN** el cliente reenvía una operación ya aceptada con el mismo identificador por una desconexión o timeout
- **THEN** tras autenticar y autorizar de nuevo, si la huella SHA-256 coincide con un recibo no expirado, el sistema no la ejecuta ni incrementa la revisión por segunda vez y devuelve solo el ack mínimo ya resuelto.

#### Scenario: Autorización antes de consultar recibo
- **WHEN** un actor sin acceso vigente reintenta un `operationId` que pertenece a un recibo existente
- **THEN** el sistema rechaza la operación sin revelar, reproducir ni crear un recibo.

#### Scenario: Colisión de identificador de operación
- **WHEN** un actor autorizado envía el mismo `(projectId, operationId)` de un recibo no expirado con actor, proyecto, revisión base o comando canónico que producen una huella distinta
- **THEN** el sistema rechaza la operación como inválida sin ejecutar el comando ni alterar documento o revisión.

#### Scenario: Reintento posterior a expiración
- **WHEN** un cliente reenvía un `operationId` después de las 24 horas y su `baseRevision` ya no coincide con `Project.revision`
- **THEN** dentro de la transacción consulta primero el recibo vencido, lo elimina de forma segura, no reproduce su ack y devuelve conflicto estructurado que requiere resync sin alterar documento ni revisión.

#### Scenario: Nueva intención con identificador nuevo
- **WHEN** un cliente emite una intención distinta de un reintento previo
- **THEN** asigna un `operationId` nuevo y el servidor no interpreta la nueva intención como replay del recibo anterior.

#### Scenario: Operación y recibo atómicos
- **WHEN** una operación vigente es aceptada
- **THEN** la actualización condicionada del proyecto, el incremento de `Project.revision` y la creación de su recibo ocurren en una sola transacción, por lo que un ack aceptado siempre es reproducible antes del broadcast.

#### Scenario: Carrera de reintentos duplicados
- **WHEN** dos solicitudes autorizadas con la misma huella compiten para crear el mismo `(projectId, operationId)`
- **THEN** la restricción única actúa como última defensa: como máximo una ejecuta e incrementa la revisión y la que pierde recupera y reproduce el ack mínimo del recibo ganador.

#### Scenario: Recuperación autoritativa
- **WHEN** el cliente recibe conflicto, detecta un salto de revisión o se reconecta
- **THEN** puede solicitar el documento autoritativo completo y reemplaza su copia colaborativa solo con esa respuesta.

### Requirement: Persistencia y difusión ordenada
El sistema SHALL persistir una operación aceptada antes de difundirla como aceptada, y SHALL entregar a cada participante de la sala actualizaciones con revisión monotónica sin enviar el documento completo por cada edición.

#### Scenario: Persistencia antes de broadcast
- **WHEN** una operación autoritativa es aceptada
- **THEN** un cliente que recarga o solicita resync después de recibir la confirmación obtiene el documento y la revisión que incluyen esa operación.

#### Scenario: Difusión aislada por proyecto
- **WHEN** se acepta una operación en un proyecto
- **THEN** solo los participantes autorizados de la sala de ese proyecto la reciben.

#### Scenario: Revisión externa autoritativa
- **WHEN** un cliente obtiene una aceptación por Socket.IO, resync o recuperación HTTP
- **THEN** observa la misma `Project.revision` como revisión autoritativa y no usa la revisión interna de `ProjectDocument` para concurrencia.

### Requirement: Presencia efímera de colaboradores
El sistema SHALL comunicar presencia por proyecto con identidad pública mínima, avatar, estado online/offline, selección, cursor, elemento editado y última actividad. SHALL limitar cursor por participante a un máximo de 10 emisiones por segundo, con intervalo mínimo de 100 ms y coalescencia al estado más reciente; SHALL propagar selección y elemento editado inmediatamente; SHALL limitar actividad a una emisión cada 5 segundos; y SHALL propagar unión y salida inmediatamente. SHALL eliminar o marcar la presencia al desconectar y SHALL mantener todos estos eventos fuera de `ProjectDocument`, de la persistencia de dominio, de la revisión, del Command Bus y de los recibos idempotentes.

#### Scenario: Presencia al unirse y salir
- **WHEN** un usuario autorizado se une o se desconecta de una sala
- **THEN** los demás participantes ven la transición online/offline del colaborador sin cambio de revisión del proyecto.

#### Scenario: Actividad remota
- **WHEN** un participante publica selección, cursor o elemento que está editando
- **THEN** los demás participantes de la misma sala reciben ese estado como presencia visual efímera.

#### Scenario: Cursor coalescido y limitado
- **WHEN** un participante genera 50 eventos de cursor en un segundo
- **THEN** el servidor emite como máximo 10 actualizaciones separadas por al menos 100 ms y conserva para la siguiente emisión el estado más reciente coalescido.

#### Scenario: Presencia inmediata y sin efectos de dominio
- **WHEN** un participante se une, sale, cambia selección o elemento editado, o publica actividad repetida
- **THEN** unión, salida, selección y edición se propagan inmediatamente, actividad se emite como máximo una vez cada 5 segundos y ningún evento altera persistencia de dominio, revisión, Command Bus ni recibos.

### Requirement: UX colaborativa, reconexión y guardado
El workspace SHALL mostrar estado de conexión, revisión sincronizada, colaboradores y presencia remota; SHALL informar conflictos y resync sin sobrescritura silenciosa; y SHALL reconectar y resincronizar antes de reanudar operaciones. Mientras la colaboración esté activa, una operación aceptada representa un guardado inmediato y la UX SHALL reflejar ese estado en lugar de ofrecer un guardado manual divergente. SHALL conservar historial colaborativo solo de operaciones confirmadas, enviar Undo y Redo como nuevas intenciones autorizadas y limpiar historial ante actualización remota, conflicto, rechazo de restauración o resync.

#### Scenario: Desconexión y reconexión
- **WHEN** la conexión realtime se pierde y luego se restablece
- **THEN** la interfaz informa ambos estados, recupera el estado autoritativo antes de habilitar nuevas operaciones y no reenvía ciegamente operaciones ambiguas.

#### Scenario: Conflicto visible
- **WHEN** una operación recibe conflicto de revisión
- **THEN** la interfaz conserva el resultado remoto, informa que la copia local está desactualizada y ofrece resync explícito sin merge automático.

#### Scenario: Estado guardado colaborativo
- **WHEN** una operación local es confirmada por el servidor
- **THEN** la interfaz muestra la revisión confirmada y que el proyecto quedó guardado, sin requerir un PUT manual adicional.

#### Scenario: Historial colaborativo seguro
- **WHEN** el usuario intenta Undo o Redo durante colaboración
- **THEN** la interfaz no sustituye un snapshot local, espera el ACK de la nueva intención y deshabilita o limpia las acciones afectadas ante remoto, conflicto, rechazo o resync.

### Requirement: Límites de alcance de CU-05
CU-05 SHALL limitarse a colaboración Socket.IO autoritativa, presencia y recuperación sobre proyectos existentes; SHALL excluir CRDT, OT, merge automático, edición offline, colas de comandos offline, cursores persistidos, chat, comentarios, generación, IA, voz, XMI, Android y capacidades de CU-06 a CU-11.

#### Scenario: Sin capacidades futuras
- **WHEN** se revisa la entrega de CU-05
- **THEN** no incorpora reglas de generación, asistentes, importación/exportación, operación offline/LAN final ni mecanismos de resolución automática de conflictos.
