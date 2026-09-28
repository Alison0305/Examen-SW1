## Why

Los ZIP Spring generados exponen OpenAPI, pero no incluyen Swagger UI para explorarla sin configuración manual posterior.

## What Changes

- Incluir Swagger UI en todos los backends Spring futuros mediante el generador centralizado.
- Mantener OpenAPI JSON en `/v3/api-docs` y publicar Swagger UI en `/swagger-ui.html`.
- Reemplazar el starter API de springdoc por el starter UI 3.1.1 y generar su ruta estable.
- Incluir un perfil explícito `demo` con H2 en memoria para ejecutar un ZIP sin PostgreSQL ni credenciales.

## Capabilities

### New Capabilities
- `generated-swagger-ui`: Swagger UI y un perfil demo H2 se generan automáticamente en cada backend Spring.

## Impact

- Afecta `spring-generator`, sus templates, pruebas y el E2E de exportación Spring.
- Mantiene PostgreSQL como modo normal/default; añade H2 únicamente para el perfil demo sin modificar endpoints REST, modelo UML, JPA, CORS, Postman ni Domain Manifest.
