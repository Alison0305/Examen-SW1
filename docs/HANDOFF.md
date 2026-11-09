# HANDOFF

## Estado Operativo

- CU-10 (XMI e imagen → UML) cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`.
- Ningún CU activo. El siguiente es CU-11, el último del roadmap; todavía no tiene plan ni OpenSpec.
- Segundo parcial: CU-2P-01 Mentor IA contextual en `openspec/changes/s2-cu01-mentor-contextual/`, 9/9 tareas. Backend y UI implementados; pendiente prueba manual Qwen, revisión y aceptación antes de archive/commit.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`. Configurados: `ASSISTANT_*`, `SPEECH_*` y `VISION_MODEL_PATH`.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M).
- Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Florence-2: `C:\Users\USER\vision-models\Florence-2-base-ft` (q8, unos 275 MB; la guía está en CU-10). Carga en unos 5 s; cada imagen tarda de 7 a 40 s en CPU.
- Benchmark VLM: el dataset real del usuario está en `C:\Users\USER\vlm-fotos`, fuera del repositorio. Se ejecuta con `npm run benchmark:vlm` y escribe los reportes en `backend/.benchmark-output/`.
- Node v26.13.0 y npm 12: después de `npm install`, ejecutar `npx prisma generate` en `backend`.

## Decisiones Recientes

- Imagen → UML se cerró con la limitación medida: en capturas reales, la cobertura es de 0,58 en clases y 0,16 en relaciones. Cualquier mejora del analizador irá en un correctivo `fix-cu-10-...` y debe medirse con capturas nuevas.

## Siguiente Acción

Completar la prueba manual y aceptación de CU-2P-01; en el track histórico, planificar CU-11 según `docs/puds/use-cases/README.md` y pedir aprobación antes del OpenSpec.
