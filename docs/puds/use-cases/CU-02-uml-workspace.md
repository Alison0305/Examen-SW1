# CU-02 - Command Bus, Undo/Redo y workspace UML manual

## Objetivo

Establecer el primer workspace UML manual local en memoria, basado en `ProjectDocument`, con una ruta unica de mutacion mediante comandos, historial Undo/Redo, canvas UML, inspector, diagnosticos navegables, auto-layout y responsive basico.

## Alcance

- Command Bus y executor determinista en `uml-core/`.
- Comandos para clases, enumeraciones, atributos, relaciones, multiplicidades, movimiento visual y aplicacion masiva de layout.
- Historial local con Undo/Redo, limite inicial de 100 operaciones y descarte configurable.
- Ruta `/workspace` en Next.js App Router.
- Canvas React Flow como proyeccion visual del modelo, sin persistir React Flow como dominio.
- Estado UI local con Zustand para herramienta activa, seleccion, ultimo resultado, diagnosticos, foco visual y contadores.
- Inspector para editar clases, enums, atributos, relaciones y multiplicidades mediante Command Bus.
- Auto-layout con ELK.js aplicado como una sola operacion `ApplyLayout` sobre `DiagramLayout`.
- Diagnosticos de validacion y de comandos rechazados con severidad, codigo, mensaje, path y navegacion cuando existe elemento visual seleccionable.
- Responsive basico con Sidebar e Inspector en drawers para pantallas pequenas.

## Dependencias

- `@xyflow/react` para el canvas UML.
- Zustand para coordinacion de UI local.
- `elkjs` para calculo de posiciones visuales.
- `@examen-sw1/uml-core` como paquete local compartido.

## Implementacion Realizada

- Se agregaron contratos `UmlCommand`, `CommandResult`, `UmlCommandExecutor` y `UmlCommandBus`.
- Se implementaron comandos aceptados/rechazados con diagnostics estructurados y documento sin cambios ante rechazos.
- Se implemento eliminacion determinista de clases/enums con rechazo ante referencias externas de tipos.
- Se implemento `MoveElement` para actualizar exclusivamente `DiagramLayout`.
- Se implemento `ApplyLayout` para aplicar multiples posiciones como una sola operacion visual undoable.
- Se creo el workspace `/workspace` con App Bar, Sidebar, Toolbox, Canvas, Inspector y Status Bar.
- Se proyecto `CanonicalUmlModel` a nodos y edges de React Flow.
- Se conservaron las reglas visuales UML: Association simple, Aggregation con diamante hueco en origen, Composition con diamante relleno en origen y Generalization con triangulo hueco en destino.
- Se mantuvieron multiplicidades separadas por extremo en la proyeccion visual.
- Se agrego auto-layout con ELK.js mediante adaptador `calculateAutoLayout()` y comando `ApplyLayout`.
- Se separaron diagnosticos de comando y diagnosticos de documento en el store del workspace.
- Se agregaron contadores de errores y warnings en la barra de estado.
- Se agrego navegacion desde diagnosticos hacia seleccion y centrado del elemento visual cuando corresponde.
- Se mostro diagnostico sin accion de navegacion cuando el `elementId` no corresponde a un elemento visual seleccionable.
- Se agrego responsive basico con Sidebar e Inspector como drawers en pantallas pequenas.

## Decisiones Tecnicas

- `CanonicalUmlModel` sigue siendo la fuente de verdad semantica.
- `DiagramLayout` contiene solo posiciones y dimensiones visuales.
- React Flow es una proyeccion visual y no se guarda como dominio persistido.
- Toda mutacion persistente del documento pasa por `UmlCommandBus`.
- ELK.js calcula posiciones, pero el resultado se aplica mediante `ApplyLayout` y no altera clases, atributos, enums, relaciones, tipos ni multiplicidades.
- Cada ejecucion de auto-layout genera una sola entrada de historial aunque actualice varias posiciones.
- Los eventos intermedios de drag solo afectan estado visual local; el Command Bus recibe un unico `MoveElement` al finalizar el drag.

## Archivos Principales

- `uml-core/src/commands/command.ts`
- `uml-core/src/commands/executor.ts`
- `uml-core/src/commands/command-bus.ts`
- `uml-core/src/commands/command-bus.test.ts`
- `frontend/app/workspace/page.tsx`
- `frontend/app/workspace/workspace-client.tsx`
- `frontend/app/workspace/workspace-store.ts`
- `frontend/app/workspace/react-flow-adapters.ts`
- `frontend/app/workspace/auto-layout.ts`
- `frontend/app/workspace/uml-edge.tsx`
- `frontend/app/workspace/uml-nodes.tsx`
- `frontend/app/workspace/workspace-client.test.tsx`

## Pruebas Automatizadas

- `npm run typecheck --workspace @examen-sw1/uml-core`: correcto.
- `npm run typecheck --workspace frontend`: correcto.
- `npm run test --workspace @examen-sw1/uml-core`: correcto, 53 tests.
- `npm run test --workspace frontend`: correcto, 42 tests.
- `npm run lint`: correcto.
- `npm run typecheck`: correcto.
- `npm run test`: correcto, 99 tests distribuidos en frontend 42, backend 4 y `uml-core` 53.
- `npm run build`: correcto.

## Prueba Manual

Pendiente por el usuario en la tarea 3.16:

- Abrir workspace.
- Crear `Cliente`.
- Agregar atributos `id` y `nombre`.
- Crear `Pedido`.
- Crear `EstadoPedido` con literales.
- Crear relacion `Cliente 1` a `0..* Pedido`.
- Mover nodos.
- Ejecutar auto-layout.
- Ejecutar Undo y Redo.
- Editar desde Inspector.
- Provocar o cargar diagnostico y navegar al elemento.

## Errores Encontrados

- Durante la instalacion de dependencias, `npm install` reporto advertencia de scripts no aprobados para `esbuild@0.28.2`.
- `npm install` reporto 2 vulnerabilidades transitivas. No se ejecuto `npm audit fix --force` para evitar upgrades mayores o cambios fuera del alcance de CU-02.
- Fallo detectado durante prueba manual 3.16: multiplicidades persistian en el modelo/Inspector pero no se renderizaban en canvas. Corregido antes de continuar la prueba.
- Segundo hallazgo durante prueba manual 3.16: al guardar una multiplicidad se perdia el borrador no guardado del extremo opuesto. La causa fue un `useEffect` del Inspector de relaciones que reinicializaba ambos inputs cuando el Command Bus entregaba un nuevo snapshot de `ProjectDocument`.
- Hallazgo durante prueba manual 3.16: no existia una accion visible para `DeleteClass` ni `DeleteEnumeration`, aunque los comandos ya estaban disponibles en `uml-core/`.
- Hallazgo durante prueba manual 3.16: el canvas hacia auto-pan al arrastrar un nodo cerca de sus limites.
- Hallazgo durante prueba manual 3.16: el Inspector mostraba un formulario completo por cada atributo, generando crecimiento vertical excesivo y mucho scroll.
- Durante la prueba manual 3.16 se detecto que las etiquetas inglesas de Undo/Redo y Fit view, los botones extensos de literales y la ausencia de visibilidad UML en encabezados reducian fidelidad y claridad visual.
- Durante la prueba manual 3.16 se detecto que Ajustar vista estaba duplicado entre App Bar y Toolbox, y que Association, Aggregation y Composition requerian un nombre UML opcional editable.
- Durante la prueba manual 3.16 se detecto que el Toolbox horizontal reducia el canvas, las relaciones usaban curvas y las multiplicidades podian quedar ocultas tras nodos; Generalization tambien mostraba controles de multiplicidad impropios.
- Durante la prueba manual 3.16 el canvas mostro controles y atribucion de React Flow sin estilo; se movio su stylesheet a la entrada global local del App Router para asegurar su emision por Next.js.
- Tras corregir la geometria medida, Aggregation y Composition seguian sin mostrar sus rombos porque `markerStart` era fragil dentro del SVG del custom edge.

## Correcciones

- Se corrigio la fidelidad visual UML de relaciones para no mezclar multiplicidades en una unica etiqueta.
- Se agrego capa accesible minima del canvas para pruebas e interaccion en JSDOM.
- Se agrego `ApplyLayout` para evitar aplicar auto-layout como multiples `MoveElement` independientes.
- Se ajusto la navegacion de diagnostics para no ofrecer accion `Ir` cuando el elemento diagnosticado no tiene nodo/edge visual seleccionable.
- Se corrigio el posicionamiento/render visual de multiplicidades para renderizar `sourceMultiplicityLabel` y `targetMultiplicityLabel` como etiquetas independientes cerca de cada extremo de la relacion.
- Se separaron `sourceMultiplicityDraft` y `targetMultiplicityDraft` en el Inspector de relaciones. Ambos se inicializan solo al seleccionar otra relacion, conservan el borrador opuesto tras guardar una multiplicidad y se agregaron regresiones para ambos ordenes de guardado.
- Se agregaron botones `Eliminar clase` y `Eliminar enum` en los inspectores. Ambos emiten sus comandos existentes a traves de `UmlCommandBus`, limpian seleccion/foco solo tras exito y preservan los diagnostics ante rechazo.
- Se deshabilito exclusivamente el auto-pan durante node drag con `autoPanOnNodeDrag: false`; se mantienen `panOnDrag`, `zoomOnScroll` y Fit view.
- Se reemplazo el formulario permanente por una lista compacta de atributos con nombre, tipo, Editar y Eliminar. Crear y editar usan un unico formulario bajo demanda; los borradores se preservan ante rechazo, se cierran tras exito o cancelacion y se reinician al cambiar de clase.
- Se reemplazaron los textos Undo/Redo por acciones visuales Deshacer/Rehacer con iconos `↶` y `↷`, tooltip y etiqueta accesible; los contratos internos `undo()` y `redo()` no cambiaron.
- Se tradujo Fit view a Ajustar vista en App Bar y Toolbox sin alterar la llamada interna a `fitView()`.
- Los botones de literales ahora muestran solo Eliminar y conservan una etiqueta accesible con el literal concreto.
- Los nodos de clases y enumeraciones derivan el simbolo UML de visibilidad desde el modelo canónico mediante `visibilitySymbol`: `+`, `-`, `#` y `~`.
- Se dejo Ajustar vista unicamente en App Bar, conservando la llamada interna a `fitView()` y los controles de canvas.
- Se agrego `name` opcional a `UmlRelationship` y el comando `UpdateRelationshipName`. El executor normaliza espacios, elimina el campo para un valor vacio y rechaza nombres para Generalization.
- El Inspector permite guardar nombre para Association, Aggregation y Composition mediante Command Bus; el edge muestra el nombre cuando existe o el tipo como fallback, conservando marcadores UML y multiplicidades independientes.
- Se movio Toolbox al Sidebar izquierdo como lista vertical con SVGs simples y texto accesible; Breadcrumbs, Resumen y Relaciones permanecen debajo como secciones secundarias.
- Se agrego `calculateUmlEdgeRoute()` para proyectar rutas rectas u ortogonales y posiciones de labels desde `DiagramLayout`, sin persistir paths visuales. Generalization usa triangulo hueco hacia el target, sin label central, nombre ni multiplicidades editables o renderizadas.
- Se agrego `app/globals.css`, importado por `app/layout.tsx`, para cargar `@xyflow/react/dist/style.css`; el canvas conserva ancho utilizable, altura minima y posicion relativa. Una regresion verifica que React Flow se monta dentro de `workspace-canvas` y que crear Clase sigue proyectando el nodo.
- Se reemplazo el dibujo efectivo de `markerStart` por un decorator SVG `polygon` derivado del primer segmento: su vertice toca el borde source y el path comienza despues del rombo, por lo que Aggregation queda hueco y Composition lleno sin quedar bajo el nodo.
- Los rombos propios se ajustaron de 12 px a 15 px y las relaciones usan stroke de 1.5 px (2 px seleccionadas). Association, Aggregation y Composition no muestran ya el tipo como fallback: solo muestran un nombre semantico cuando existe. Doble clic sobre estas relaciones abre un editor inline que guarda por `UpdateRelationshipName`; Enter y blur guardan una vez, Escape descarta. Generalization no abre editor ni muestra nombre. La edicion manual de bends, segmentos o puntos de routing queda fuera de CU-02 para una mejora futura.
- Prueba manual 3.16 completada: creacion, movimiento, routing automatico, auto-layout, Undo/Redo, Inspector, eliminacion de clase y enum con restauracion por Undo, y responsive basico fueron aceptados. Tambien se verificaron `UML_DUPLICATE_NAME` y la navegacion IR hacia diagnosticos. La edicion manual de bends permanece diferida fuera de CU-02.
- Verificacion final 3.17 completada: lint, typecheck, suite completa y build pasaron; OpenSpec valida estrictamente con 55/55 tareas. El cambio permanece abierto hasta la aceptacion final del usuario, sin archive, commit ni push.

## Limitaciones Conocidas

- Workspace local en memoria; persistencia, colaboracion y carga/guardado real pertenecen a CUs posteriores.
- Responsive es basico y prioriza acceso funcional al canvas y drawers, sin optimizaciones avanzadas de UX movil.
- La prueba manual 3.16 todavia no fue ejecutada por el usuario.
- No se ejecuto verify final ni archivo OpenSpec porque CU-02 aun requiere prueba manual, validacion/evidencia 3.17, aceptacion del usuario, archive, commit y push.

## Resultado Actual

CU-02 tiene implementados sus tres bloques automatizables principales y los gates finales de raiz pasaron. El progreso OpenSpec es 53/55; siguen pendientes 3.16 y 3.17. El CU no esta cerrado.

## Commit De Cierre

Pendiente. No hay commit de cierre de CU-02 todavia.
