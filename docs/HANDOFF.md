# HANDOFF

## Estado Operativo

- CU-10 (XMI e imagen → UML) cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`.
- Ningún CU activo. El siguiente es CU-11, el último del roadmap; todavía no tiene plan ni OpenSpec.
- CU-2P-01 Mentor IA contextual con Qwen está completado, aceptado e integrado en `main`; OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu01-mentor-contextual/`.
- CU-2P-02 de `feat/s2-cu02-identidad-mentor` está completado y aceptado; OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu02-identidad-mentor/`. La identidad Mentor proviene del JWT, `ProjectAccessService.requireView` mantiene la autorización y el recorder recibe identidad segura. Anti-suplantación verificada; userId, email y rol siguen fuera del prompt Qwen.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`. Configurados: `ASSISTANT_*`, `SPEECH_*` y `VISION_MODEL_PATH`.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M).
- Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Florence-2: `C:\Users\USER\vision-models\Florence-2-base-ft` (q8, unos 275 MB; la guía está en CU-10). Carga en unos 5 s; cada imagen tarda de 7 a 40 s en CPU.
- Benchmark VLM: el dataset real del usuario está en `C:\Users\USER\vlm-fotos`, fuera del repositorio. Se ejecuta con `npm run benchmark:vlm` y escribe los reportes en `backend/.benchmark-output/`.
- Node v26.13.0 y npm 12: después de `npm install`, ejecutar `npx prisma generate` en `backend`.

## Decisiones Recientes

- Imagen → UML se cerró con la limitación medida: en capturas reales, la cobertura es de 0,58 en clases y 0,16 en relaciones. Cualquier mejora del analizador irá en un correctivo `fix-cu-10-...` y debe medirse con capturas nuevas.

## CU-2P-03

- Cerrado y aceptado; PR #10 fusionado en `main`, issue #3 cerrado automáticamente y merge commit `150e629`.
- OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu03-memoria-contextual/`; specs principales sincronizadas.
- Migración `20261109170000_add_mentor_interactions` aplicada. Memoria Prisma por proyecto, compartida entre usuarios autorizados y con autoría persistida.
- Límites: 6 interacciones, 1.200 caracteres por campo y 6.000 totales; revisiones anteriores llevan `isStale` y una advertencia visible determinista.
- Gates: 29/29 focalizadas, integración PostgreSQL entre instancias, suite raíz y build correctos. Prueba manual aprobada: persiste tras reinicio y se aísla entre proyectos.

## Siguiente Acción

No hay CU activo en el segundo parcial. En el track histórico, el siguiente CU es CU-11 cuando se autorice su planificación.
