# STATUS

## Estado Actual

### Segundo Parcial

**CU activo del segundo parcial:** CU-2P-04 - Analizar y explicar un modelo UML 2.5 (en validación).

**Último CU cerrado del segundo parcial:** CU-2P-03 - Persistir y recuperar memoria contextual del Mentor IA.

Este track académico es independiente del roadmap histórico CU-00...CU-11. No renumera ni modifica el estado del primer parcial.

CU-2P-03 está cerrado y aceptado: PR #10 fusionado en `main`, issue #3 cerrado automáticamente y merge commit `150e629`. OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu03-memoria-contextual/`; specs principales sincronizadas. Persistencia PostgreSQL y memoria contextual por proyecto implementadas; 29/29 focalizadas e integración PostgreSQL correctas. Suite raíz y build correctos. Prueba manual aprobada: la memoria persiste tras reiniciar backend, se aísla entre proyectos y antecedentes de revisiones UML anteriores muestran una advertencia visible.

**CU-2P-04 - Analizar y explicar un modelo UML 2.5** (issue #4, rama `feat/s2-cu04-analisis-uml`, OpenSpec `openspec/changes/s2-cu04-analisis-uml/`).

Estado: implementación funcional completa — pendiente validación Qwen real y smoke test visual antes de PR/cierre. No está cerrado.

Implementación: `POST /projects/:id/mentor/analysis` con contexto determinista (fragmento UML, diagnósticos canónicos, hechos relacionales del mapper, conflictos y limitaciones), prompt compacto con recorte declarado y explicación con el mismo Qwen local compartido por CU-2P-01 (`ASSISTANT_LOCAL_MODEL`). Sección "Análisis UML" en el panel Mentor IA con "Explicar selección" y "Explicar modelo", de solo lectura. Integra `main` con CU-2P-01 (PR #8), CU-2P-02 (PR #9) y CU-2P-03 (PR #10/#11). OpenSpec 14/18 tareas. Pruebas: `mentor-analysis` 181 correctas + 15 reales de Qwen omitidas; backend completo 328 correctas + 36 omitidas (5 archivos PostgreSQL sin `backend/.env`); frontend 208/208; ESLint y TypeScript correctos. Pendiente: ejecutar la suite real de Qwen, revisión manual en navegador, revisión del compañero, PR, aceptación y cierre del issue.

### Primer Parcial

**Ciclo actual:** Ciclo 4 — Transición, multimodalidad y cierre.

**Último CU completado:** CU-10 — XMI e imagen → UML.

**CU activo:** ninguno. El siguiente es CU-11, el último del roadmap.

**Track paralelo cerrado:** CU-2P-02 — identidad de interacción Mentor en `feat/s2-cu02-identidad-mentor`, aceptado y archivado. Integrado en `main` mediante el PR #9.

**Último correctivo cerrado:** `fix-cu-08-qwen-local-runtime` — intérprete local Qwen3 1.7B para texto y voz.

**OpenSpec archivado:** `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`.

El correctivo CU-06 está completo en 9/9. Con el proyecto `Prueba CU06 Backend`, la prueba manual creó Rol y Usuario con asociación 1:N, guardó el `ProjectDocument`, descargó el ZIP mediante `Generar backend` y compiló el contenido extraído con `gradle compileJava --no-daemon`: `BUILD SUCCESSFUL in 16s`. El flujo usa exclusivamente `document.uml` como `CanonicalUmlModel`; `DiagramLayout` sigue siendo visual. El endpoint autenticado entrega el ZIP binario con `FastifyReply.send(zip)`. Las clases manuales sin metadata se proyectan salvo `entity: false` y el atributo `id` es identifier salvo `identifier: false`.

## Cierre De CU-10

- Estado: cerrado, aceptado por el usuario el 2026-11-08 y archivado en `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`. Progreso: 25/25 tareas.
- **XMI 2.1:** exportación e importación aprobadas por el usuario con Enterprise Architect.
- **Imagen → UML:** Florence-2 local en CPU, con analizador determinista, revisión común y aplicación atómica.
- **Benchmark real** (19 capturas del usuario): cobertura de clases 0,58, atributos 0,13, relaciones 0,16 y multiplicidades 0,08, con tolerancia de OCR. Se acepta como limitación; el detalle y las mejoras propuestas están en `docs/puds/use-cases/CU-10-xmi-imagen-uml.md`.
- Prueba manual 3.3: aprobada por el usuario ("funciona a medias"), sin detalle de los pasos ni confirmación de la prueba en colaboración.

## Cambio Menú De Multiplicidades (CU-02)

- Estado: cerrado, aprobado por el usuario el 2026-11-06 y archivado en `openspec/changes/archive/2026-11-06-feat-relationship-multiplicity-menu/`; commit `9e8a5f7`.
- Resultado: menú de multiplicidades por extremo en el inspector de relaciones, aplicado al instante con Undo; `*` se interpreta como `0..*`.

## Cierre De Correctivo Qwen Local (CU-08)

- Estado: cerrado, aceptado por el usuario el 2026-11-06 y archivado.
- OpenSpec: `openspec/changes/archive/2026-11-06-fix-cu-08-qwen-local-runtime/`; 33/33 tareas.
- Resultado: `POST /assistant/interpret` interpreta español natural con Qwen3 1.7B GGUF y `node-llama-cpp` 3.22.2, local y sin Internet, en modo UML y en modo datos. Usa schema dinámico con `UNSUPPORTED` y resolución determinista de nombres a ids. El workspace CASE y el frontend generado lo usan con aprobación previa y respaldo de sintaxis estricta; la voz Vosk entra por el mismo camino.
- Benchmark: 36 frases; la configuración elegida, Q4_K_M + Vulkan + prompt v3, obtuvo 97,22 % de accuracy, 1 falso positivo de solo lectura y p50/p95 de 664/773 ms. Detalle en `docs/puds/use-cases/CU-08-frontend-generado-asistentes-texto.md`.
- Correcciones de entorno: el script `dev` de `backend` usa `node --watch --import tsx` porque `tsx watch`, con stdin como tubería de `concurrently`, congelaba el backend en Windows. `uml-core` cambió un `let` por `const` exigido por ESLint 9.39.5.
- Gates: lint, typecheck, build y 467 tests de raíz correctos; Qwen real 5/5 y Vosk real 3/3.
- Implementación realizada con Claude Code siguiendo el OpenSpec creado con OpenCode.

## Cierre De Frontend Standalone Export

- Estado: cerrado, archivado y aceptado manualmente.
- OpenSpec: `openspec/changes/archive/2026-10-01-feat-generated-frontend-export/`.
- Resultado: el workspace descarga un frontend CRUD autónomo generado desde `CanonicalUmlModel`, sin depender de `DiagramLayout`, paquetes internos ni dependencias `file:`.
- Validación: el ZIP instala y genera export estático; la integración H2 con Spring generado validó CRUD, FKs, edición y eliminación. La prueba manual final confirmó los mismos flujos en frontend y backend generados.

## Cierre De Asociación Recursiva

- Estado: cerrado, archivado y validado manualmente.
- OpenSpec: `openspec/changes/archive/2026-09-27-feat-recursive-class-association/`.
- Resultado: una Association puede referir la misma clase, se representa como self-loop, conserva multiplicidades independientes y sigue la ruta de persistencia, realtime y Undo/Redo.
- Generación: el mapper mantiene el rol propietario para derivar nullability en self associations; `0..1 ↔ 1..*` genera una FK opcional y la API Spring permite crear y actualizar la relación con `null`.
- Validación: gates de frontend, backend, relational-core, spring-generator y typecheck raíz correctos; ZIP productivo compiló con Gradle y la prueba manual CRUD fue satisfactoria.

## Cierre De CU-09

- Estado: cerrado, archivado y pendiente de commit/push.
- OpenSpec: `openspec/changes/archive/2026-09-22-cu-09-voz-vosk-android-capacitor/`.
- Progreso: 10/10 tareas completadas.
- Evidencia final: Galaxy A05 valido Vosk/STT LAN y `AssistantCommand` contra Spring/PostgreSQL LAN; `GET /api/v1/rol` respondio HTTP 200 JSON.

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
- CU-05 — Colaboración realtime y presencia.
- CU-06 — UML → RelationalModel y generador backend Spring Boot.
- CU-07 — CRUD avanzado, verificación, OpenAPI, Postman y Domain Manifest.
- CU-08 — Frontend generado y asistentes de texto.
- CU-09 — Voz Vosk y Android Capacitor.
- CU-10 — XMI e imagen → UML.

## OpenSpec Archivado

- `openspec/changes/archive/2026-09-04-cu-00-base-proyecto/`
- `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`
- `openspec/changes/archive/2026-09-08-cu-02-uml-workspace/`
- `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/`
- `openspec/changes/archive/2026-09-12-cu-04-landing-proyectos-membresias-invitaciones/`
- `openspec/changes/archive/2026-09-18-cu-08-frontend-generado-asistentes-texto/`
- `openspec/changes/archive/2026-11-08-cu-10-xmi-imagen-uml/`
- `openspec/changes/archive/2026-11-09-s2-cu03-memoria-contextual/`

## Specs Principales

- `openspec/specs/base-proyecto/spec.md`
- `openspec/specs/nucleo-uml-validacion/spec.md`
- `openspec/specs/uml-workspace/spec.md`
- `openspec/specs/persistencia-autenticacion-ownership/spec.md`
- `openspec/specs/landing-proyectos-membresias-invitaciones/spec.md`
- `openspec/specs/assistant-core/spec.md`
- `openspec/specs/case-text-assistant/spec.md`
- `openspec/specs/generated-frontend/spec.md`
- `openspec/specs/uml-fragment-import/spec.md`
- `openspec/specs/xmi-interop/spec.md`
- `openspec/specs/image-uml-recognition/spec.md`
- `openspec/specs/project-contextual-mentor/spec.md`
- `openspec/specs/mentor-interaction-memory/spec.md`

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

- Imagen → UML (CU-10) no es fiable con capturas reales de estilos variados: falla con cabeceras rellenas, fondos, atributos sin tipo y líneas discontinuas. Las multiplicidades leídas por OCR deben revisarse siempre.
- `npm audit --omit=dev` reporta 4 vulnerabilidades transitivas que npm propone corregir con upgrades mayores a NestJS 12 y Next 16; no se aplicaron en CU-01 para respetar el stack aprobado.
- `next build` muestra una advertencia no bloqueante sobre detección del plugin ESLint de Next con flat config; lint y build pasan correctamente.
- `npm install` muestra una advertencia de `allowScripts` para `esbuild@0.28.2`; no bloquea instalación, tests ni build.
- La instalación de dependencias frontend del Incremento 2 reportó 2 vulnerabilidades npm transitivas; no se corrigieron en esta iteración para evitar cambios de alcance/versiones no aprobados.
- La instalación de ELK.js para Incremento 3 mantuvo 2 vulnerabilidades npm transitivas y la advertencia de scripts de `esbuild@0.28.2`; no se corrigieron por alcance.

## Problemas Abiertos

- Test intermitente en `frontend`: con la CPU cargada, `app/projects/page.tsx` puede actualizar el estado después del teardown de `auth.test.tsx` y Vitest lo reporta como error no controlado aunque todos los tests pasen. Visto el 2026-11-06; no se reprodujo en tres repeticiones.
- No hay proveedor de cobertura Vitest instalado ni configurado.
- El despliegue horizontal requiere afinidad de sesión o un adaptador Socket.IO compartido; el Incremento 1 se comprobó en una instancia.
- `relational-core`: dos asociaciones entre las mismas clases pueden generar columnas y FK duplicadas sin diagnóstico del mapper. Detectado durante CU-2P-04, que lo informa como conflicto sin corregir el mapper.
- `DtoValidationPipe`: un POST con cuerpo `null` o `undefined` responde 500 en lugar de 400. Detectado durante CU-2P-04, que usa una protección local.

## Trabajo Futuro Separado

- Bandeja interna de invitaciones UML Studio: invitaciones `PENDING`, badge/contador, proyecto, rol, invitador y acciones Aceptar/Rechazar. El enlace temporal seguirá como alternativa y no se incorporará SMTP inicialmente. No forma parte de CU-05.

## Siguiente Acción

Segundo parcial: CU-2P-04 (Análisis UML) es el CU activo. Antes de su PR hay que ejecutar la suite real de Qwen y hacer la revisión manual en navegador. En el track histórico, planificar CU-11 según `docs/puds/use-cases/README.md` cuando se autorice (plan, aprobación del usuario y OpenSpec). Opcionalmente, crear un correctivo separado `fix-cu-10-...` para mejorar y medir el analizador de imágenes con capturas nuevas.
