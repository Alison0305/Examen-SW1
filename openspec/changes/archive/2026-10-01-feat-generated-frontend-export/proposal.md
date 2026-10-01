## Why

El generador frontend existe, pero la herramienta no permite exportar un proyecto frontend autónomo desde el mismo modelo canónico que usa el backend Spring.

## What Changes

- Exportar un ZIP frontend independiente mediante un endpoint autenticado de proyectos.
- Añadir un control azul sin texto entre el asistente textual UML y los breadcrumbs del workspace.
- Exportar un perfil autónomo CRUD-first sin assistant, voz ni dependencias `file:` hacia el monorepo.

## Capabilities

### New Capabilities
- `generated-frontend-export`: Exportación de un frontend Next.js CRUD autónomo derivado del CanonicalUmlModel persistido.

## Impact

- Afecta frontend-generator, backend projects y la sidebar del workspace; no elimina ni degrada los perfiles existentes con assistant/voz.
- Conserva generación Spring, Docker PostgreSQL, H2 demo, Swagger, OpenAPI, Postman y CORS explícito.
