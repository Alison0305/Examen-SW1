# HANDOFF

## Estado Operativo

- Correctivo `fix-cu-08-qwen-local-runtime` cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-06-fix-cu-08-qwen-local-runtime/`.
- CU activo: CU-10 (XMI e imagen → UML). OpenSpec `openspec/changes/cu-10-xmi-imagen-uml/` validado en modo strict; 0 de 25 tareas.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`; `ASSISTANT_*` y `SPEECH_*` configurados.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M). Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Node v26.13.0 y npm 12: tras `npm install`, ejecutar `npx prisma generate` en `backend`.
- La primera interpretación de cada arranque carga el modelo (unos 20 s); `ASSISTANT_PRELOAD=true` lo carga al iniciar.

## Siguiente Acción

Implementar el Incremento 1 de CU-10 (tareas 1.1 a 1.10). Pendientes del usuario: Enterprise Architect para la tarea 1.9 y fotos reales para la 3.4.
