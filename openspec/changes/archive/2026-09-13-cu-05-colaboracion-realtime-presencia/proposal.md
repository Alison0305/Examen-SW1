## Why

CU-04 permite que varios usuarios autorizados abran y editen un proyecto persistido, pero cada cliente aún guarda de forma aislada. CU-05 incorpora colaboración simultánea autoritativa y presencia efímera antes de iniciar las capacidades de generación del Ciclo 3.

## What Changes

- Añadir un canal Socket.IO autenticado con el JWT existente y salas por proyecto autorizadas por los roles existentes.
- Transportar una intención por operación mediante el contrato de `UmlCommand`, aplicar la validación y el Command Bus en el servidor autoritativo, persistir de inmediato y difundir el resultado aceptado con su nueva revisión.
- Rechazar comandos con `baseRevision` obsoleta, duplicados incompatibles o no autorizados; reconocer reintentos idempotentes mediante un recibo persistente acotado por proyecto y ofrecer resync explícito del documento autoritativo sin CRDT, OT ni merge automático.
- Añadir presencia efímera por sala: conexión, desconexión, selección, cursor, elemento editado, última actividad, avatar y estados online/offline, sin alterar `ProjectDocument` ni su revisión.
- Integrar el cliente del workspace con guardado colaborativo, estado de conexión, reconexión, idempotencia y una UX visible para conflictos, resync y presencia remota.
- Definir pruebas de autenticación Socket.IO, autorización por sala, concurrencia, persistencia, broadcast, reconexión, idempotencia, presencia y Undo/Redo colaborativo.

## Capabilities

### New Capabilities
- `colaboracion-realtime-presencia`: Edición simultánea autoritativa por comandos UML y presencia efímera para miembros autorizados de un proyecto.

### Modified Capabilities
- `persistencia-autenticacion-ownership`: Aclara que la autorización de escritura y la revisión optimista existentes se reutilizan también para operaciones colaborativas de OWNER y EDITOR, sin sustituir la persistencia del documento.
- `uml-workspace`: Integra el workspace y su historial local con la sincronización colaborativa, manteniendo el Command Bus como ruta de mutación semántica.

## Impact

- Backend NestJS/Fastify: gateway Socket.IO, verificación JWT durante el handshake, autorización de proyecto, ejecución autoritativa de comandos, persistencia Prisma ya existente y resync.
- Frontend Next.js: cliente `socket.io-client` ya aprobado por el producto, estado de conexión, comandos remotos, presencia y UX de recuperación en el workspace.
- Contratos compartidos: envelopes de comando, revisiones, resultados, errores de conflicto y presencia, sin convertir React Flow en dominio ni persistir presencia.
- Pruebas backend, frontend e integración multi-cliente. No incluye CRDT/OT/merge automático, generación, IA, voz, XMI, Android ni offline/LAN final.
