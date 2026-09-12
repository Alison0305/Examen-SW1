## Why

CU-03 ya ofrece identidad, persistencia, ownership y revisión optimista, pero aún no permite entrar al producto, gestionar proyectos desde la interfaz ni compartirlos. CU-04 convierte esa base técnica en un flujo usable antes de incorporar la colaboración realtime de CU-05.

## What Changes

- Añadir landing pública, login, registro y sesión frontend basada en el JWT Bearer existente.
- Añadir gestión de proyectos con nombre como metadata, listado ligero, creación, apertura, renombrado, eliminación y workspace persistido.
- Extender la autorización de proyectos con membresías `EDITOR` y `VIEWER`, manteniendo al propietario exclusivamente en `Project.ownerId`.
- Añadir invitaciones seguras con token aleatorio hasheado, expiración, revocación, reinvitación controlada y aceptación o rechazo autenticados.
- Aplicar controles de acceso en frontend, incluido workspace de solo lectura para `VIEWER`, sin crear una segunda ruta de mutación UML.

## Capabilities

### New Capabilities
- `landing-proyectos-membresias-invitaciones`: Flujo de entrada, gestión de proyectos persistidos, roles de acceso, membresías e invitaciones controladas.

### Modified Capabilities
- `persistencia-autenticacion-ownership`: Amplía el acceso exclusivo del propietario para reconocer membresías de proyecto y roles de autorización.

## Impact

- Frontend Next.js App Router y Material UI: rutas públicas/privadas, cliente API centralizado, sesión en `sessionStorage`, listado de proyectos, workspace persistido y UI básica de compartir.
- Backend NestJS/Fastify: endpoints de metadata/listado/eliminación de proyectos, autorización reutilizable, miembros e invitaciones.
- Prisma/PostgreSQL: metadata `Project.name`, membresías, invitaciones, enums, restricciones, cascadas y migraciones compatibles con proyectos existentes.
- Tests frontend, backend e integración; documentación de CU-04 y evidencia de los tres incrementos.
- No cambia la semántica de `uml-core`, el Command Bus, el modelo UML ni las capacidades de generación futuras.
