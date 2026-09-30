## Why

Los ZIP Spring generados requieren preparar PostgreSQL manualmente para usar el modo normal. Un entorno Docker reproducible reduce esa preparación sin sustituir PostgreSQL ni el perfil demo H2.

## What Changes

- Generar `compose.yaml`, configuración Spring `docker` y README en español en cada ZIP futuro.
- Permitir levantar PostgreSQL local en el puerto 5433 con base, volumen y healthcheck automáticos.
- Documentar comandos PowerShell para Docker Compose, Spring, Swagger y Postman.

## Capabilities

### New Capabilities
- `generated-docker-postgresql`: Backends Spring generados incluyen un entorno Docker PostgreSQL reproducible para desarrollo local.

## Impact

- Afecta templates, generator, pruebas y E2E de exportación Spring.
- PostgreSQL sigue como modo normal y H2 demo permanece independiente.
