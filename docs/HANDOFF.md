# HANDOFF

## Estado Operativo

- Segundo parcial: CU-2P-01 Mentor IA contextual activo en `openspec/changes/s2-cu01-mentor-contextual/`, 9/9 tareas. La auditoría confirmó Qwen local y ausencia de Claude/Anthropic runtime. Backend y UI implementados; gates raíz correctos y pruebas focalizadas verdes. Pendiente prueba manual Qwen, revisión, aceptación, archive y commit. No continuar CU-10 durante este trabajo.
- Correctivo `fix-cu-08-qwen-local-runtime` cerrado, aceptado y archivado en `openspec/changes/archive/2026-11-06-fix-cu-08-qwen-local-runtime/`.
- CU activo: CU-10 (XMI e imagen → UML). OpenSpec `openspec/changes/cu-10-xmi-imagen-uml/`: Incremento 1 completo (10/25 tareas); Incrementos 2 y 3 pendientes.

## Entorno

- `backend/.env` (no commitear): PostgreSQL 18 en el puerto 5433 y base `examen_sw1`; `ASSISTANT_*` y `SPEECH_*` configurados.
- Qwen: `C:\Users\USER\llm-models\` (Q8_0 y Q4_K_M; se recomienda Q4_K_M). Vosk: `backend/.venv` y `C:\Users\USER\vosk-models\vosk-model-small-es-0.42`.
- Node v26.13.0 y npm 12: tras `npm install`, ejecutar `npx prisma generate` en `backend`.
- La primera interpretación de cada arranque carga el modelo (unos 20 s); `ASSISTANT_PRELOAD=true` lo carga al iniciar.

## Siguiente Acción

Ejecutar la prueba manual de CU-2P-01: comparar preguntas entre proyectos aislados y comprobar que una clase inexistente no se inventa. Esperar revisión del compañero y aceptación del usuario antes de archivar o hacer operaciones Git finales.
