## 1. Incremento 1 — Command Bus y Undo/Redo

- [x] 1.1 Definir contratos `UmlCommand`, payloads iniciales y `CommandResult` exitoso/rechazado en `uml-core/`, verificando con typecheck que todos los comandos previstos están tipados.
- [x] 1.2 Implementar estructura de `CommandResult` con documento actualizado para éxito y diagnósticos estructurados para rechazo, verificando tests unitarios de ambos resultados.
- [x] 1.3 Implementar `UmlCommandExecutor` sobre `ProjectDocument` para `CreateClass` y `RenameClass`, verificando creación, renombrado y rechazo con diagnósticos.
- [x] 1.4 Implementar `DeleteClass` determinista, verificando DeleteClass sin referencias externas, eliminación de relaciones incidentes y eliminación de entrada en `DiagramLayout`.
- [x] 1.5 Implementar rechazo de `DeleteClass` cuando existan referencias de tipo desde atributos, parámetros o `returnType` externos, verificando que no reemplaza tipos ni borra atributos u operaciones externas.
- [x] 1.6 Implementar comandos de atributos `AddAttribute`, `UpdateAttribute` y `RemoveAttribute`, verificando creación, modificación, eliminación y rechazo de referencias inválidas con diagnósticos.
- [x] 1.7 Implementar comandos de enumeraciones `CreateEnumeration`, `RenameEnumeration`, `AddEnumerationLiteral` y `RemoveEnumerationLiteral`, verificando enums y literales con tests unitarios.
- [x] 1.8 Implementar `DeleteEnumeration` determinista, verificando eliminación sin referencias, eliminación de entrada en `DiagramLayout` y rechazo cuando atributos, parámetros o `returnType` referencien la enumeración.
- [x] 1.9 Implementar comandos de relaciones `CreateRelationship`, `DeleteRelationship` y `UpdateMultiplicity`, verificando Association, Aggregation, Composition, Generalization y multiplicidades con tests unitarios.
- [x] 1.10 Implementar rechazo de multiplicidades inválidas con diagnósticos, verificando documento sin cambios e historial sin cambios.
- [x] 1.11 Implementar comando `MoveElement` para actualizar exclusivamente `DiagramLayout`, verificando que no modifica `CanonicalUmlModel`.
- [x] 1.12 Integrar el executor con `validateProjectDocument`, verificando que comandos inválidos devuelven `CommandResult` rechazado con diagnostics, no modifican el documento y no generan historial.
- [x] 1.13 Implementar `UmlCommandBus` con historial local basado en snapshots de `ProjectDocument`, verificando ejecución de comandos aceptados.
- [x] 1.14 Implementar Undo y Redo, verificando restauración de estado anterior y siguiente con tests unitarios.
- [x] 1.15 Implementar limpieza de Redo al ejecutar un comando nuevo después de Undo, verificando el caso con tests unitarios.
- [x] 1.16 Implementar límite inicial configurable de historial de 100 operaciones, verificando descarte de estados antiguos al superar el límite.
- [x] 1.17 Verificar determinismo de resultados e historial para comandos con orden estable esperado mediante tests unitarios repetibles.
- [x] 1.18 Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` desde la raíz, verificando que CU-00 y CU-01 siguen pasando.

## 2. Incremento 2 — Workspace UML manual

- [x] 2.1 Agregar durante la implementación las dependencias frontend necesarias `@xyflow/react` y Zustand, verificando instalación y ausencia de cambios no relacionados.
- [x] 2.2 Crear la ruta o pantalla de workspace UML en Next.js App Router, verificando render inicial con React Testing Library.
- [x] 2.3 Crear estado local de workspace para `ProjectDocument`, selección, herramienta activa, viewport, último `CommandResult` y coordinación UI sin reemplazar el modelo canónico, verificando tests de store/adaptadores.
- [x] 2.4 Implementar layout visual con App Bar, Sidebar, Breadcrumbs, Toolbox, Canvas UML, Inspector y Status Bar, verificando render del workspace.
- [x] 2.5 Implementar toolbox con selección, clase, enum, Association, Aggregation, Composition, Generalization, fit view y acción de auto-layout, verificando acciones visibles.
- [x] 2.6 Implementar proyección de clases desde `ProjectDocument` a nodos custom con nombre, atributos visibles, compartimentos UML y selección visible, verificando render de clase.
- [x] 2.7 Implementar proyección de enumeraciones a nodos custom con estereotipo, nombre y literales, verificando render de enum.
- [x] 2.8 Implementar proyección de relaciones visuales con tipos UML y multiplicidades visibles, verificando Association, Aggregation, Composition y Generalization.
- [x] 2.9 Implementar creación de clase y enum desde toolbox mediante Command Bus, verificando tests de interacción.
- [x] 2.10 Implementar creación y eliminación de relaciones desde canvas/toolbox mediante Command Bus, verificando tests de interacción básica.
- [x] 2.11 Implementar selección de nodos y relaciones y sincronización con Inspector/Status Bar, verificando tests de selección.
- [x] 2.12 Implementar movimiento de nodos para emitir un único `MoveElement` al finalizar cada drag completo, verificando una sola entrada de historial y ausencia de comandos por pixel o evento intermedio.
- [x] 2.13 Implementar controles de zoom, pan y fit view, verificando comportamiento básico del canvas.
- [x] 2.14 Implementar Inspector de clase para nombre, visibilidad, atributos, tipo, visibilidad de atributo y multiplicidad cuando aplique, verificando que toda edición emite comandos.
- [x] 2.15 Implementar visualización de `CommandResult` rechazado en la UI de validación, verificando que los diagnostics se muestran aunque el documento permanezca sin cambios.
- [x] 2.16 Implementar navegación desde diagnóstico de comando rechazado con `elementId` existente hacia selección/enfoque del elemento, verificando test de interacción.
- [x] 2.17 Implementar Inspector de enum para nombre, visibilidad y literales, verificando comandos de edición.
- [x] 2.18 Implementar Inspector de relación para tipo, origen, destino y multiplicidades, verificando comandos de actualización de multiplicidad.
- [x] 2.19 Integrar botones Undo/Redo y estados habilitado/deshabilitado en UI, verificando pruebas de interacción.
- [x] 2.20 Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` desde la raíz, verificando que los incrementos 1 y 2 pasan.

## 3. Incremento 3 — ELK, diagnósticos, responsive e integración

- [x] 3.1 Agregar durante la implementación ELK.js para auto-layout, verificando instalación y compatibilidad con el build.
- [x] 3.2 Implementar adaptador de auto-layout que calcula múltiples posiciones desde el documento y aplica únicamente cambios sobre `DiagramLayout`, verificando tests de no mutación semántica.
- [x] 3.3 Integrar auto-layout obligatoriamente con Command Bus e historial como una sola operación lógica, verificando una única entrada de historial aunque cambien varias posiciones.
- [x] 3.4 Verificar Undo de auto-layout, comprobando que restaura todas las posiciones anteriores afectadas por esa operación.
- [x] 3.5 Verificar Redo de auto-layout, comprobando que reaplica todas las posiciones calculadas por esa operación.
- [x] 3.6 Verificar que auto-layout mantiene `CanonicalUmlModel` idéntico antes y después de aplicar posiciones.
- [x] 3.7 Mostrar diagnósticos del validador y diagnósticos de comandos rechazados en Inspector o sección de Validación, verificando severidad, código, mensaje y path.
- [x] 3.8 Mostrar contador de errores y warnings en el workspace, verificando actualización después de comandos aceptados y rechazados.
- [x] 3.9 Implementar navegación desde diagnóstico hacia elemento visual con selección y enfoque/centrado, verificando test de navegación.
- [x] 3.10 Manejar diagnósticos sin elemento visual seleccionable, verificando que se muestran sin modificar el documento.
- [x] 3.11 Implementar responsive básico con Sidebar y Inspector como drawers en pantallas pequeñas, verificando render adaptable.
- [x] 3.12 Completar pruebas integradas de frontend para render del workspace, creación de clase, creación de enum, selección, edición mediante Inspector, rechazo con diagnostics, movimiento como una sola operación, Undo, Redo, auto-layout undoable, diagnóstico visible y navegación desde diagnóstico.
- [x] 3.13 Crear `docs/puds/use-cases/CU-02-uml-workspace.md` durante la implementación, registrando alcance real, pruebas automatizadas, prueba manual, decisiones, errores, correcciones y limitaciones.
- [x] 3.14 Actualizar `README.md`, `docs/STATUS.md` y `docs/HANDOFF.md` con el avance real de CU-02 sin declarar cierre antes de verify, aceptación, archive, commit y push.
- [x] 3.15 Ejecutar verificación final con `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`, verificando que CU-00, CU-01 y CU-02 pasan.
- [x] 3.16 Ejecutar prueba manual en navegador: abrir workspace, crear Cliente, agregar atributos id y nombre, crear Pedido, crear EstadoPedido con literales, crear relación Cliente 1 a 0..* Pedido, mover nodos, ejecutar auto-layout, Undo, Redo, editar desde Inspector, provocar o cargar diagnóstico y navegar al elemento.
- [x] 3.17 Ejecutar `openspec validate "cu-02-uml-workspace" --strict` y preparar la evidencia para `/opsx-verify` sin archivar antes de aceptación.
