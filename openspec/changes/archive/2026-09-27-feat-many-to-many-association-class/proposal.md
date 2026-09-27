## Why

Una Association UML que pasa a N:M debe expresar la intención mediante una Association Class visible, persistida y reversible, sin perder la Association original ni sus multiplicidades.

## What Changes

- Añadir una transformación atómica que conserva la Association N:M y crea una `UmlClass` asociada sin atributos mediante `associationClassId`.
- Centralizar la detección de multiplicidades múltiples en `uml-core`, conservando `CanonicalUmlModel` como única fuente semántica y `DiagramLayout` como información visual.
- Integrar la transformación con `UmlCommandBus`, realtime, Undo/Redo, persistencia, hydration y proyección del workspace, sin migrar relaciones N:M históricas al abrir proyectos.
- Proyectar la Association Class en una única tabla relacional con PK surrogate técnica generada, dos FKs y unique compuesto; la N:M histórica sin `associationClassId` conserva su join table.
- Generar y validar por el endpoint productivo un ZIP Spring con dos `@ManyToOne`, sin `@ManyToMany` ni `@JoinTable` duplicados.

## Capabilities

### New Capabilities
- `many-to-many-association-class`: Transformación visible, atómica y persistida de asociaciones UML N:M a una clase intermedia.

### Modified Capabilities
- `relational-model`: Interpreta la Association Class explícita como tabla intermedia única.

## Impact

- `uml-core`: modelo, comandos, executor, Command Bus, validación y pruebas.
- Frontend workspace: creación/edición de relaciones, layout de la clase intermedia y pruebas de persistencia/UI.
- `backend realtime` y persistencia: operación determinista y recarga del documento autoritativo.
- No se agregan dependencias, endpoints ni cambios de esquema Prisma.
