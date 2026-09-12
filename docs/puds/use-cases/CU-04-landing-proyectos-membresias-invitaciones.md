# CU-04 - Landing, gestion de proyectos, membresias e invitaciones

## Objetivo

Completar el flujo desde la entrada al producto hasta el workspace persistido y compartir proyectos de forma controlada.

## Incremento 1 completado

- Landing publica responsive en `/`.
- Login y registro con los endpoints existentes.
- Sesion frontend JWT Bearer solo en `sessionStorage`, recuperada mediante `/auth/me` y limpiada ante `401`.
- Logout, guardias de rutas privadas y retorno seguro limitado a rutas internas.
- Prueba manual satisfactoria.

## Incremento 2 completado y aceptado manualmente

### Persistencia y API

- `Project.name` es metadata separada de `ProjectDocument`; se normaliza con trim y acepta 1 a 100 caracteres.
- La migracion `20260909100000_add_project_name` realiza backfill seguro con `Proyecto sin nombre` y deja la columna `NOT NULL`.
- CRUD owner-only: `GET /projects`, `POST /projects`, `GET /projects/:id`, `PUT /projects/:id`, `PATCH /projects/:id` y `DELETE /projects/:id`.
- Las respuestas exponen `accessRole: "OWNER"` y no exponen `ownerId`.
- PATCH cambia solo el nombre y no incrementa `Project.revision`; DELETE elimina el proyecto y conserva el usuario.

### Gestion de proyectos y workspace

- `/projects` cubre loading, error/retry, empty state, listado, crear, renombrar, eliminar y abrir workspace.
- El workspace persistido esta en `/projects/:id/workspace` y reutiliza `WorkspaceClient`, `WorkspaceAppBar`, React Flow, store y Command Bus de CU-02; no existe editor duplicado.
- La hidratacion usa `resetWorkspaceStore(detail.document)`: reemplaza el documento, limpia Undo/Redo, seleccion y diagnostics; no es undoable ni genera dirty.
- `SessionProvider` usa `SessionApi = Pick<ApiClient, "login" | "register" | "me">`; `SessionContext` no expone Projects, que usan el `ApiClient` centralizado.

### Guardado y concurrencia

- Guardado manual, sin autosave, con documento actual del store y estados clean, dirty y saving.
- `Project.revision` es la revision HTTP autoritativa; `ProjectDocument.revision` es independiente y no se usa como `expectedRevision`.
- El listener opcional notifica cambios persistibles por `applyCommand`, Undo, Redo y movimiento; seleccion y no-op no notifican ni hay doble notificacion.
- Un save exitoso actualiza la revision externa y no limpia Undo/Redo.
- Un `409` conserva documento, revision e historial locales, sin retry, overwrite ni merge automaticos; ofrece `Recargar version`.
- La recarga confirma perdida de cambios, obtiene la version servidor, actualiza revision, ejecuta `resetWorkspaceStore`, limpia historial y vuelve a clean.

## Pruebas

- Prueba manual aprobada: login, crear `Prueba Incremento 2`, abrir su workspace, crear `Clase1`, verificar dirty, guardar, volver al listado, reabrir y confirmar persistencia, renombrar a `Prueba Incremento 2 Renombrado` y eliminar con confirmación; el otro proyecto permaneció intacto.
- Corrección CORS: `backend/src/create-app.ts` declara origin `http://localhost:3000`, métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` y headers `Authorization`/`Content-Type`; la regresión verifica preflight OPTIONS para PUT/PATCH/DELETE.
- Corrección ApiClient: `Content-Type: application/json` se añade solo cuando existe body; DELETE no lleva body ni ese header y el `204 No Content` no intenta invocar `response.json()`.
- Frontend: 85/85; backend: 19/19; `uml-core`: 53/53; total: 157/157.
- Gates de raiz: lint, typecheck, test y build correctos. Prisma validate y migrate status correctos con 2 migraciones.

## Cierre Formal

- Estado: completado y aceptado manualmente.
- Prueba manual integral: aprobada para roles, membresías, invitaciones, aceptación/rechazo y acceso al workspace.
- Corrección final: VIEWER permanece en solo lectura incluso ante drag; conserva selección, zoom, pan y ajustar vista.
- Al eliminar una membresía, el usuario deja de poder listar, abrir o guardar el proyecto compartido.
- Gates finales: lint, typecheck, test y build de raíz correctos; frontend 97/97, backend 24/24 y `uml-core` 53/53, total 174/174.
- Prisma: `validate` y `migrate status` correctos, con 4 migraciones aplicadas.
- OpenSpec: 30/30 tareas, validación strict correcta y specs sincronizadas antes del archivo.
- Alcance excluido: SMTP, sockets, realtime, presence y CU-05.

## Limitaciones

- Incremento 3, segundo tramo backend: la migracion aplicada `20260912110000_add_project_invitations` agrega `ProjectInvitation` y estados `PENDING`/`ACCEPTED`/`REJECTED`/`REVOKED`, con unicidad proyecto/email y cascade al eliminar el proyecto.
- `GET`/`POST`/`DELETE /projects/:id/invitations` son solo OWNER; `GET /invitations/:token` y sus acciones `accept`/`reject` requieren JWT. Tokens son 32 bytes base64url, persisten solo como SHA-256 y no se incluyen en listados o lecturas.
- La reinvitacion reutiliza la fila expirada o resuelta con hash, rol, expiracion y estado nuevos. La aceptacion bloquea la fila dentro de transaccion, crea la membership y resuelve la invitacion; el rechazo no crea membership.
- Pruebas HTTP/PostgreSQL cubren autorizacion, normalizacion, hashing, privacidad, duplicados, expiracion, revocacion, reinvitacion, accept/reject y doble aceptacion concurrente. Backend: 24/24 tests correctos.
- Frontend técnico completado: el listado muestra Propietario/Editor/Lector y solo OWNER ve acciones administrativas. OWNER puede gestionar miembros e invitaciones con los endpoints reales, crear enlaces temporales copiados al portapapeles y revocarlos. `/invite/[token]` está protegido y acepta/rechaza con retorno a proyectos y mensaje uniforme ante token no disponible.
- El workspace reutiliza `WorkspaceClient`; VIEWER no puede guardar, mutar mediante toolbox, inspector, drag, auto-layout, Undo ni Redo. El bloqueo del store impide mutaciones persistibles incluso fuera de los controles; selección, zoom, pan y ajustar vista siguen disponibles. OWNER y EDITOR permanecen editables.
- Pruebas frontend: 90/90, incluidas roles amigables, acciones OWNER, endpoints de invitación, aceptación/rechazo y VIEWER sin mutaciones. Backend: 24/24. Lint, typecheck y build frontend correctos; Prisma validate/migrate status correcto.
- No se implementaron SMTP, sockets, realtime ni CU-05.
