# CU-2P-04 - Analizar y explicar un modelo UML 2.5

## Estado

Segundo parcial. Implementación funcional completa en `feat/s2-cu04-analisis-uml`; pendiente la ejecución de la suite real con Qwen y la revisión manual en navegador antes del PR y del cierre del issue #4. OpenSpec: `openspec/changes/s2-cu04-analisis-uml/`.

## Objetivo

Permitir que el Mentor IA explique clases, atributos, asociaciones, multiplicidades y su transformación relacional a partir del modelo persistido del proyecto, sin inventar elementos y sin modificar el diagrama.

ShareGrams trabaja con el subconjunto de diagramas de clases UML 2.5 implementado por su modelo canónico y sus validadores; este CU explica ese subconjunto y no afirma soporte completo de UML 2.5.

## Alcance

- RF-12: consultar clases, atributos, asociaciones y multiplicidades.
- RF-13: representación estructurada del modelo para el Mentor.
- RF-14: observaciones sin modificar el diagrama.

Analiza clases, atributos, asociaciones, multiplicidades, Aggregation, Composition, Generalization, la transformación relacional derivable, diagnósticos, conflictos y limitaciones del subconjunto implementado.

Fuera de alcance: modificar el UML, aplicar recomendaciones o previsualizar cambios (CU-2P-06), historial compartido (CU-2P-07), memoria contextual persistente (CU-2P-03), interfaces, realization, dependency, OCL, navegabilidad, roles de asociación, análisis individual de enumeraciones y soporte completo de UML 2.5.

## Caso De Uso

**Actor:** Desarrollador (OWNER, EDITOR o VIEWER del proyecto).

**Precondición:** el desarrollador tiene sesión y acceso al proyecto, y el proyecto tiene un modelo UML persistido.

**Disparador:** el desarrollador pulsa "Explicar selección" con una clase o relación seleccionada, o "Explicar modelo".

**Flujo principal:**

1. El desarrollador selecciona una clase o una relación en el editor, o elige analizar el modelo completo.
2. ShareGrams verifica el acceso y recupera el modelo persistido del proyecto en el servidor.
3. Construye el fragmento estructurado del foco.
4. Valida el UML con el validador canónico y deriva los hechos relacionales con el mapper existente.
5. Genera un prompt compacto con los hechos, diagnósticos, conflictos y limitaciones.
6. Qwen local produce la explicación.
7. La interfaz muestra la explicación, el diagnóstico, el aviso de contexto resumido y las observaciones deterministas.
8. El modelo no se modifica.

**Excepciones:**

| Excepción | Resultado |
|---|---|
| Modelo vacío | Aviso "El modelo UML está vacío."; no se llama a Qwen |
| Elemento eliminado | Aviso "El elemento seleccionado ya no existe en el modelo."; no se busca por nombre |
| ID inválido | Aviso "No se pudo identificar correctamente el elemento seleccionado." |
| Referencia inconsistente | Aviso "El modelo contiene una referencia inconsistente que impide analizar este elemento." |
| Contexto demasiado grande | Se muestran los hechos deterministas; solo la explicación no se genera |
| Mentor IA no configurado o no disponible | "El Mentor IA no está disponible en este momento." (503) |
| Modelo persistido inválido | "El modelo del proyecto no es válido para analizarlo." (422) |

## Criterio De Aceptación Principal

Al seleccionar una asociación 1:N, el Mentor explica correctamente ambos extremos, la multiplicidad y su impacto relacional, sin invertir source/target, sin inventar atributos y sin modificar el diagrama.

Los hechos que respaldan este criterio están cubiertos por pruebas automáticas. Existe una suite real específica para validarlo con Qwen (`uml-analysis-qwen.real.integration.test.ts`, con tres repeticiones del caso 1:N y el caso con extremos invertidos); su ejecución está pendiente, por lo que el criterio todavía no está validado con Qwen real.

## Decisiones

- La IA no decide qué existe: clases, multiplicidades, FK, nulabilidad, tablas intermedias, diagnósticos y limitaciones se calculan de forma determinista y se devuelven separados de la explicación.
- Se reutilizan `CanonicalUmlModel`, `validateCanonicalUmlModel` y `mapToRelationalModel` sin duplicar sus reglas; el validador canónico es la única fuente de diagnósticos UML (se descartan los `REL_UML_*` del mapper).
- CU-2P-04 tiene su propio proveedor (`UML_ANALYSIS_AI_PROVIDER`) y no usa `MENTOR_AI_PROVIDER`, pero comparte el mismo `ASSISTANT_LOCAL_MODEL` que CU-2P-01 y CU-08: un solo modelo en memoria y una sola cola.
- La entrada es la selección, no texto libre.
- Si Qwen falla, el servicio responde 503, igual que CU-2P-01.

## Implementación Realizada

- `backend/src/mentor-analysis/`: fragmento UML, hechos relacionales, contexto, prompt compacto, contratos y adaptador de IA, servicio, DTO, controlador y `MentorAnalysisModule`, registrado en `AppModule`.
- Ruta `POST /projects/:id/mentor/analysis` con `JwtAuthGuard`, `ParseUUIDPipe` y `UmlAnalysisBodyPipe`. Orden: `requireView` → `findProject` → contexto → prompt → proveedor.
- Multiplicidades: para `Cliente` (source, `1`) y `Pedido` (target, `0..*`), el prompt dice "Por cada Cliente: 0..* Pedido." y "Por cada Pedido: 1 Cliente.". Se derivan de los extremos del fragmento, no de la dirección visual.
- Presupuesto: `MAX_PROMPT_CHARACTERS = 8960`, calculado como (4096 − 256 de salida − 256 de plantilla y margen) × 2,5 caracteres por token. Es una aproximación conservadora, no una medición con el tokenizer real de Qwen.
- Recorte por prioridades P3 → P2 → P1; P0 nunca se recorta. Si P0 no cabe: `CONTEXT_TOO_LARGE` y no se llama a Qwen.
- Frontend: el panel Mentor IA tiene dos funciones independientes, la consulta libre (CU-2P-01) y la sección "Análisis UML" (CU-2P-04) con "Explicar selección" y "Explicar modelo". Las enumeraciones no se analizan individualmente. El resultado es de solo lectura y no ofrece aplicar cambios.

## Contrato

Solicitud: `POST /projects/:id/mentor/analysis` con JWT Bearer y `{ "focus": { "kind": "class" | "relationship", "id": "<uuid>" } }` o `{ "focus": { "kind": "model" } }`. No se aceptan otras propiedades.

Respuesta 200: `projectRevision`, `focus` (`kind`, `id`, `name`), `analysis` (`facts`, `diagnostics`, `conflicts`, `limitations`, `summary`), `explanation` (`text`, `contextTruncation`) y `diagnostic` opcional (`EMPTY_MODEL`, `ELEMENT_NOT_FOUND`, `INVALID_FOCUS_ID`, `INCONSISTENT_REFERENCE`, `CONTEXT_TOO_LARGE`).

Errores HTTP: 400 (cuerpo inválido), 401 (sin token), 404 (sin acceso o proyecto inexistente), 422 (documento persistido inválido) y 503 (Mentor IA no disponible).

## Seguridad

- JWT obligatorio y `requireView` antes de cargar el proyecto; VIEWER puede analizar.
- El proyecto y el UML se cargan exclusivamente en el servidor; el frontend envía solo el foco.
- `userId` sale del token y nunca del cuerpo; `projectId` sale de la ruta.
- Sin persistencia ni comandos UML; la respuesta de la IA no ejecuta código, SQL ni endpoints.

## Pruebas Y Evidencia

Ejecutadas el 2026-11-09 en `feat/s2-cu04-analisis-uml`:

- `npx vitest run src/mentor-analysis` (backend): 181 correctas y 15 omitidas. Fragmento 22, hechos relacionales 33, contexto 21, prompt 26, proveedor 13, servicio 26, DTO 12, controlador 18 y módulo 10. Las 15 omitidas son la suite real de Qwen.
- Regresión backend: Mentor de CU-2P-01 12/12; Assistant 18 correctas y 5 reales omitidas; Vision 53 correctas y 1 real omitida.
- Backend completo: 328 correctas y 36 omitidas; 5 archivos de integración PostgreSQL no se ejecutaron por ausencia de `backend/.env`.
- Frontend completo: 208/208 en 18 archivos, de las cuales 27 son de CU-2P-04 (API 6, sección 21). Las 2 pruebas originales de `mentor-panel` siguen correctas sin modificar.
- ESLint `--max-warnings=0` y `tsc --noEmit`: correctos en backend y frontend.

Qwen real: suite de validación real implementada. Ejecución pendiente en un entorno con Qwen3-1.7B GGUF configurado mediante `ASSISTANT_MODEL_PATH`. Sin esa variable las 15 pruebas se omiten (`skip`), no fallan. Sus precondiciones deterministas y sus comprobadores semánticos se validaron sin Qwen.

Revisión visual: integración frontend validada mediante pruebas automáticas. Revisión manual en navegador pendiente en un entorno con backend y base de datos disponibles.

## Estado De RF

- RF-12: implementado y cubierto automáticamente para clase, relación y modelo; explicación con Qwen real pendiente de validar.
- RF-13: implementado y cubierto automáticamente: contexto determinista y prompt compacto con recorte declarado.
- RF-14: implementado y cubierto automáticamente: solo lectura en backend (sin métodos de escritura en sus dependencias) y en la interfaz (sin acciones de modificación).

## Limitaciones

- La suite real de Qwen no se ha ejecutado; no hay resultados, tiempos ni longitudes reales de respuesta.
- No hay revisión manual en navegador.
- El presupuesto del prompt es una estimación en caracteres, no una medición con el tokenizer de Qwen.
- Con 256 tokens de salida, la explicación del modelo completo es breve.
- Las enumeraciones no se analizan individualmente.
- `mapToRelationalModel` valida el modelo internamente, por lo que hay dos validaciones por solicitud.

## Defectos Externos Detectados

No son defectos de CU-2P-04 y no se corrigieron en este CU:

- `relational-core`: dos asociaciones entre las mismas clases pueden producir columnas y FK duplicadas sin diagnóstico del mapper. CU-2P-04 lo detecta como conflicto `DUPLICATE_FOREIGN_KEY_COLUMN`.
- `DtoValidationPipe` (`backend/src/auth/dto/dto-validation.pipe.ts`): un POST con cuerpo `null` o `undefined` produce 500 en lugar de 400. CU-2P-04 usa `UmlAnalysisBodyPipe` como protección local.
