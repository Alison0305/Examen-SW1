# HANDOFF

## Estado Operativo

- CU-00 a CU-03 cerrados; CU-03 fue aceptado formalmente con `Acepto el CU-03`.
- No hay CU ni OpenSpec activos. CU-03 está archivado en `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/`; spec principal sincronizada en `openspec/specs/persistencia-autenticacion-ownership/spec.md`.
- Incrementos 1 y 2 completados: Prisma 6.19.3/PostgreSQL 17 con JSONB para `ProjectDocument`; AuthModule con Argon2id, JWT Bearer, registro, login y `/auth/me`.
- Incremento 3 implementado y probado: `POST /projects`, `GET /projects/:id` y `PUT /projects/:id` con JWT, ownership, revisión optimista y `404` indistinguible para ajeno/inexistente.
- `ProjectsPersistenceService` valida/serializa/deserializa el documento y usa `updateManyAndReturn` atómico por `id`, `ownerId` y `revision`; stale devuelve `409` sin sobrescritura.
- CU-03 entregó persistencia JSONB, Argon2id/JWT y API Projects con ownership/revisión optimista. Pruebas HTTP/PostgreSQL reales cubren autenticación, ownership, validación y concurrencia con exactamente un `200` y un `409`; prueba manual confirmada. Gates correctos: 117 tests (frontend 49, backend 15, `uml-core` 53); Prisma al día y OpenSpec strict válido.
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
- Gates de cierre de CU-02 correctos desde la raíz: `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`.
- Ajustes visuales durante la prueba manual 3.16: IconButtons Deshacer/Rehacer con `↶`/`↷`, Ajustar vista, literales con boton Eliminar compacto y simbolos UML de visibilidad en nodos de clase y enum.
- Advertencia conocida en build: Next reporta que no detecta el plugin ESLint con flat config; no bloquea lint ni build.
- La instalación frontend reporta 2 vulnerabilidades npm transitivas y advertencia de scripts para `esbuild@0.28.2`; no se corrigieron por alcance.
- La edición manual de rutas, bends o segmentos UML estilo StarUML está diferida para una mejora posterior.

## Roadmap Completo

Ciclo 1: CU-00 → CU-01 → CU-02
Ciclo 2: CU-03 → CU-04 → CU-05
Ciclo 3: CU-06 → CU-07 → CU-08
Ciclo 4: CU-09 → CU-10 → CU-11

## Siguiente Acción Exacta

Revisar y crear el commit de cierre de CU-03 cuando el usuario lo solicite. Después seleccionar y planificar CU-04; no implementarlo antes de aprobación.
