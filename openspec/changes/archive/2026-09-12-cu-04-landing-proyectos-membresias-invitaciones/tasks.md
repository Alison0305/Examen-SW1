## 1. Incremento 1 — Landing, autenticación y sesión frontend

- [x] 1.1 Crear cliente API y estado de sesión JWT en `sessionStorage`, con `/auth/me`, limpieza ante `401` y verificación mediante tests unitarios.
- [x] 1.2 Implementar landing pública responsive en `/` con CTAs a autenticación y verificar su renderizado en pruebas frontend.
- [x] 1.3 Implementar `/login` contra la API existente, loading/error states y redirección tras éxito; verificar login válido e inválido.
- [x] 1.4 Implementar `/register` contra la API existente, loading/error states y redirección tras éxito; verificar registro válido e inválido.
- [x] 1.5 Implementar guardias de rutas privadas, retorno interno seguro, redirección de usuarios autenticados y logout; verificar cada transición.
- [x] 1.6 Aplicar estados de carga, error y responsive básico a landing y auth, verificando navegación usable en viewport pequeño.
- [x] 1.7 Ampliar pruebas frontend para landing, sesión, login, registro, logout y protección de rutas sin exponer tokens.
- [x] 1.8 Ejecutar gates del incremento y documentar evidencia real, variables y límites de sesión sin declarar CU-04 completado.

## 2. Incremento 2 — Gestión de proyectos y workspace persistido

- [x] 2.1 Añadir `Project.name` con validación trim 1-100, migración compatible y backfill de proyectos existentes; verificar sin `migrate reset`.
- [x] 2.2 Implementar `GET /projects` con ProjectSummary OWNER, orden `updatedAt DESC` y sin documentos completos; verificar integración PostgreSQL.
- [x] 2.3 Evolucionar `POST /projects` a `{ name, document }`, manteniendo owner/revisión no controlables; verificar respuestas y entradas inválidas.
- [x] 2.4 Implementar `PATCH /projects/:id` para renombrado exclusivo OWNER, con validación y respuestas `400`/`404` correctas, sin incrementar `Project.revision` y con tests HTTP.
- [x] 2.5 Implementar `DELETE /projects/:id` exclusivo OWNER sin eliminar usuarios; verificar autorización y limpieza de dependientes disponible.
- [x] 2.6 Implementar `/projects` con listado, creación, renombrado, eliminación, empty/loading/error states y responsive; verificar pruebas frontend.
- [x] 2.7 Implementar `/projects/:id/workspace` para cargar detalle e hidratar el workspace existente desde `ProjectDocument`; verificar que Command Bus sigue siendo la mutación local.
- [x] 2.8 Implementar guardado por PUT con `Project.revision` externa como `expectedRevision` y UX de `409` con recarga explícita; verificar stale sin sobrescritura.
- [x] 2.9 Agregar pruebas backend, frontend e integración para CRUD, ownership, resumen, workspace persistido y conflicto stale.
- [x] 2.10 Ejecutar gates del incremento y documentar endpoints, migración/backfill, pruebas manuales y limitaciones reales.

## 3. Incremento 3 — Membresías, roles e invitaciones

- [x] 3.1 Añadir enums, `ProjectMembership` y `ProjectInvitation` con migración, unicidades, índices y cascadas; verificar esquema y migración PostgreSQL.
- [x] 3.2 Implementar autorización reutilizable que resuelva OWNER/EDITOR/VIEWER/NONE y traduzca NONE a `404` y rol insuficiente a `403`; verificar matriz de permisos.
- [x] 3.3 Ampliar GET/listado/PUT de proyectos para memberships, `accessRole` y edición OWNER/EDITOR; verificar que no se duplican proyectos.
- [x] 3.4 Implementar API OWNER de miembros para listar, cambiar EDITOR/VIEWER y eliminar, sin crear OWNER por membership; verificar HTTP.
- [x] 3.5 Implementar API OWNER de invitaciones para listar, crear y revocar sin exponer `tokenHash`; verificar HTTP y autorización.
- [x] 3.6 Implementar generación segura, SHA-256, expiración de siete días y reinvitación por reutilización del registro; verificar token, `409` pending y no filtración.
- [x] 3.7 Implementar consulta, aceptación y rechazo autenticados de invitación con validación de email y transacción; verificar token inválido/expirado/ajeno, accept y reject.
- [x] 3.8 Extender `/projects` para proyectos compartidos y `accessRole`, con orden estable y tests de OWNER/EDITOR/VIEWER.
- [x] 3.9 Implementar UI OWNER de compartir, miembros e invitaciones, incluyendo copiar enlace y revocar; verificar estados loading/error/empty.
- [x] 3.10 Implementar `/invite/:token` con retorno seguro desde login/register y acciones aceptar/rechazar; verificar navegación y errores uniformes.
- [x] 3.11 Aplicar VIEWER read-only y EDITOR editable en el workspace existente, con backend y frontend coherentes; verificar controles y guardado prohibido/permitido.
- [x] 3.12 Ejecutar gates finales, pruebas manuales, validación OpenSpec y documentación de CU-04, sin archivar antes de aceptación explícita.
