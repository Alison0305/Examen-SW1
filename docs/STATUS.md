# STATUS

## Estado Actual

**Ciclo actual:** Ciclo 3 — Construcción y generación.

**Último CU completado:** CU-08 — Frontend generado y asistentes de texto.

**CU activo:** Ninguno. CU-08 fue archivado; no iniciar CU-09 sin instrucción.

**OpenSpec activo:** Ninguno.

CU-08 completó `frontend-generator` y `assistant-core`. El frontend CRUD generado consume Domain Manifest v1 y OpenAPI sin cambiar sus contratos. `AssistantCommand` valida la allow-list antes de IO; el asistente UML adapta propuestas aprobadas exclusivamente a `UmlCommandBus`. Qwen permanece sin runtime, pesos ni inferencia; el benchmark determinista de 19 casos no atribuye métricas a Qwen. Gates finales aprobados: raíz lint/typecheck/test/build, assistant-core 26/26, uml-core 62/62, frontend-generator 23/23, spring-generator 55/55, smokes backend y frontend generado offline, y OpenSpec strict. Domain Manifest v1 no cambió. El cambio se archivó y sus tres specs principales fueron sincronizadas.

## Cierre De CU-08

- Estado: cerrado, archivado y pendiente de commit/push.
- OpenSpec: `openspec/changes/archive/2026-09-18-cu-08-frontend-generado-asistentes-texto/`.
- Specs principales: `assistant-core`, `case-text-assistant` y `generated-frontend` sincronizadas y validadas.
- Progreso: 14/14 tareas completadas.

## Cierre De CU-04

- Estado: cerrado y aceptado manualmente.
- OpenSpec: archivado en `openspec/changes/archive/2026-09-12-cu-04-landing-proyectos-membresias-invitaciones/`; specs principales sincronizadas en `openspec/specs/landing-proyectos-membresias-invitaciones/spec.md` y `openspec/specs/persistencia-autenticacion-ownership/spec.md`.
- Resultado: landing, sesión JWT en `sessionStorage`, gestión persistida de proyectos, roles OWNER/EDITOR/VIEWER, membresías e invitaciones seguras con token temporal SHA-256.
- Corrección final de solo lectura: VIEWER no puede mutar ni mediante drag; mantiene selección, zoom, pan y ajustar vista.
- Prueba manual aceptada: crear, guardar y administrar proyecto; compartir, aceptar/rechazar invitación, verificar permisos por rol y confirmar que eliminar una membresía elimina el acceso al proyecto.
- Gates finales: lint, typecheck, test y build de raíz correctos; frontend 97/97, backend 24/24 y `uml-core` 53/53, total 174/174.
- Prisma: `validate` correcto; `migrate status` confirma 4 migraciones aplicadas y base al día.
- OpenSpec strict: cambio y specs principales correctos; 30/30 tareas completadas.

## Cierre De CU-03

- Estado: cerrado y aceptado formalmente con `Acepto el CU-03`.
- OpenSpec: archivado en `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/`.
- Especificación principal: sincronizada en `openspec/specs/persistencia-autenticacion-ownership/spec.md`.
- Incrementos: persistencia JSONB/Prisma, autenticación JWT y API de proyectos con ownership/revisión optimista completados.
- Progreso OpenSpec: 24/24 tareas.
- Gates: lint, typecheck, build y 117 tests correctos; Prisma al día y validación OpenSpec strict correcta.
- Prueba manual: confirmada para auth, `/health`, ownership y conflicto stale.
- Commit de cierre: `5a866c3 feat: completar persistencia autenticación y ownership CU-03`.
- Push: realizado correctamente a `origin/main`.

## Casos De Uso Completados

- CU-00 — Base del proyecto.
- CU-01 — Núcleo UML canónico y validación.
- CU-02 — Command Bus, Undo/Redo y workspace UML manual.
- CU-03 — Persistencia, autenticación y ownership.
- CU-04 — Landing, gestión de proyectos, membresías e invitaciones.
- CU-08 — Frontend generado y asistentes de texto.

## OpenSpec Archivado

- `openspec/changes/archive/2026-09-04-cu-00-base-proyecto/`
- `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`
- `openspec/changes/archive/2026-09-08-cu-02-uml-workspace/`
- `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/`
- `openspec/changes/archive/2026-09-12-cu-04-landing-proyectos-membresias-invitaciones/`
- `openspec/changes/archive/2026-09-18-cu-08-frontend-generado-asistentes-texto/`

## Specs Principales

- `openspec/specs/base-proyecto/spec.md`
- `openspec/specs/nucleo-uml-validacion/spec.md`
- `openspec/specs/uml-workspace/spec.md`
- `openspec/specs/persistencia-autenticacion-ownership/spec.md`
- `openspec/specs/landing-proyectos-membresias-invitaciones/spec.md`
- `openspec/specs/assistant-core/spec.md`
- `openspec/specs/case-text-assistant/spec.md`
- `openspec/specs/generated-frontend/spec.md`

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

- No hay proveedor de cobertura Vitest instalado ni configurado.
- El despliegue horizontal requiere afinidad de sesión o un adaptador Socket.IO compartido; el Incremento 1 se comprobó en una instancia.

## Trabajo Futuro Separado

- Bandeja interna de invitaciones UML Studio: invitaciones `PENDING`, badge/contador, proyecto, rol, invitador y acciones Aceptar/Rechazar. El enlace temporal seguirá como alternativa y no se incorporará SMTP inicialmente. No forma parte de CU-05.

## Siguiente Acción

Revisar el commit y push de cierre de CU-08; no iniciar CU-09 sin instrucción.
