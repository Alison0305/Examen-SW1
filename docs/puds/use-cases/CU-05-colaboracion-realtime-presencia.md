# CU-05 - Colaboracion realtime y presencia

## Objetivo

Incorporar colaboracion realtime autoritativa sobre proyectos persistidos reutilizando JWT, acceso por rol, `UmlCommand`, Command Bus y la revision externa de `Project`.

## Alcance Actual

Los tres incrementos estan aceptados. El Incremento 2 incluye presencia efimera por sala, cliente realtime del workspace, resync y la base de Undo/Redo colaborativo. El Incremento 3 completo su evidencia frontend, multi-cliente, gates, documentacion y prueba manual final. CU-05 esta tecnicamente completado y permanece sin archivar hasta recibir instrucciones explicitas.

## Implementacion Realizada Del Incremento 1

- `ProjectRealtimeGateway` usa Socket.IO con NestJS 11/Fastify, valida el JWT existente en el handshake y deriva el usuario exclusivamente del token.
- El handshake se rechaza mediante middleware Socket.IO antes de establecer la conexión, con `connect_error` uniforme `UNAUTHORIZED` para token ausente, inválido o expirado.
- Las salas usan `project:<projectId>` y se autorizan mediante `ProjectAccessService`; OWNER, EDITOR y VIEWER pueden observar, mientras las mutaciones se autorizan nuevamente mediante `requireEdit`.
- Los envelopes tipados contienen `operationId`, `projectId`, `baseRevision` y `UmlCommand`; no aceptan identidad del cliente.
- `ProjectOperationService` serializa operaciones locales por proyecto, ejecuta `UmlCommandBus` con el documento persistido y conserva los diagnosticos de rechazo. El recibo solicitado no se limpia antes de la consulta transaccional: si venció, se elimina dentro de esa transacción antes de evaluar la revisión.
- `Project.revision` es la revision externa autoritativa. La actualizacion condicionada y la creacion del recibo se realizan en una transaccion antes del ACK y broadcast.
- Se agrego `ProjectOperationReceipt` con recibo minimo JSON, SHA-256 de la intencion canonica, vencimiento de 24 horas, unicidad `(projectId, operationId)`, indice `expiresAt`, limpieza oportunista, replay idempotente y rechazo de colisiones.
- Los eventos definidos son `project.join`, `project.leave`, `project.resync`, `project.operation.apply`, `project.operation.accepted`, `project.operation.rejected`, `project.operation.conflict` y `project.resynced`. Una edicion aceptada difunde solo el comando y revision a su sala, no el documento completo.
- La ruta HTTP `PUT /projects/:id` no fue modificada y conserva la actualización condicionada por `expectedRevision` para OWNER/EDITOR.

## Archivos Principales

- `backend/src/realtime/realtime.contracts.ts`
- `backend/src/realtime/project-realtime.gateway.ts`
- `backend/src/realtime/project-operation.service.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260912120000_add_project_operation_receipts/migration.sql`

## Validaciones Ejecutadas

- `npx prisma generate --schema prisma/schema.prisma`: cliente Prisma normal generado correctamente.
- `npx prisma validate --schema prisma/schema.prisma`: correcto.
- `npx prisma migrate status --schema prisma/schema.prisma`: base de datos al dia con 5 migraciones.
- La migracion `20260912120000_add_project_operation_receipts` crea los 10 campos de `ProjectOperationReceipt`, la unicidad `(projectId, operationId)`, el indice `expiresAt` y la FK con borrado en cascada.
- `npx vitest run src/realtime`: 11/11 correctas, incluidas 2 pruebas de integración sin mocks críticos en `project-realtime.integration.test.ts`.
- La integración inicia `createApp` en puerto efímero, usa `socket.io-client`, registra e inicia sesión de OWNER, EDITOR, VIEWER y NONE mediante HTTP, y usa PostgreSQL/Prisma y `ProjectAccessService` reales.
- La integración prueba handshake inválido y expirado, unión de salas y matriz OWNER/EDITOR/VIEWER/NONE, Command Bus, ACK y broadcast, aislamiento por proyecto, orden de revisiones, recuperación HTTP y resync.
- La integración también prueba recibo persistido, replay, colisión, recibo vencido con revisión antigua, reinicio controlado y carrera de dos clientes con el mismo `operationId`; confirma una sola revisión y un solo recibo.
- Gates backend lint/typecheck/test/build: correctos; 35/35 pruebas backend.
- `uml-core`: 53/53 pruebas correctas. Frontend: 97/97 pruebas correctas. Gates de raíz lint/typecheck/test/build: correctos; 185/185 pruebas.

## Estado Del Incremento 1

Las tareas 1.1 a 1.8 están comprobadas y marcadas. CU-05 sigue abierto: no se implementaron las tareas 2.x ni 3.x, y no se realizó aceptación, verify, archive, commit ni push.

## Implementacion Parcial Del Incremento 2

- `ProjectRealtimeGateway` mantiene presencia solo en memoria por sala y publica identidad minima, avatar, conexion, seleccion, cursor, elemento editado y actividad. Cursor se coalesce a 100 ms y actividad se limita a cinco segundos; estos eventos no usan Prisma, Command Bus, recibos ni revision.
- El workspace usa `socket.io-client`, se une al proyecto, muestra colaboradores, seleccion remota, cursores y estado de conexion/revision. Una confirmacion Socket.IO representa guardado inmediato; no se envia un PUT para esa operacion.
- Conflictos, saltos, reconexion y timeout ambiguo bloquean mutaciones y fuerzan join/resync; no se reemiten operaciones de forma ciega.
- `uml-core` incorpora `RestoreDeletionSnapshot` y la union cerrada para clase con relaciones/layout, enumeracion/layout, relacion/layout, atributo y literal. Captura snapshot solo en eliminaciones aceptadas y restaura mediante Command Bus sobre un candidato clonado; los indices no seguros, negativos, duplicados o fuera de rango se rechazan sin exponer mutacion parcial.
- El historial colaborativo solo agrega snapshots de eliminacion tras ACK local; Undo emite restauracion y Redo reemite la eliminacion como nuevas intenciones. Actualizaciones remotas, conflictos, rechazos y resync lo invalidan.

## Validacion Del Incremento 2

- `uml-core`: 55/55 pruebas correctas, incluidas las cinco variantes de restauracion y rechazo de indice no seguro.
- Backend: 36/36 pruebas correctas al ejecutar el workspace backend aislado; se agrego prueba de presencia, coalescencia de 50 cursores y ausencia de ejecucion UML.
- La validacion fue correcta. Prisma `validate` y `migrate status` confirman cinco migraciones y esquema al dia.
- La prueba manual con OWNER y EDITOR en dos navegadores autorizados fue aprobada para edicion, presencia, conflicto, resync, reconexion y permisos.

## Estado De Tareas

- Las tareas 1.1 a 2.9 y 3.1 a 3.6 estan marcadas: 23/23 en total.
- La tarea 3.2 se completo con una matriz frontend para clase, enumeracion, relacion, atributo y literal. Cada caso verifica que Undo envia `RestoreDeletionSnapshot` indexado como operacion nueva, que Redo reemite la eliminacion semantica con otro `operationId`, y que documento e historial avanzan solo tras ACK. Tambien verifica que el self-broadcast no duplica la operacion local.
- La tarea 3.5 documenta el cierre tecnico y la tarea 3.6 tiene evidencia manual final aprobada. No se realizo archive, commit ni push.

## Verificacion Del Incremento 3

- `npx prisma validate --schema prisma/schema.prisma` y `npx prisma migrate status --schema prisma/schema.prisma`, ejecutados desde `backend`, confirmaron esquema valido, cinco migraciones y base de datos al dia.
- `npm run test --workspace backend`: 39/39 correctas, incluidas las cuatro pruebas Socket.IO/PostgreSQL sin skips ni timeouts.
- `npm run test --workspace frontend`: 105/105 correctas. El runner emite advertencias no bloqueantes de React `act(...)` en componentes de React Flow.
- `npm run test --workspace uml-core`: 57/57 correctas.
- Los gates de raiz `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` fueron correctos. `openspec validate "cu-05-colaboracion-realtime-presencia" --strict` tambien fue correcto.
- Tras completar 3.2, `npm run test --workspace frontend` paso con 110/110 y los gates raiz se repitieron correctamente: backend 39/39, `uml-core` 57/57 y 206/206 pruebas en total; lint, typecheck y build de raiz tambien pasaron.
- Tras el ajuste visual final, los gates frontend se repitieron correctamente: lint, typecheck, build y 110/110 pruebas. Los gates de raiz tambien pasaron: lint, typecheck, build y 206/206 pruebas en total.
- El renderer de cursor remoto mantiene `left` y `top` en las coordenadas efimeras recibidas y desplaza solo el badge de iniciales mediante `translate(8px, 8px)`. Antes usaba `translate(-50%, -50%)`; no altera `ProjectDocument`, `DiagramLayout`, revision, Command Bus ni protocolo Socket.IO.
- Prueba manual final aprobada en el proyecto `Prueba Incremento 2`: OWNER y EDITOR conectados simultaneamente y sincronizados; cada uno creo una clase que el otro recibio sin refresh; OWNER degrado EDITOR a VIEWER/Lector y el cliente quedo readonly sin refresh; OWNER elimino al miembro conectado y el cliente perdio el workspace inmediatamente mostrando `El acceso al proyecto fue revocado`. Esta evidencia se suma a la prueba anterior de Undo/Redo realtime, `RestoreDeletionSnapshot`, presencia, reconnect, persistencia, hot downgrade/removal, readonly VIEWER, room leave y presence cleanup.
- La prueba multi-cliente Socket.IO cubre dos miembros autorizados, presencia, operacion remota, stale/resync, reconexion, degradacion de rol y perdida de membresia sin difundir operaciones protegidas.

## Limitaciones Y Deuda

- `@nestjs/platform-socket.io`, `@nestjs/websockets` y `socket.io` son dependencias de runtime del backend; `socket.io-client` se usa en el cliente realtime del frontend y en pruebas.
- No hay adaptador Socket.IO compartido ni afinidad de sesion para despliegue horizontal; el diseno actual es para una instancia.
- No hay proveedor de cobertura Vitest instalado ni configurado.

## Trabajo Futuro Separado

- Bandeja interna de invitaciones UML Studio: listar invitaciones `PENDING` con badge/contador, proyecto, rol e invitador, y permitir Aceptar/Rechazar. El enlace temporal se mantiene como alternativa y no se agregara SMTP inicialmente. Esta bandeja no forma parte de CU-05.

## Resultado Actual

CU-05 entrega transporte Socket.IO autorizado, persistencia autoritativa, presencia, recuperacion resiliente y Undo/Redo colaborativo comprobados. Esta tecnicamente completado con 23/23 tareas; queda pendiente solamente una instruccion explicita para verify, archive, commit y push. No iniciar CU-06 antes de ese cierre administrativo.
