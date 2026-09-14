## Context

`ProjectInvitationsService` ya normaliza emails, bloquea invitaciones duplicadas activas, protege al miembro existente y resuelve token bajo bloqueo transaccional. `ProjectInvitation` ya contiene estado, proyecto, invitador, rol, fechas y tokenHash. La bandeja no expone tokenHash ni token.

## Design

Crear endpoints autenticados bajo `/invitations` para listar PENDING no expiradas del email del actor y resolver una invitación propia por id. La resolución reutilizará una única ruta interna compartida con token: localizará la invitación por id, comprobará email normalizado, estado y expiración, y preservará la creación/upsert de membership al aceptar. Rechazar cambiará a `REJECTED` y no creará membership.

La pantalla `/projects` cargará la bandeja junto a proyectos, mostrará un badge y abrirá un panel/página MUI simple con loading, empty/error state y acciones. Tras aceptar, revalidará proyectos e invitaciones; tras rechazar, solo invitaciones. El link `/invite/[token]` no cambia.

## Realtime

No entra en este change: una notificación dirigida requeriría rooms por usuario fuera de las rooms de proyecto. La revalidación al cargar `/projects` satisface el mínimo sin segundo sistema Socket.IO. Puede evaluarse como extensión posterior reutilizando el gateway de CU-05 con payload de invalidación mínimo.

## Risks

- No aceptar ids ajenos: devolver la misma respuesta no reveladora usada por token inexistente/no autorizado.
- Las invitaciones expiradas no cuentan ni se muestran como PENDING.
- No agregar `REJECTED`: ya existe en Prisma.
