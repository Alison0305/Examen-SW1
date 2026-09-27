## Why

Las PK surrogate generadas se solicitaban y asignaban durante create, causando errores al persistir entidades generadas.

## What Changes

- Excluir columnas `generated` de DTOs y asignaciones de creación y actualización.
- Conservarlas en entidades y respuestas.

## Capabilities

### New Capabilities

### Modified Capabilities
- `spring-backend-generator`: CRUD respeta columnas relacionales generadas.

## Impact

- `spring-generator` y pruebas de exportación Spring.
