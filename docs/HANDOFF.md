# HANDOFF

## Estado Operativo

- Correctivo `fix-cu-08-qwen-local-runtime` cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-06-fix-cu-08-qwen-local-runtime/`.
- No hay CU ni cambio OpenSpec activo. El siguiente CU del roadmap es CU-10 (XMI e imagen → UML); no se ha iniciado.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`; `ASSISTANT_*` y `SPEECH_*` configurados.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M). Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Node v26.13.0 y npm 12: tras `npm install`, ejecutar `npx prisma generate` en `backend`.
- La primera interpretación de cada arranque carga el modelo (unos 20 s); `ASSISTANT_PRELOAD=true` lo carga al iniciar.

## Siguiente Acción

Planificar CU-10 según `docs/puds/use-cases/README.md`, con plan y aprobación antes de crear su OpenSpec.
