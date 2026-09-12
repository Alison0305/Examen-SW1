## Purpose

Completa el flujo usable desde la landing pública hasta el workspace persistido y permite compartir proyectos mediante roles, membresías e invitaciones seguras sin colaboración realtime.

## ADDED Requirements

### Requirement: Landing pública
El sistema SHALL ofrecer una landing pública en `/` que explique el producto y presente llamadas a acción para registro e inicio de sesión con diseño responsive.

#### Scenario: Visita sin autenticación
- **WHEN** una persona no autenticada abre `/`
- **THEN** puede acceder a las llamadas a acción de registro e inicio de sesión sin requerir JWT.

#### Scenario: Visita autenticada
- **WHEN** una persona con sesión válida abre `/`
- **THEN** puede navegar a `/projects` sin volver a autenticarse.

### Requirement: Sesión frontend con JWT Bearer
El frontend SHALL reutilizar el JWT Bearer existente, conservarlo únicamente en `sessionStorage`, recuperar el usuario mediante `/auth/me`, limpiar la sesión ante `401` y nunca registrar el token.

#### Scenario: Restaurar sesión
- **WHEN** existe un token en `sessionStorage` al iniciar el frontend
- **THEN** el cliente consulta `/auth/me` y restaura la sesión solo si recibe un usuario válido.

#### Scenario: Token no aceptado
- **WHEN** una petición autenticada recibe `401`
- **THEN** el frontend limpia token y usuario de sesión y dirige a login cuando la ruta exige autenticación.

### Requirement: Login y registro desde frontend
El sistema SHALL exponer interfaces en `/login` y `/register` para usar los endpoints de autenticación existentes, mostrar errores de credenciales o validación y redirigir a `/projects` tras éxito.

#### Scenario: Login inválido
- **WHEN** la persona envía credenciales inválidas desde `/login`
- **THEN** la interfaz muestra un error sin exponer detalles internos ni el token.

#### Scenario: Registro exitoso
- **WHEN** la persona registra credenciales válidas desde `/register`
- **THEN** puede iniciar sesión y llega a `/projects`.

### Requirement: Protección y redirección de rutas
El sistema SHALL proteger `/projects`, `/projects/:id/workspace` y las acciones privadas; SHALL enviar usuarios no autenticados a `/login` preservando únicamente un destino interno seguro y SHALL redirigir usuarios autenticados desde `/login` o `/register` a `/projects`.

#### Scenario: Ruta privada sin token
- **WHEN** una persona sin sesión abre una ruta privada
- **THEN** es redirigida a `/login` sin aceptar un destino externo.

#### Scenario: Login con retorno seguro
- **WHEN** una persona inicia sesión desde una redirección hacia una ruta interna privada
- **THEN** vuelve a esa ruta interna después de autenticarse.

### Requirement: Metadata de nombre de proyecto
El sistema SHALL almacenar `Project.name` como metadata separada de `ProjectDocument`, normalizada mediante trim y limitada a 1-100 caracteres; el documento UML SHALL conservar solo su identidad, revisión propia, timestamps, modelo canónico y layout.

#### Scenario: Nombre válido
- **WHEN** se crea o renombra un proyecto con un nombre que, tras trim, tiene entre 1 y 100 caracteres
- **THEN** el nombre se conserva como metadata del proyecto.

#### Scenario: Nombre inválido
- **WHEN** se envía un nombre vacío tras trim o mayor de 100 caracteres
- **THEN** el sistema responde `400` y no altera el proyecto.

#### Scenario: Proyectos anteriores
- **WHEN** se aplica la migración sobre proyectos creados antes de existir `name`
- **THEN** cada fila recibe un nombre de backfill válido equivalente a `Proyecto sin nombre` sin ejecutar `migrate reset`.

### Requirement: Gestión de proyectos
El sistema SHALL permitir listar, crear, abrir, renombrar y eliminar proyectos accesibles mediante `GET /projects`, `POST /projects`, `GET /projects/:id`, `PATCH /projects/:id` y `DELETE /projects/:id`.

#### Scenario: Listado ligero
- **WHEN** un usuario autenticado solicita `GET /projects`
- **THEN** recibe summaries ordenados por `updatedAt` descendente con `id`, `name`, `accessRole`, `revision`, `createdAt` y `updatedAt`, sin incluir todos los documentos UML.

#### Scenario: Creación sin owner controlable
- **WHEN** se crea un proyecto con `{ name, document }` y el cliente incluye `ownerId` o `revision`
- **THEN** la entrada prohibida se rechaza y el propietario/revisión no pueden ser controlados por el cliente.

#### Scenario: Renombrar y eliminar
- **WHEN** el OWNER usa `PATCH /projects/:id` con `{ name }` o `DELETE /projects/:id`
- **THEN** el proyecto se renombra o elimina sin eliminar usuarios.

### Requirement: Workspace persistido
El sistema SHALL abrir `/projects/:id/workspace` cargando el detalle accesible, hidratar el workspace existente desde `ProjectDocument` y conservar el Command Bus como única ruta de mutación semántica local.

#### Scenario: Apertura e hidratación
- **WHEN** un usuario con acceso abre el workspace de un proyecto
- **THEN** el canvas se hidrata desde el `ProjectDocument` recuperado sin convertir React Flow en dominio persistido.

#### Scenario: Guardado optimista
- **WHEN** OWNER o EDITOR guarda el documento modificado
- **THEN** el cliente usa la `revision` externa del detalle como `expectedRevision` en `PUT /projects/:id`.

### Requirement: Conflicto stale visible
El sistema SHALL informar un `409` de guardado como conflicto visible, indicar que hay una versión más reciente y permitir recargar la versión del servidor sin merge automático.

#### Scenario: Guardado stale
- **WHEN** el guardado recibe `409`
- **THEN** el documento local no sobrescribe silenciosamente la versión remota y la interfaz ofrece recargarla.

### Requirement: Roles y autorización de proyectos
El sistema SHALL distinguir `OWNER`, `EDITOR`, `VIEWER` y ausencia de acceso; SHALL devolver `404` para ausencia de acceso y `403` para un miembro con rol insuficiente.

#### Scenario: Acceso ajeno
- **WHEN** un usuario sin ownership ni membership accede a un proyecto
- **THEN** recibe `404` indistinguible de un proyecto inexistente.

#### Scenario: Acción insuficiente
- **WHEN** EDITOR o VIEWER intenta renombrar, eliminar o administrar miembros/invitaciones
- **THEN** recibe `403`.

### Requirement: Membresías de proyecto
El sistema SHALL representar membresías solo para `EDITOR` y `VIEWER`, con unicidad por proyecto y usuario; el OWNER SHALL continuar siendo exclusivamente `Project.ownerId`.

#### Scenario: Administración de miembros
- **WHEN** el OWNER usa `GET /projects/:id/members`, `PATCH /projects/:id/members/:userId` o `DELETE /projects/:id/members/:userId`
- **THEN** puede listar, cambiar entre EDITOR/VIEWER o eliminar membresías sin poder crear OWNER por membership.

#### Scenario: Eliminación de proyecto
- **WHEN** el OWNER elimina un proyecto
- **THEN** sus membresías e invitaciones se eliminan o revocan conforme a la política de cascada, sin eliminar usuarios.

### Requirement: Invitaciones seguras
El OWNER SHALL poder listar, crear y revocar invitaciones; una invitación SHALL contener email normalizado, rol EDITOR/VIEWER, estado, expiración y solo el hash del token.

#### Scenario: Crear invitación
- **WHEN** el OWNER envía email y rol válidos a `POST /projects/:id/invitations`
- **THEN** recibe la invitación y el token una única vez, sin recibir `tokenHash`.

#### Scenario: Miembro existente o pending duplicada
- **WHEN** se invita a un miembro existente o existe una invitación PENDING no expirada para el mismo proyecto y email
- **THEN** el sistema responde `409`.

#### Scenario: Revocar invitación
- **WHEN** el OWNER elimina una invitación pendiente
- **THEN** queda REVOKED con fecha de resolución y no puede aceptarse.

### Requirement: Token y reinvitación controlada
El sistema SHALL generar tokens con al menos 32 bytes criptográficamente aleatorios, guardar solo SHA-256, fijar expiración de siete días y reutilizar el único registro por `(projectId, email)` para reinvitar cuando no exista membership y la invitación previa esté resuelta o expirada.

#### Scenario: Token no filtrado
- **WHEN** se consulta una invitación en listados o detalle
- **THEN** el token en texto plano y `tokenHash` no aparecen ni se registran en logs.

#### Scenario: Reinvitación permitida
- **WHEN** una invitación previa está REJECTED, REVOKED, ACCEPTED sin membership válida o expirada y no hay membership
- **THEN** el registro se actualiza con nuevo hash, rol, expiración, estado PENDING y `resolvedAt` nulo.

### Requirement: Consulta y resolución de invitación
El sistema SHALL requerir JWT para `GET /invitations/:token`, `POST /invitations/:token/accept` y `POST /invitations/:token/reject`; SHALL responder uniformemente `404` para token inválido, revocado, expirado o asociado a otro email.

#### Scenario: Token de otra cuenta
- **WHEN** un usuario autenticado con email distinto consulta o resuelve una invitación
- **THEN** recibe `404` sin conocer detalles de la invitación.

#### Scenario: Aceptación transaccional
- **WHEN** el invitado correcto acepta una invitación PENDING vigente
- **THEN** se crea o confirma transaccionalmente la membership con el rol de la invitación y esta queda ACCEPTED.

#### Scenario: Rechazo y aceptación duplicada
- **WHEN** el invitado correcto rechaza, o intenta resolver otra vez una invitación ya resuelta
- **THEN** el rechazo no crea membership y toda segunda resolución recibe `404`.

### Requirement: Workspace por capacidades
El sistema SHALL permitir a OWNER y EDITOR editar y guardar mediante el workspace existente, y SHALL presentar a VIEWER un workspace de solo lectura coherente.

#### Scenario: VIEWER solo lectura
- **WHEN** un VIEWER abre el workspace
- **THEN** puede ver, zoom, pan y fit, pero controles mutables y guardado están ocultos o deshabilitados y el backend rechaza escritura con `403`.

#### Scenario: EDITOR editable
- **WHEN** un EDITOR abre el workspace
- **THEN** puede ejecutar las mutaciones locales existentes y guardar el documento.

### Requirement: Límites de seguridad y alcance
El sistema SHALL evitar exponer `passwordHash`, secretos, `tokenHash` y `ownerId` innecesario, y SHALL excluir SMTP, refresh tokens, OAuth, colaboración realtime, merge automático, CRDT, OT, Socket.IO, generación, IA, voz, XMI y offline/LAN final.

#### Scenario: Sin colaboración realtime
- **WHEN** se revisa CU-04
- **THEN** no se incorporan sockets, presencia, cursores remotos, broadcast ni edición simultánea.
