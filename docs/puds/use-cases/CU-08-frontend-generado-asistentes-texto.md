# CU-08 - Frontend generado y asistentes de texto

## Estado

CU activo. Implementación completa, 14/14 tareas OpenSpec; pendiente de aceptación, archivado, commit y push.

## Implementación Realizada

Se creó `@examen-sw1/frontend-generator` con Handlebars, TypeScript, Next.js App Router y Material UI. Genera de forma determinista un frontend CRUD desde RelationalModel, Domain Manifest v1 y OpenAPI, con búsqueda, filtros, ordenamiento, paginación, relaciones, estados loading/error/empty y responsive básico. Las relaciones mutables usan el LIST declarado, y CREATE/PATCH se limitan a sus request schemas OpenAPI.

`assistant-core` implementa `AssistantCommand` cerrado para LIST, GET, SEARCH, CREATE, UPDATE, DELETE y COUNT. Valida contra Domain Manifest v1 antes de IO, deriva requests solo de operaciones declaradas y exige confirmación para DELETE. El asistente UML es independiente: presenta propuestas CREATE_CLASS, RENAME_CLASS y DELETE_CLASS, y las aplica exclusivamente como `UmlCommand` mediante `UmlCommandBus`, conservando Undo/Redo.

El spike de Qwen solo define una frontera local declarativa. No se instaló runtime nativo ni se descargaron modelos, binarios o proveedores remotos. El benchmark determinista de 19 casos registró 68.42% de validez, 100% de accuracy, 0 falsos positivos, 100% de rechazos correctos, p50 0.0279 ms, p95 0.3976 ms y RAM 44,306,432 a 44,347,392 bytes. Estas métricas no son inferencia Qwen.

## Validación

Los gates raíz lint, typecheck, test y build aprobaron. También aprobaron `assistant-core` 26/26, `uml-core` 62/62, `frontend-generator` 23/23, `spring-generator` 55/55 y el smoke backend generado. El smoke del frontend generado aprobó en modo npm offline estricto, usando caché local y sin lifecycle scripts; su output temporal está ignorado. Domain Manifest v1 no fue modificado. OpenSpec strict aprobó.

## Limitaciones

Qwen3 1.7B, node-llama-cpp y pesos GGUF no están disponibles; VRAM, RAM, carga y latencia de inferencia Qwen permanecen N/A.
