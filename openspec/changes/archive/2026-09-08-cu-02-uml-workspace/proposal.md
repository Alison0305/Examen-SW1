## Why

CU-02 es necesario para cerrar el Ciclo 1 con una ruta única de mutación y un primer workspace UML manual usable en memoria. CU-01 ya dejó `ProjectDocument`, `CanonicalUmlModel`, `DiagramLayout` y validación; ahora el editor debe operar sobre ese núcleo sin convertir React Flow ni el estado de UI en fuente de verdad.

## What Changes

- Se definirá `UmlCommand` como contrato cerrado para mutaciones UML manuales iniciales.
- Se incorporará `UmlCommandBus`, `UmlCommandExecutor`, `CommandResult` e historial local con Undo/Redo.
- Se permitirá usar snapshots internos de `ProjectDocument` para Undo/Redo como solución inicial simple y segura.
- Se agregarán comandos para clases, atributos, enumeraciones, literales, relaciones, multiplicidades y layout.
- Se integrará cada comando aceptado con el validador existente de CU-01.
- Se construirá un workspace UML manual local en memoria con App Bar, Sidebar, Breadcrumbs, Toolbox, Canvas UML, Inspector y Status Bar.
- Se proyectará `ProjectDocument` hacia React Flow sin persistir React Flow como dominio.
- Se integrará `@xyflow/react` para canvas, Zustand para estado de UI y coordinación, y ELK.js para auto-layout durante la implementación.
- Se mostrarán diagnósticos visibles, contador de errores/warnings y navegación desde diagnóstico al elemento afectado.
- Se agregará responsive básico para priorizar el canvas y mover Sidebar/Inspector a drawers en pantallas pequeñas.
- Se mantendrán fuera de alcance persistencia, autenticación, colaboración, generación, IA, voz, XMI, Android y capacidades de CU-03 o posteriores.

## Capabilities

### New Capabilities

- `uml-workspace`: Command Bus, Undo/Redo y workspace UML manual local en memoria, basado en `ProjectDocument`, con edición de clases, enums, atributos, relaciones, multiplicidades, layout, validación, diagnósticos navegables, auto-layout y responsive básico.

### Modified Capabilities

- Ninguna.

## Impact

- Código previsto: `uml-core/` para Command Bus e historial; `frontend/` para workspace UML, canvas, toolbox, inspector, estado de UI, diagnósticos y responsive básico.
- Dependencias previstas durante implementación: `@xyflow/react`, Zustand y ELK.js, sin instalarlas en esta fase de planificación.
- Tests previstos: nuevas pruebas unitarias de comandos e historial en `uml-core`, pruebas de workspace en frontend, y mantenimiento de tests existentes de CU-00 y CU-01.
- Documentación prevista: actualización de `README.md`, `docs/STATUS.md`, `docs/HANDOFF.md` y creación posterior del documento de CU-02 cuando se implemente.
- Sistemas fuera de impacto en CU-02: `backend/`, base de datos, Prisma, PostgreSQL, autenticación, Socket.IO, generación Spring Boot, OpenAPI, Postman, Domain Manifest, IA, voz, XMI y Capacitor.
