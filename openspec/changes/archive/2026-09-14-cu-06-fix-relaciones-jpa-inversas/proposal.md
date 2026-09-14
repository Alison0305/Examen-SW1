## Why

La generación de relaciones JPA inversas puede asociar una entidad ajena a una relación 1:1, produciendo metadatos semánticamente inválidos que `compileJava` no detecta. Se requiere limitar cada lado inverso a los dos participantes reales de la relación UML.

## What Changes

- Corregir la resolución de campos inversos JPA para relaciones 1:1.
- Añadir una regresión estructural que compruebe el owning side, el inverse side y la ausencia de campos inversos en entidades no participantes.
- Regenerar y auditar la fixture representativa de CU-06 sin modificar el archive original.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `spring-backend-generator`: las relaciones JPA inversas deben corresponder exclusivamente a los participantes de la relación relacional que las origina.

## Impact

- Afecta `spring-generator/src/generator.ts` y sus pruebas.
- No cambia el modelo UML, el mapper relacional, Prisma, Docker ni los CUs posteriores.
