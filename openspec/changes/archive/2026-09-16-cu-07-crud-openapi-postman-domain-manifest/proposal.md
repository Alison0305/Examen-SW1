## Why

CU-06 genera un backend Spring Boot estructural y compilable, pero sus controladores y servicios no exponen operaciones funcionales ni contratos consumibles. CU-07 completa esa capacidad sin mezclarla con el frontend ni con el asistente de CUs posteriores.

## What Changes

- Generar una API REST CRUD determinista para las entidades habilitadas, con DTOs, identificadores explícitos en creación, PATCH parcial, errores estructurados, consultas allow-listed y manejo validado de relaciones.
- Transportar al modelo relacional solo los metadatos necesarios para habilitar CRUD, nombres de recurso, búsqueda, ordenamiento y orden estable.
- Generar OpenAPI 3.1 real con springdoc-openapi, una Postman Collection derivada de ese OpenAPI y un Domain Manifest versionado.
- Añadir fixture, compilación y pruebas runtime aisladas con PostgreSQL para demostrar las operaciones y preservar las regresiones de CU-06.

## Capabilities

### New Capabilities

- `generated-crud-api`: API REST funcional y segura para entidades generadas.
- `generated-api-contracts`: OpenAPI 3.1 real y Postman Collection determinista derivada de él.
- `domain-manifest`: manifiesto determinista de capacidades y semántica de dominio para consumidores futuros.

### Modified Capabilities

- `relational-model`: transportar metadatos declarativos necesarios para las capacidades API sin inferencias ambiguas.
- `spring-backend-generator`: producir los artefactos de API, contratos y manifest además del backend estructural existente.

## Impact

- Afectará `uml-core`, `relational-core` y `spring-generator`, sus templates, fixtures y pruebas en la implementación posterior.
- Añadirá dependencias Java para springdoc y pruebas PostgreSQL aisladas, y una herramienta Node de conversión OpenAPI a Postman tras verificar compatibilidad.
- No modifica Prisma, la aplicación NestJS, el frontend generado, IA, voz, Docker ni CUs posteriores durante esta planificación.
