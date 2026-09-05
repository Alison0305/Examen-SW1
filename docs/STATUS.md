# STATUS

## Estado Actual

**Ciclo actual:** Ciclo 1 — Inicio y base arquitectónica.

**Último CU completado:** CU-01 — Núcleo UML canónico y validación.

**OpenSpec activo:** ninguno.

CU-02 — Command Bus, Undo/Redo y workspace UML manual todavía no está iniciado.

## Casos De Uso Completados

- CU-00 — Base del proyecto.
- CU-01 — Núcleo UML canónico y validación.

## OpenSpec Activo

Ninguno.

## OpenSpec Archivado

- `openspec/changes/archive/2026-09-04-cu-00-base-proyecto/`
- `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`

## Specs Principales

- `openspec/specs/base-proyecto/spec.md`
- `openspec/specs/nucleo-uml-validacion/spec.md`

## Trabajo Realizado

- CU-00 cerrado con commit `fbd4c50 feat: completar base del proyecto CU-00` y push a `origin/main`.
- CU-01 aceptado explícitamente por el usuario con la frase: `Acepto el CU-01`.
- CU-01 verificado mediante `/opsx-verify` sin problemas críticos.
- OpenSpec de CU-01 archivado en `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`.
- Spec principal de CU-01 sincronizada en `openspec/specs/nucleo-uml-validacion/spec.md`.
- CU-01 implementado en código.
- Workspace `uml-core/` creado como paquete conceptual `@examen-sw1/uml-core`.
- `ProjectDocument`, `CanonicalUmlModel` y `DiagramLayout` implementados.
- Dominio UML de clases implementado con clases, atributos, operaciones, parámetros, enumeraciones, paquetes, tipos, visibilidad, relaciones y multiplicidades.
- `generationMetadata` implementado separado de UML estándar.
- Serialización y reconstrucción JSON implementadas.
- Motor de validación determinista implementado con diagnósticos estructurados.
- Demo `npm run demo:uml` implementada y correcta.
- Prueba manual del usuario realizada y aprobada.
- 33/33 tareas completadas.
- 11 Requirements reales y 48 Scenarios reales en la spec de CU-01.
- 30 tests correctos: frontend 4, backend 4 y `uml-core` 22.
- Lint correcto.
- Typecheck correcto.
- Build correcto.

## Pendiente

- commit de cierre de CU-01;
- push del commit de cierre de CU-01.

## Limitaciones Conocidas

- `npm audit --omit=dev` reporta 4 vulnerabilidades transitivas que npm propone corregir con upgrades mayores a NestJS 12 y Next 16; no se aplican en CU-01 para respetar el stack aprobado.
- `next build` muestra una advertencia no bloqueante sobre detección del plugin ESLint de Next con flat config; lint y build pasan correctamente.
- `npm install` muestra una advertencia de `allowScripts` para `esbuild@0.28.2`; no bloquea instalación, tests ni build.

## Problemas Abiertos

Ninguno conocido actualmente.

## Siguiente Acción

Revisar el diff, preparar el commit de cierre de CU-01 y luego hacer push. No iniciar CU-02 todavía.
