## 1. Generated Environment

- [x] 1.1 Generar `compose.yaml` con PostgreSQL, volumen, healthcheck, puerto 5433 y base de desarrollo automática.
- [x] 1.2 Generar `application-docker.properties` y `README.md` coherentes con Docker Compose, Swagger y Postman.

## 2. Verification

- [x] 2.1 Actualizar tests del generador para archivos Docker, propiedades, README y determinismo.
- [x] 2.2 Extender el E2E de exportación para verificar los archivos Docker del ZIP productivo.
- [x] 2.3 Generar y compilar un backend actualizado; si Docker Desktop está disponible, verificar Compose, perfil docker, Swagger, OpenAPI y POST/GET.

## 3. Gates

- [x] 3.1 Ejecutar tests/typecheck/build de spring-generator, E2E/typecheck/build/lint de backend, typecheck raíz, OpenSpec strict y `git diff --check`.
- [x] 3.2 Realizar prueba manual con un ZIP descargado desde la UI antes de archive, commit o push.
