# STATUS

## Estado Actual

**Ciclo actual:** Ciclo 1 — Inicio y base arquitectónica.

**Último CU completado:** CU-03 — Persistencia, autenticación y ownership.

**CU activo:** Ninguno.

**OpenSpec activo:** Ninguno.

CU-00, CU-01, CU-02 y CU-03 están cerrados. CU-03 fue aceptado explícitamente, su OpenSpec fue archivado y su especificación principal fue sincronizada. El commit de cierre queda pendiente.

## Cierre De CU-03

- Estado: cerrado y aceptado formalmente con `Acepto el CU-03`.
- OpenSpec: archivado en `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/`.
- Especificación principal: sincronizada en `openspec/specs/persistencia-autenticacion-ownership/spec.md`.
- Incrementos: persistencia JSONB/Prisma, autenticación JWT y API de proyectos con ownership/revisión optimista completados.
- Progreso OpenSpec: 24/24 tareas.
- Gates: lint, typecheck, build y 117 tests correctos; Prisma al día y validación OpenSpec strict correcta.
- Prueba manual: confirmada para auth, `/health`, ownership y conflicto stale.
- Commit de cierre: pendiente de solicitud explícita.

## Casos De Uso Completados

- CU-00 — Base del proyecto.
- CU-01 — Núcleo UML canónico y validación.
- CU-02 — Command Bus, Undo/Redo y workspace UML manual.
- CU-03 — Persistencia, autenticación y ownership.

## OpenSpec Archivado

- `openspec/changes/archive/2026-09-04-cu-00-base-proyecto/`
- `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`
- `openspec/changes/archive/2026-09-08-cu-02-uml-workspace/`
- `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/`

## Specs Principales

- `openspec/specs/base-proyecto/spec.md`
- `openspec/specs/nucleo-uml-validacion/spec.md`
- `openspec/specs/uml-workspace/spec.md`
- `openspec/specs/persistencia-autenticacion-ownership/spec.md`

## Cierre De CU-01

- Estado: cerrado.
- Implementación: completa.
- Tareas: 33/33 completadas.
- Tests: 30 correctos, distribuidos en frontend 4, backend 4 y `uml-core` 22.
- Lint: correcto.
- Typecheck: correcto.
- Build: correcto.
- Demo `npm run demo:uml`: correcta.
- Prueba manual del usuario: aprobada.
- Verify: correcto, sin problemas críticos.
- Aceptación explícita: realizada con la frase `Acepto el CU-01`.
- OpenSpec: archivado en `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`.
- Spec principal: sincronizada en `openspec/specs/nucleo-uml-validacion/spec.md`.
- Conteo real del spec: 11 Requirements y 48 Scenarios.
- Commit principal: `5256252 feat: completar núcleo UML y validación CU-01`.
- Push: realizado correctamente a `origin/main`.

## Cierre De CU-02

- Cambio OpenSpec: `cu-02-uml-workspace`.
- Capability planificada: `uml-workspace`.
- Objetivo: establecer Command Bus, Undo/Redo y workspace UML manual local en memoria.
- Estado: cerrado, aceptado formalmente y archivado en `openspec/changes/archive/2026-09-08-cu-02-uml-workspace/`.
- Incrementos definidos: 3.
- Incremento 1: Command Bus y Undo/Redo completado.
- Incremento 2: Workspace UML manual completado.
- Incremento 3: ELK, diagnósticos, responsive e integración implementados a nivel automatizado; gates finales de raíz correctos.
- Progreso OpenSpec: 55/55 tareas completadas.
- Dependencias instaladas en esta fase: `@xyflow/react`, Zustand, ELK.js y dependencia local `@examen-sw1/uml-core` en frontend.
- Prueba manual: satisfactoria, incluyendo eliminación y restauración por Undo de clase y enum, responsive básico, `UML_DUPLICATE_NAME` y navegación IR.
- Gates finales: `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` correctos; suite total actual: 106 tests.
- Edición manual de rutas, bends o segmentos estilo StarUML: diferida para mejora posterior.

## Limitaciones Conocidas

- `npm audit --omit=dev` reporta 4 vulnerabilidades transitivas que npm propone corregir con upgrades mayores a NestJS 12 y Next 16; no se aplicaron en CU-01 para respetar el stack aprobado.
- `next build` muestra una advertencia no bloqueante sobre detección del plugin ESLint de Next con flat config; lint y build pasan correctamente.
- `npm install` muestra una advertencia de `allowScripts` para `esbuild@0.28.2`; no bloquea instalación, tests ni build.
- La instalación de dependencias frontend del Incremento 2 reportó 2 vulnerabilidades npm transitivas; no se corrigieron en esta iteración para evitar cambios de alcance/versiones no aprobados.
- La instalación de ELK.js para Incremento 3 mantuvo 2 vulnerabilidades npm transitivas y la advertencia de scripts de `esbuild@0.28.2`; no se corrigieron por alcance.

## Problemas Abiertos

Ninguno conocido actualmente.

## Siguiente Acción

Revisar y crear el commit de cierre de CU-03 cuando el usuario lo solicite; después seleccionar y planificar CU-04 sin implementarlo antes de su aprobación.
