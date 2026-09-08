# HANDOFF

## Estado Operativo

- CU-00, CU-01 y CU-02 cerrados; CU-02 fue aceptado formalmente por el usuario.
- CU activo: ninguno. OpenSpec activo: ninguno tras el archive de CU-02.
- CU-02 entregó Command Bus, Undo/Redo, workspace manual, ELK, diagnósticos, responsive y relaciones UML; prueba manual y gates satisfactorios, 55/55 tareas.
- CU-02 archive: `openspec/changes/archive/2026-09-08-cu-02-uml-workspace/`; spec principal: `openspec/specs/uml-workspace/spec.md`.
- CU-01 archive: `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`.
- CU-01 spec principal: `openspec/specs/nucleo-uml-validacion/spec.md`.
- CU-01 commit principal: `5256252 feat: completar núcleo UML y validación CU-01`.
- CU-01 push: realizado correctamente a `origin/main`.
- `ProjectDocument`, `CanonicalUmlModel`, `DiagramLayout` y validador UML ya existen en `uml-core/`.
- No hay que rehacer funcionalidad de CU-01.
- Dependencias frontend instaladas: `@xyflow/react`, Zustand, ELK.js y dependencia local `@examen-sw1/uml-core`.
- Workspace UML manual disponible en `/workspace` con React Flow, Zustand, Command Bus, creación/edición básica, relaciones, movimiento, diagnostics de comandos rechazados, diagnostics de documento, navegación/centrado, auto-layout undoable y Undo/Redo.
- Gates finales de Incremento 3 correctos desde la raíz: `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`.
- Suite total actual: 106 tests.
- Ajustes visuales durante la prueba manual 3.16: IconButtons Deshacer/Rehacer con `↶`/`↷`, Ajustar vista, literales con boton Eliminar compacto y simbolos UML de visibilidad en nodos de clase y enum.
- Advertencia conocida en build: Next reporta que no detecta el plugin ESLint con flat config; no bloquea lint ni build.
- La instalación frontend reporta 2 vulnerabilidades npm transitivas y advertencia de scripts para `esbuild@0.28.2`; no se corrigieron por alcance.
- La edición manual de rutas, bends o segmentos UML estilo StarUML está diferida para una mejora posterior.
- CU-03 — Persistencia, autenticación y ownership está planificado y no iniciado.

## Roadmap Completo

Ciclo 1: CU-00 → CU-01 → CU-02
Ciclo 2: CU-03 → CU-04 → CU-05
Ciclo 3: CU-06 → CU-07 → CU-08
Ciclo 4: CU-09 → CU-10 → CU-11

## Siguiente Acción Exacta

Tras confirmar archive, commit y push de CU-02, el siguiente caso planificado será CU-03. No iniciarlo sin una instrucción explícita.
