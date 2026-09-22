## 1. Incremento 1 - Exportación backend autorizada

- [x] 1.1 Agregar al backend principal la dependencia ZIP compatible y un módulo de exportación que reutilice `mapToRelationalModel` y `generateSpringBackend`; verificar instalación, typecheck y ausencia de templates o mapper duplicados.
- [x] 1.2 Implementar el servicio que autoriza lectura, carga el `ProjectDocument` persistido, valida solo `CanonicalUmlModel`, rechaza modelos vacíos/inválidos y genera un ZIP en memoria con rutas y nombre seguros; verificar unitariamente permisos, documento inexistente, diagnósticos, estructura y traversal.
- [x] 1.3 Exponer `POST /projects/:id/exports/spring` con JWT, paquete base validado, headers ZIP y errores seguros; verificar con Supertest autenticado autorización, VIEWER, 404, 400/422, `Content-Type`, `Content-Disposition` y contenido ZIP sin leer `backend/.env`.

## 2. Incremento 2 - Acción y descarga en workspace

- [x] 2.1 Extender el cliente autenticado con una solicitud Blob de exportación y errores HTTP seguros; verificar unitariamente token Bearer, cuerpo limitado, respuesta ZIP y error de red.
- [x] 2.2 Agregar en `WorkspaceAppBar` la acción visible `Generar backend` y diálogo de configuración mínima con paquete base y Java 21 fijo, disponible también para VIEWER; verificar React Testing Library para visibilidad, validación, loading y error sin salir del workspace.
- [x] 2.3 Conectar confirmación de exportación a la descarga Blob con nombre seguro y limpieza de URL temporal; verificar que el click descarga una respuesta simulada y no envía UML ni `DiagramLayout` al backend.

## 3. Incremento 3 - Integración y evidencia final

- [x] 3.1 Agregar una prueba de integración `ProjectDocument` persistido → modelo canónico → relacional → generator → ZIP y verificar entidades, repositorios, servicios, controladores, Gradle y configuración de Rol/Usuario sin usar layout semánticamente.
- [x] 3.2 Ejecutar la prueba manual: crear, guardar y exportar Rol/Usuario con relación válida desde el workspace; extraer ZIP, revisar estructura y compilar con Java 21 y el Gradle disponible o wrapper si existe, registrando límites de PostgreSQL runtime separados de compilación. Aprobada en `Prueba CU06 Backend`: descarga desde navegador, artefactos Rol/Usuario y `gradle compileJava --no-daemon` con `BUILD SUCCESSFUL in 16s`.
- [x] 3.3 Ejecutar tests, typechecks, validación OpenSpec strict y `git diff --check`; actualizar el caso de uso, STATUS y HANDOFF con la evidencia real antes de solicitar aceptación, archive, commit o push.
