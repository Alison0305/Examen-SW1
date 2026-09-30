## Context

Los backends generados ya incluyen PostgreSQL normal, Swagger UI y un perfil demo H2. Docker Desktop puede no estar activo, por lo que la verificación Docker debe ser condicional y el README debe indicar cómo comprobarlo.

## Decisions

- Generar `compose.yaml` con PostgreSQL, variables de desarrollo no secretas, `POSTGRES_DB`, volumen, healthcheck y puerto host 5433.
- Generar `application-docker.properties` con datasource dirigido a `localhost:5433`, credenciales coherentes con Compose y `spring.jpa.hibernate.ddl-auto=create-drop` para desarrollo local reproducible.
- Generar `README.md` en español con comandos PowerShell: estado Docker, compose up, health, bootRun con perfil docker, Swagger, OpenAPI, Postman, apagado y reinicio.
- Mantener `application.properties` sin activar perfiles, PostgreSQL como modo normal y `application-demo.properties` como H2 independiente.

## Verification

- Tests del generador y E2E inspeccionan todos los archivos y valores relacionados.
- Siempre compilar el backend generado. Si Docker Desktop está activo, ejecutar Compose, Spring en perfil docker, OpenAPI, Swagger y POST/GET; si no, registrar el bloqueo externo sin alterar los artefactos.
