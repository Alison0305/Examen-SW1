# HANDOFF

## Estado Operativo

- Correctivo `fix-cu-08-qwen-local-runtime` cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-06-fix-cu-08-qwen-local-runtime/`.
- CU activo: CU-10 (XMI e imagen → UML). OpenSpec `openspec/changes/cu-10-xmi-imagen-uml/`: Incremento 1 completo (10/25 tareas); Incrementos 2 y 3 pendientes.
- Track paralelo: `s2-cu02-identidad-mentor` crea un módulo interno de identidad autorizado para Mentor. No integra endpoint ni proveedor; depende de que CU-2P-01 llegue a `main`.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`; `ASSISTANT_*` y `SPEECH_*` configurados.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M). Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Node v26.13.0 y npm 12: tras `npm install`, ejecutar `npx prisma generate` en `backend`.
- La primera interpretación de cada arranque carga el modelo (unos 20 s); `ASSISTANT_PRELOAD=true` lo carga al iniciar.

## Siguiente Acción

Implementar el Incremento 2 de CU-10 (imagen → propuesta: Sharp, Florence-2 local y analizador determinista). Pendiente del usuario: fotos reales para la tarea 3.4.
