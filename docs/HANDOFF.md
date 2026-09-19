# HANDOFF

## Estado Operativo

- CU activo: ninguno. CU-08 está archivado en `openspec/changes/archive/2026-09-18-cu-08-frontend-generado-asistentes-texto/` con 14/14 tareas.
- Implementado: frontend CRUD generado, `AssistantCommand` validado contra Domain Manifest v1, propuesta UML adaptada exclusivamente a `UmlCommandBus`, spike local neutro de Qwen y benchmark determinista de 19 casos sin inferencia.
- Validado: gates raíz; `assistant-core` 26/26, `uml-core` 62/62, `frontend-generator` 23/23, `spring-generator` 55/55; smokes backend y frontend generado. El frontend generado aprobó con npm offline estricto y su output temporal está ignorado.
- Decisión vigente: `assistant-core/dist/browser.js` es el entrypoint de la UI generada y no incluye módulos Node del spike/benchmark. Qwen, node-llama-cpp, pesos y proveedores remotos no están instalados ni configurados.
- Pendiente: commit y push de cierre de CU-08. No iniciar CU-09.

## Siguiente Accion Exacta

1. Completar el commit y push de cierre de CU-08; después detenerse.
