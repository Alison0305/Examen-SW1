## Why

ShareGrams permite modelar diagramas de clases, pero un desarrollador necesita comprender qué significa una clase o una asociación, qué representan sus multiplicidades, cómo se traduce el modelo al esquema relacional y qué inconsistencias o limitaciones existen. Pedírselo a un LLM con el modelo crudo produce explicaciones que pueden invertir los extremos de una asociación, inventar atributos o afirmar garantías que el esquema no tiene.

ShareGrams trabaja con el subconjunto de diagramas de clases UML 2.5 implementado por su modelo canónico y sus validadores. CU-2P-04 explica ese subconjunto a partir de hechos deterministas, sin que la IA modifique el modelo ni decida por sí misma qué existe en él.

Como en CU-2P-01, el runtime de IA del proyecto es Qwen3 local mediante `node-llama-cpp`; no existe integración de Claude/Anthropic en producción.

## What Changes

- Crear el módulo `mentor-analysis` con la ruta autenticada `POST /projects/:id/mentor/analysis`.
- Construir, a partir del modelo persistido y autorizado, un contexto determinista: fragmento UML del foco, diagnósticos canónicos, hechos relacionales derivados del mapper existente, conflictos detectados y limitaciones conocidas.
- Proyectar ese contexto en un prompt compacto con prioridades y recorte declarado, dentro del presupuesto del modelo local.
- Generar la explicación con el mismo Qwen local compartido por CU-2P-01 y CU-08, mediante un proveedor propio de CU-2P-04.
- Añadir al panel Mentor IA del workspace una sección "Análisis UML" con las acciones "Explicar selección" y "Explicar modelo", de solo lectura.

Flujo: modelo persistido autorizado → análisis determinista → proyección compacta → Qwen local → explicación de solo lectura.

### Alcance

Clases, atributos, asociaciones, multiplicidades, Aggregation, Composition, Generalization, transformación relacional derivable, diagnósticos, conflictos y limitaciones del subconjunto UML implementado.

### Fuera de alcance

- Modificación automática del UML, aplicación de recomendaciones y preview de cambios (CU-2P-06).
- Historial compartido (CU-2P-07) y memoria contextual persistente (CU-2P-03).
- Interfaces, realization, dependency, OCL, navegabilidad y roles de asociación, que ShareGrams no modela.
- Análisis individual de enumeraciones.
- Soporte completo de UML 2.5.

## Capabilities

### New Capabilities

- `uml-contextual-analysis`: análisis y explicación de solo lectura de una clase, una relación o el modelo completo de un proyecto autorizado, fundamentados en hechos deterministas.

### Modified Capabilities

Ninguna. CU-2P-04 consume el modelo local compartido que exporta `AssistantModule` (incorporado por CU-2P-01) sin cambiar su contrato, y amplía el panel Mentor IA con una propiedad opcional que no altera la consulta libre de CU-2P-01.

## Impact

- Backend: nuevo directorio `backend/src/mentor-analysis/` y registro aditivo de `MentorAnalysisModule` en `AppModule`. Sin cambios en `relational-core`, `uml-core`, `backend/src/mentor/` ni `backend/src/assistant/`.
- Frontend: `analyzeUml` y sus tipos en el `ApiClient`, componente `uml-analysis-section.tsx` montado dentro de `MentorPanel` y propagación de la selección desde `WorkspaceClient`.
- Sin cambios de Prisma, migraciones, secretos, variables nuevas, comandos UML ni persistencia.
- Requisitos: RF-12, RF-13 y RF-14 (issue #4).
