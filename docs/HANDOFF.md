# HANDOFF

## Estado Operativo

- CU-10 (XMI e imagen → UML) cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`.
- CU-2P-05 está terminado y aceptado: la prueba manual fue aprobada, PR #13 fue fusionado en `main` mediante `2e6fade062361b25edde73ee446fb900b861147e` e issue #5 quedó cerrado. OpenSpec archivado en `openspec/changes/archive/2026-11-10-s2-cu05-recomendaciones-tecnicas/` con 19/19 tareas.
- CU-2P-01 Mentor IA contextual con Qwen está completado, aceptado e integrado en `main`; OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu01-mentor-contextual/`.
- CU-2P-02 de `feat/s2-cu02-identidad-mentor` está completado y aceptado; OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu02-identidad-mentor/`. La identidad Mentor proviene del JWT, `ProjectAccessService.requireView` mantiene la autorización y el recorder recibe identidad segura. Anti-suplantación verificada; userId, email y rol siguen fuera del prompt Qwen.
- CU-2P-03 Memoria contextual completado, aceptado e integrado en `main` (PR #10). Detalle en la sección CU-2P-03.
- Segundo parcial, CU activo: CU-2P-04 Análisis UML en `openspec/changes/s2-cu04-analisis-uml/`, 14/18 tareas, rama `feat/s2-cu04-analisis-uml` (ya integra `main` con CU-2P-02 y CU-2P-03). Implementación funcional completa; pendiente validación Qwen real y smoke test visual antes de PR/cierre. Detalle en la sección CU-2P-04.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`. Configurados: `ASSISTANT_*`, `SPEECH_*` y `VISION_MODEL_PATH`.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M).
- Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Florence-2: `C:\Users\USER\vision-models\Florence-2-base-ft` (q8, unos 275 MB; la guía está en CU-10). Carga en unos 5 s; cada imagen tarda de 7 a 40 s en CPU.
- Benchmark VLM: el dataset real del usuario está en `C:\Users\USER\vlm-fotos`, fuera del repositorio. Se ejecuta con `npm run benchmark:vlm` y escribe los reportes en `backend/.benchmark-output/`.
- Node v26.13.0 y npm 12: después de `npm install`, ejecutar `npx prisma generate` en `backend`.

## Decisiones Recientes

- Imagen → UML se cerró con la limitación medida: en capturas reales, la cobertura es de 0,58 en clases y 0,16 en relaciones. Cualquier mejora del analizador irá en un correctivo `fix-cu-10-...` y debe medirse con capturas nuevas.
- Recomendaciones CU-2P-05: salida Qwen con schema estricto; campos inválidos producen error controlado sin coerción. Guardas sin Qwen solo para elementos/relaciones/servicios/componentes concretos ausentes y temas externos o ambiguos como pagos; arquitectura general verificada se permite sin entidad literal. Contexto limitado a Next.js, NestJS, PostgreSQL, Prisma, Qwen local, UML, Spring y memoria autorizada del mismo proyecto. El panel Mentor tiene `Consultar` y `Recomendación técnica` separados; la respuesta es solo lectura y no ofrece aplicación UML.
- Arquitectura conserva el retry único y fallback tras dos `UNVERIFIED_TECHNOLOGY`. Relaciones canónicas, atributo ausente y generación Spring Boot verificable se resuelven antes de Qwen. Spring requiere referencia al generador más intención de generar, exportar, preparar, validar o comprobar compatibilidad; responde desde UML canónico, transformación relacional y pipeline Spring, sin Qwen ni mutación. El provider conserva el rechazo de inglés, alternativas vacías y frases de cambio aplicado para las rutas no deterministas. Timeout backend 120 s; frontend no tiene timeout ni abort de recomendación. `recommendMentor` espera 500 ms y reintenta solo un `TypeError` sin HTTP; HTTP y `AbortError` no se reintentan, y `queryMentor` no cambia. Gates: focalizadas frontend 52/52 y backend 75/75; lint, typecheck, build y Prisma correctos. La suite raíz quedó bloqueada por la prueba real de CU-2P-04 `relacional no derivable`, donde Qwen inventa una FK al faltar identificadores.

## CU-2P-03

- Cerrado y aceptado; PR #10 fusionado en `main`, issue #3 cerrado automáticamente y merge commit `150e629`.
- OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu03-memoria-contextual/`; specs principales sincronizadas.
- Migración `20261109170000_add_mentor_interactions` aplicada. Memoria Prisma por proyecto, compartida entre usuarios autorizados y con autoría persistida.
- Límites: 6 interacciones, 1.200 caracteres por campo y 6.000 totales; revisiones anteriores llevan `isStale` y una advertencia visible determinista.
- Gates: 29/29 focalizadas, integración PostgreSQL entre instancias, suite raíz y build correctos. Prueba manual aprobada: persiste tras reinicio y se aísla entre proyectos.

## CU-2P-04 - Análisis UML

- Rama: `feat/s2-cu04-analisis-uml` (issue #4). Integra `main` con CU-2P-01 (PR #8), CU-2P-02 (PR #9) y CU-2P-03 (PR #10/#11).
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

Siguiente trabajo disponible: CU-2P-06. El baseline real-Qwen de CU-2P-04 permanece documentado y no bloquea el cierre de CU-2P-05.
