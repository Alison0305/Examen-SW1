## Context

CU-03 entrega `User`, `Project`, JSONB para `ProjectDocument`, JWT Bearer, rutas protegidas de proyecto y control de revisión atómico por `Project.revision`. El frontend solo dispone del workspace local de CU-02; no tiene sesión, navegación de producto ni proyectos persistidos. Véase `proposal.md` y las specs delta para el comportamiento requerido.

## Goals / Non-Goals

**Goals:**
- Conectar la entrada pública, sesión frontend, gestión de proyectos y workspace persistido.
- Extender el acceso de proyectos a roles compartidos manteniendo una política uniforme.
- Diseñar membresías e invitaciones seguras, auditables y compatibles con los datos de CU-03.

**Non-Goals:**
- No cambiar `uml-core`, `ProjectDocument`, Command Bus ni la proyección React Flow.
- No implementar realtime, presencia, merge, CRDT, OT, Socket.IO, SMTP, refresh tokens, OAuth, generación, IA, voz, XMI, Capacitor ni offline/LAN final.

## Decisions

- **JWT Bearer en `sessionStorage`:** el cliente API centralizado adjunta el token existente; se restaura usuario con `/auth/me`, borra sesión ante `401` y no usa cookies, localStorage ni refresh token. Alternativa descartada: cookies nuevas, que requerirían política CSRF y cambios de sesión fuera del CU.
- **Nombre separado del documento:** `Project.name` es metadata PostgreSQL/Prisma, trim 1-100; `ProjectDocument` sigue compuesto únicamente por identidad/revisión/timestamps/modelo/layout. Alternativa descartada: introducir el nombre en `uml-core`, que contaminaría el dominio UML.
- **Backfill compatible:** la migración futura añade `name` usando un valor válido para filas existentes, como `Proyecto sin nombre`, antes de imponer la columna requerida. No se usa `migrate reset`. Alternativa descartada: columna requerida sin default/backfill, incompatible con filas CU-03.
- **Revisión externa autoritativa:** `Project.revision` de la API sigue siendo el único valor para `expectedRevision`; `ProjectDocument.revision` no controla concurrencia HTTP. Alternativa descartada: usar la revisión interna del documento, que puede divergir de la columna persistida.
- **Autorización centralizada:** un servicio de acceso resuelve proyecto y `OWNER`/`EDITOR`/`VIEWER`/`NONE`; `NONE` se traduce a `404` y un rol conocido insuficiente a `403`. Alternativa descartada: filtros y condiciones duplicadas en controllers.
- **OWNER fuera de memberships:** `Project.ownerId` sigue representando el único OWNER; `ProjectMembership` solo permite EDITOR/VIEWER con unicidad `(projectId,userId)`. Alternativa descartada: duplicar OWNER en membership, que permitiría inconsistencias.
- **Permisos:** OWNER administra metadata, eliminación, miembros e invitaciones; OWNER/EDITOR leen, editan UML y guardan; VIEWER solo lee. El workspace único recibe `accessRole` y deshabilita capacidades, mientras el backend aplica la misma política.
- **Invitación con secreto de un solo retorno:** se genera con `node:crypto` al menos 32 bytes aleatorios, se persiste solo SHA-256 y el valor plano se devuelve exclusivamente al crear o reinvitar. Alternativa descartada: UUID o `Math.random`, insuficientes como secreto.
- **Expiración y reinvitación:** la vigencia es siete días y se evalúa al leer/resolver; no requiere job. Una única fila por `(projectId,email)` se reutiliza con hash/rol/expiración nuevos cuando la invitación previa no es válida y no hay membership. Alternativa descartada: múltiples pending por email, que vuelve ambiguo el token y la UI.
- **Resolución transaccional:** aceptar valida token, estado, expiración y email, crea/upserta membership y marca ACCEPTED en una transacción; rechazar marca REJECTED sin membership. Alternativa descartada: operaciones separadas expuestas a carreras.
- **Sin SMTP:** la UI construye y copia `/invite/:token`; no se integra proveedor de correo en este CU.

## Risks / Trade-offs

- [Filas existentes sin nombre] → migración aditiva con backfill, comprobación de datos y rollback definido antes de aplicar `NOT NULL`.
- [Token en URL puede llegar a historial o referer] → token aleatorio de vida corta, hash persistido, no logs, no respuestas posteriores y navegación sin exponerlo en listados.
- [Bearer en navegador] → solo `sessionStorage`, cliente centralizado, limpieza ante `401`, sin logs ni token persistente entre sesiones.
- [Guardado stale] → `409` visible y recarga explícita; no merge automático.
- [Filtración de existencia] → `404` uniforme para NONE, token inválido, expirado, revocado o email no coincidente; `403` solo para miembro autenticado con rol insuficiente.
- [Carrera al aceptar] → transacción, restricciones únicas y comprobación final de estado/membership.
- [Invitaciones duplicadas] → unicidad `(projectId,email)` y reinvitación como actualización controlada.
- [Eliminar proyecto con dependientes] → relaciones y cascadas explícitas para memberships/invitations, nunca para `User`.

## Migration Plan

1. Añadir `Project.name` con backfill seguro para proyectos CU-03, validar la migración sobre PostgreSQL existente y no usar `migrate reset`.
2. Añadir enums, `ProjectMembership` y `ProjectInvitation` con índices, restricciones únicas y acciones de borrado acordadas.
3. Desplegar autorización y endpoints después de migraciones; los proyectos existentes continúan siendo OWNER-only hasta crear memberships.
4. Rollback: deshabilitar rutas/UI nuevas antes de revertir una migración; preservar `ProjectDocument`, `User` y `Project` existentes. Las invitaciones o memberships creadas requieren migración inversa explícita, no borrado de usuarios.
