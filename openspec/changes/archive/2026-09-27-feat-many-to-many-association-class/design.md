## Context

El modelo actual expresa multiplicidades como `Multiplicity { lower, upper }`, con `upper: "unbounded"` para muchos. `CreateRelationship` y `UpdateMultiplicity` pasan por `UmlCommandBus`, mientras que el mapper convierte N:M directas en join tables implícitas. Ver proposal.md para la motivación.

## Goals / Non-Goals

**Goals:**
- Convertir una intención N:M nueva o editada en una Association Class real vinculada a la Association original dentro de `CanonicalUmlModel`.
- Mantener la operación atómica para historial, persistencia, colaboración y proyección React Flow.
- Usar coordenadas derivadas de los layouts de los extremos solo para ubicar visualmente la nueva clase.
- Mantener pendiente la proyección relacional para Incremento 3.

**Non-Goals:**
- Migrar o modificar automáticamente relaciones N:M directas existentes al abrir documentos.
- Agregar metadata, templates Spring, endpoints, campos FK duplicados o una segunda lógica de generación.
- Implementar capacidades de CU-10, CU-11, XMI, visión, voz o Android.

## Decisions

### Comando canónico dedicado

Se añadirá un comando dedicado para la intención N:M y una función reutilizable de detección por `upper === "unbounded"`. `CreateRelationship` y `UpdateMultiplicity` delegarán en esa transformación cuando corresponda. Esto evita mutaciones aisladas y permite un único snapshot de Undo/Redo. La alternativa de encadenar comandos públicos crearía múltiples entradas de historial y estados intermedios observables.

### Association Class y contrato determinista

El executor conserva la Association N:M, crea una `UmlClass` sin atributos y establece `UmlRelationship.associationClassId`. `UpdateMultiplicity.associationClassId` se genera una vez en la intención frontend y viaja sin reemplazo por realtime, servidor, ACK, persistencia e hydration. Esto evita que cliente y servidor generen UUID distintos, lo que antes causaba `UML_UNKNOWN_REFERENCE` al mover la clase local. La clase se nombra con los extremos en orden de la intención y las relaciones N:M históricas sin vínculo siguen cargándose sin migración automática.

### Layout derivado sin semántica visual

La posición se calcula aproximadamente cerca del punto medio de los extremos y se guarda solo en `DiagramLayout`. React Flow proyecta la clase normal y una rama discontinua derivada de `associationClassId`; esa rama no es una `UmlRelationship` ni tiene multiplicidades.

### Proyección relacional y exportación

Una Association N:M con `associationClassId` reutiliza la tabla de esa clase, crea solo relacionalmente `id BIGINT` con `generated: true`, dos FKs y un unique compuesto. Genera dos `MANY_TO_ONE`; no genera join table ni `MANY_TO_MANY`. La N:M histórica sin vínculo conserva el comportamiento anterior. El endpoint productivo exporta el ZIP, cuya extracción compiló con Java 21 y Gradle 8.14.4.

## Risks / Trade-offs

- [Una colisión puede confundirse con una clase automática previa] → identificar la transformación por sus relaciones y extremos antes de reutilizarla.
- [Editar multiplicidades puede transformar una relación ya persistida] → hacerlo solo ante una acción explícita `UpdateMultiplicity`, nunca durante carga o deserialización.
- [Layouts faltantes o superpuestos] → usar fallback determinista y dejar que auto-layout posterior ajuste la presentación.
- [Relaciones orientadas incorrectamente] → validar con las reglas actuales de FK y pruebas del mapper/generador antes de declarar la implementación completa.

## Migration Plan

1. Añadir el comando y regresiones de núcleo sin migrar documentos existentes.
2. Conectar el workspace y persistir el resultado mediante su flujo normal.
3. Verificar mapper, generador y smoke manual; rollback elimina el comando nuevo sin alterar documentos históricos ya existentes.
