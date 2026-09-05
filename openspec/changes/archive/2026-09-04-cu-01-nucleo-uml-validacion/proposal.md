## Why

CU-01 establece el núcleo semántico que necesitan los CUs posteriores para editar, validar, persistir, colaborar y generar aplicaciones desde UML sin depender del canvas ni de detalles de UI. Es necesario ahora porque CU-02 debe construir Command Bus, Undo/Redo y workspace manual sobre un modelo canónico ya estable y validable.

## What Changes

- Se introducirá un workspace reutilizable `uml-core/` en la raíz del monorepo, con nombre conceptual `@examen-sw1/uml-core`.
- Se definirá `ProjectDocument` como contenedor de `CanonicalUmlModel` y `DiagramLayout`, manteniendo semántica y layout separados.
- Se modelarán los elementos necesarios para diagramas UML de clases según el alcance inicial basado en UML 2.5.1.
- Se representarán tipos primitivos y referencias a clases/enumeraciones de forma diferenciada.
- Se representarán multiplicidades mediante estructura `lower`/`upper`, no como texto libre.
- Se agregará una representación separada para metadatos propios del generador, sin mezclarlos con UML estándar.
- Se definirá serialización JSON y reconstrucción sin pérdida de información.
- Se creará un único motor de validación determinista con diagnósticos estructurados.
- Se planificará una demo ejecutable desde la raíz mediante `npm run demo:uml` para validación manual del núcleo.
- Se mantendrán fuera de alcance React Flow, canvas, Command Bus, Undo/Redo, persistencia, colaboración, generación, IA, voz, XMI y Capacitor.

## Capabilities

### New Capabilities
- `nucleo-uml-validacion`: núcleo semántico reutilizable para documentos UML, layout separado, serialización JSON y validación determinista con diagnósticos estructurados.

### Modified Capabilities
- Ninguna.

## Impact

- Código: se agregará el workspace `uml-core/` y, durante la implementación, se ajustarán los scripts raíz para incluirlo en lint, typecheck, test y build.
- APIs internas: se expondrán contratos TypeScript reutilizables para `ProjectDocument`, `CanonicalUmlModel`, `DiagramLayout`, dominio UML y validación.
- Tests: se agregarán pruebas unitarias del núcleo UML y deberán seguir pasando los tests existentes de CU-00.
- Documentación: al implementar se deberá crear o actualizar `docs/puds/use-cases/CU-01-nucleo-uml-validacion.md` y actualizar estado operativo sin declarar implementación antes de verificarla.
- Dependencias: no se anticipan dependencias de CUs futuros; cualquier dependencia técnica deberá justificarse explícitamente y mantenerse mínima.
