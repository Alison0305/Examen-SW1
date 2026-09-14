## Why

La proyección JPA actual de Composition aplica lifecycle fuerte desde la parte hacia el composite, invirtiendo la semántica preservada por el modelo relacional. La corrección debe situar cascade y orphan removal en el aggregate root sin afectar Aggregation ni asociaciones normales.

## What Changes

- Corregir la proyección JPA de lifecycle para Composition 1:N desde el composite hacia sus partes.
- Añadir cobertura estructural de cascade, orphan removal y ausencia de cascade hacia el padre.
- Auditar las asociaciones existentes y validar el pipeline real de generación y compilación.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `spring-backend-generator`: las relaciones Composition deben proyectar lifecycle fuerte exclusivamente desde el composite hacia sus partes, sin alterar Association ni Aggregation.

## Impact

- Afecta el generator Spring, sus pruebas y el backend temporal de revisión manual.
- No modifica `RelationalModel`, Prisma, Docker, migraciones, APIs ni CU-07.
