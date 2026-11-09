# HANDOFF

## Estado Operativo

- CU-10 (XMI e imagen → UML) cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`.
- Ningún CU activo. El siguiente es CU-11, el último del roadmap; todavía no tiene plan ni OpenSpec.
- Segundo parcial: CU-2P-01 Mentor IA contextual en `openspec/changes/s2-cu01-mentor-contextual/`, 9/9 tareas. Backend y UI implementados; pendiente prueba manual Qwen, revisión y aceptación antes de archive/commit.
- Segundo parcial: CU-2P-04 Análisis UML en `openspec/changes/s2-cu04-analisis-uml/`, 14/18 tareas, rama `feat/s2-cu04-analisis-uml`. Implementación funcional completa; pendiente validación Qwen real y smoke test visual antes de PR/cierre. Detalle en la sección CU-2P-04.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`. Configurados: `ASSISTANT_*`, `SPEECH_*` y `VISION_MODEL_PATH`.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M).
- Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Florence-2: `C:\Users\USER\vision-models\Florence-2-base-ft` (q8, unos 275 MB; la guía está en CU-10). Carga en unos 5 s; cada imagen tarda de 7 a 40 s en CPU.
- Benchmark VLM: el dataset real del usuario está en `C:\Users\USER\vlm-fotos`, fuera del repositorio. Se ejecuta con `npm run benchmark:vlm` y escribe los reportes en `backend/.benchmark-output/`.
- Node v26.13.0 y npm 12: después de `npm install`, ejecutar `npx prisma generate` en `backend`.

## Decisiones Recientes

- Imagen → UML se cerró con la limitación medida: en capturas reales, la cobertura es de 0,58 en clases y 0,16 en relaciones. Cualquier mejora del analizador irá en un correctivo `fix-cu-10-...` y debe medirse con capturas nuevas.

## CU-2P-04 - Análisis UML

- Rama: `feat/s2-cu04-analisis-uml` (issue #4). Integra CU-2P-01 desde `main` (PR #8).
- Endpoint: `POST /projects/:id/mentor/analysis` con `{ "focus": { "kind": "class" | "relationship", "id" } }` o `{ "focus": { "kind": "model" } }`. Responde hechos deterministas (`analysis`) separados de la explicación (`explanation`); diagnósticos 200 `EMPTY_MODEL`, `ELEMENT_NOT_FOUND`, `INVALID_FOCUS_ID`, `INCONSISTENT_REFERENCE` y `CONTEXT_TOO_LARGE`; errores 400, 401, 404, 422 y 503.
- Arquitectura: `UmlAnalysisController` → `UmlAnalysisService` → `buildUmlAnalysisContext` (fragmento, validador canónico, mapper relacional, hechos relacionales) → `buildUmlAnalysisPrompt` → `UML_ANALYSIS_AI_PROVIDER` → `LocalQwenUmlAnalysisProvider` → `ASSISTANT_LOCAL_MODEL`. `MentorAnalysisModule` no importa `MentorModule`; comparte con CU-2P-01 y CU-08 la misma instancia del modelo local.
- Frontend: sección "Análisis UML" dentro de `MentorPanel` (`frontend/app/workspace/uml-analysis-section.tsx`), independiente de la consulta libre.
- Pruebas: `mentor-analysis` 181 correctas + 15 reales omitidas; Mentor 12, Assistant 18 + 5 omitidas, Vision 53 + 1 omitida; backend completo 328 + 36 omitidas con 5 archivos PostgreSQL sin `backend/.env`; frontend 208/208; ESLint y TypeScript correctos.
- Pendiente: ejecutar la suite real de Qwen, revisión manual en navegador, revisión del compañero, PR con `Closes #4`, aceptación, archive y cierre del issue.

Ejecutar la suite real de Qwen (desde `backend`, con la ruta local del GGUF de Qwen3-1.7B):

```powershell
$env:ASSISTANT_MODEL_PATH = "C:\ruta\modelo.gguf"
npx vitest run src/mentor-analysis/uml-analysis-qwen.real.integration.test.ts
```

Sin `ASSISTANT_MODEL_PATH` las 15 pruebas se omiten. Al terminar imprime una tabla por caso con duración, caracteres del prompt y de la respuesta, palabras y recorte.

Defectos externos detectados durante CU-2P-04 (no corregidos aquí):

- `relational-core`: dos asociaciones entre las mismas clases pueden producir columnas y FK duplicadas sin diagnóstico del mapper. CU-2P-04 lo informa como conflicto `DUPLICATE_FOREIGN_KEY_COLUMN` sin modificar `relational-core`.
- `backend/src/auth/dto/dto-validation.pipe.ts`: un POST con cuerpo `null` o `undefined` produce 500 en lugar de 400. CU-2P-04 usa `UmlAnalysisBodyPipe` como protección local.

## Siguiente Acción

Completar la suite real de Qwen y la revisión manual de CU-2P-04 antes de su PR. Completar la prueba manual y aceptación de CU-2P-01; en el track histórico, planificar CU-11 según `docs/puds/use-cases/README.md` y pedir aprobación antes del OpenSpec.
