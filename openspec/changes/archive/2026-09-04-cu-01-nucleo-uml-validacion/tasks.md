## 1. Incremento 1 — ProjectDocument y modelo base

- [x] 1.1 Crear el workspace `uml-core/` con nombre conceptual `@examen-sw1/uml-core` y verificar que npm lo reconoce como workspace desde la raíz.
- [x] 1.2 Configurar TypeScript, lint, test y build del workspace `uml-core` y verificar que sus comandos locales ejecutan sin errores.
- [x] 1.3 Actualizar los scripts raíz para incluir `uml-core` en `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`, verificando que los workspaces de CU-00 siguen cubiertos.
- [x] 1.4 Definir los contratos base de `ProjectDocument`, `CanonicalUmlModel` y `DiagramLayout`, verificando que el modelo no depende de frontend, backend, React Flow ni persistencia.
- [x] 1.5 Implementar creación de `ProjectDocument` vacío con UUID válido, revisión inicial, timestamps, modelo UML vacío y layout vacío, verificando con tests unitarios.
- [x] 1.6 Implementar generación o provisión controlada de UUID para elementos del núcleo, verificando UUID válidos y soporte para tests deterministas cuando corresponda.
- [x] 1.7 Implementar serialización JSON y reconstrucción desde JSON de `ProjectDocument`, verificando round-trip de documento vacío.
- [x] 1.8 Verificar que modificar posiciones en `DiagramLayout` no altera el contenido semántico de `CanonicalUmlModel` mediante tests unitarios.
- [x] 1.9 Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` desde la raíz para comprobar que el incremento 1 no rompe CU-00.

## 2. Incremento 2 — Dominio UML

- [x] 2.1 Definir visibilidades UML `public`, `private`, `protected` y `package`, verificando tipos y tests de valores soportados.
- [x] 2.2 Definir tipos UML primitivos `string`, `integer`, `boolean`, `number`, `date` y `datetime`, verificando su representación mediante tests.
- [x] 2.3 Definir tipos por referencia a clases y enumeraciones, verificando que se distinguen de los tipos primitivos.
- [x] 2.4 Implementar contratos de `UmlClass`, `UmlAttribute`, `UmlOperation` y `UmlParameter`, verificando clases con atributos, operaciones, parámetros y returnType opcional.
- [x] 2.5 Implementar contratos de `UmlEnumeration` y literales, verificando enumeraciones con visibilidad y packageId opcional.
- [x] 2.6 Implementar contratos de `UmlPackage` con soporte para paquetes anidados mediante referencia a paquete padre, verificando casos con y sin padre.
- [x] 2.7 Implementar `Multiplicity` estructurada con lower y upper finito o ilimitado, verificando casos `1`, `0..1`, `0..*`, `1..*` y `2..5`.
- [x] 2.8 Implementar `UmlRelationship` para Association, Aggregation, Composition y Generalization con UUID propio y sourceId/targetId, verificando cada tipo de relación.
- [x] 2.9 Definir `generationMetadata` separado para clases y atributos, verificando representación declarativa de entity, auditable, readOnly, searchable, crud, required, unique, sortable y defaultSort sin implementar generación.
- [x] 2.10 Verificar round-trip JSON de un documento con clases, enumeraciones, paquetes, relaciones, multiplicidades, layout y generationMetadata.

## 3. Incremento 3 — Motor de validación, demo y documentación

- [x] 3.1 Definir `ValidationResult` y `Diagnostic` con severity, code, message, path y elementId opcional, verificando tests de estructura.
- [x] 3.2 Implementar `validateCanonicalUmlModel(model)` y la validación de `ProjectDocument` cuando corresponda, verificando que un modelo válido no produce errores.
- [x] 3.3 Validar UUID válidos y UUID duplicados, verificando códigos estables como `UML_INVALID_ID` y `UML_DUPLICATE_ID`.
- [x] 3.4 Validar nombres obligatorios y duplicados en clases/enumeraciones por paquete y atributos por clase, verificando diagnósticos con paths navegables.
- [x] 3.5 Validar referencias a paquetes, source/target de relaciones y tipos por referencia, verificando errores para referencias inexistentes.
- [x] 3.6 Validar reglas de Generalization, incluyendo self-reference y ciclos de herencia, verificando orden determinista de diagnósticos.
- [x] 3.7 Validar multiplicidades estructurales, lower negativo, upper finito menor que lower y upper ilimitado permitido, verificando errores y casos válidos.
- [x] 3.8 Validar package padre existente y ciclos entre paquetes, verificando diagnósticos estables.
- [x] 3.9 Validar entradas de `DiagramLayout` contra elementos existentes y verificar que el layout no duplica semántica UML.
- [x] 3.10 Validar revisión de `ProjectDocument` y reglas básicas coherentes de `generationMetadata`, verificando errores y warnings según corresponda.
- [x] 3.11 Asegurar determinismo del validador validando dos veces el mismo modelo y comparando códigos, paths, elementId y orden de diagnósticos.
- [x] 3.12 Crear demo ejecutable `npm run demo:uml` que construya un documento válido, muestre conteos, valide, serialice/reconstruya y ejecute un modelo inválido con diagnósticos.
- [x] 3.13 Crear o actualizar `docs/puds/use-cases/CU-01-nucleo-uml-validacion.md`, `docs/STATUS.md`, `docs/HANDOFF.md` y `README.md` reflejando solo el avance real de CU-01, verificando que no declara cierre antes de aceptación/archive.
- [x] 3.14 Ejecutar verificación final de implementación con `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run demo:uml`, `openspec validate "cu-01-nucleo-uml-validacion" --strict` y prueba manual documentada.
