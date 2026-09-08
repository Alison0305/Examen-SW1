## Context

CU-01 dejó implementados `ProjectDocument`, `CanonicalUmlModel`, `DiagramLayout`, serialización JSON y el motor de validación en `uml-core/`. CU-02 debe usar esa base sin rehacerla y agregar la primera ruta de mutación e interfaz manual en memoria. Ver `proposal.md` para motivación y `specs/uml-workspace/spec.md` para comportamiento esperado.

## Goals / Non-Goals

**Goals:**

- Definir una ruta única de mutación para edición manual local.
- Integrar comandos, executor, bus, resultados, validación e historial local.
- Entregar Undo/Redo con límite inicial configurable de 100 operaciones.
- Construir el workspace UML manual con canvas, toolbox, inspector, selección, diagnósticos y responsive básico.
- Proyectar `ProjectDocument` hacia el canvas sin convertir el estado visual de la librería en dominio.
- Integrar auto-layout como operación undoable del Command Bus que aplica únicamente cambios de posición en `DiagramLayout`.

**Non-Goals:**

- No persistir proyectos ni historial.
- No agregar backend, Prisma, PostgreSQL, autenticación, ownership ni rutas protegidas.
- No agregar colaboración, Socket.IO, presencia ni resolución de conflictos multiusuario.
- No implementar generación, RelationalModel, OpenAPI, Postman ni Domain Manifest.
- No implementar IA, lenguaje natural, voz, XMI, visión, Capacitor ni Android.
- No instalar dependencias ni escribir código durante esta fase de planificación.

## Decisions

### Command Bus dentro de `uml-core/`

`UmlCommand`, `CommandResult`, `UmlCommandExecutor`, `UmlCommandBus` e historial local se ubicarán conceptualmente en `uml-core/`.

Rationale: la ruta de mutación debe ser reutilizable por UI manual y futuros adaptadores, y debe operar directamente sobre `ProjectDocument` y el validador existente sin depender de React.

Alternativas consideradas: colocar comandos en `frontend/` para acelerar el workspace. Se descarta porque acopla reglas de dominio a UI y dificultaría reutilización posterior por colaboración, IA, voz o importación.

### Snapshots para Undo/Redo inicial

Undo/Redo puede usar snapshots internos de `ProjectDocument` antes y después de comandos aceptados.

Rationale: es la solución más simple y segura para CU-02, evita diseñar comandos compensatorios complejos y permite validar restauración exacta de estados.

Alternativas consideradas: comandos inversos por tipo. Se descartan para este CU por mayor complejidad y riesgo de inconsistencias en relaciones, atributos y layout.

### CommandResult exitoso o rechazado

Cada intento de comando devolverá un `CommandResult`. Los comandos aceptados devolverán éxito con el documento actualizado. Los comandos rechazados devolverán rechazo, conservarán el documento anterior y podrán incluir diagnósticos estructurados derivados de validar el estado propuesto o de reglas previas del executor.

Rationale: la UI necesita feedback navegable para operaciones inválidas sin almacenar un modelo inválido ni crear historial de comandos rechazados.

Alternativas consideradas: lanzar excepciones o mostrar errores solo en formularios. Se descartan porque no ofrecen un contrato uniforme para canvas, inspector, tests y futuros adaptadores.

### Validación después de cada comando aceptado o propuesto

El executor aplicará comandos sobre una copia o snapshot controlado del documento y validará el resultado antes de aceptarlo. Si la validación falla, el resultado será rechazado con diagnósticos y el documento original seguirá intacto.

Rationale: un comando inválido no debe mutar el documento ni entrar al historial, pero sí debe poder informar diagnósticos estructurados. CU-01 ya provee el validador reutilizable.

Alternativas consideradas: validar solo desde UI. Se descarta porque dejaría rutas de mutación futuras con reglas paralelas.

### Separación entre dominio, layout y estado de UI

`CanonicalUmlModel` seguirá conteniendo semántica; `DiagramLayout` contendrá posiciones y dimensiones; Zustand podrá guardar selección, modo de herramienta, drawers y coordinación de UI, pero no reemplazará el dominio.

Rationale: respeta la arquitectura del producto y evita que React Flow o Zustand se conviertan en fuente persistida.

Alternativas consideradas: guardar nodos/edges de React Flow como documento. Se descarta porque mezcla detalles visuales de librería con semántica UML.

### Adaptadores de canvas e inspector

Canvas, toolbox e inspector serán adaptadores que emiten comandos. El cierre de una interacción de movimiento producirá `MoveElement`; los formularios producirán comandos específicos de clase, atributo, enum, relación o multiplicidad.

Rationale: mantiene una única ruta conceptual de mutación y evita edición directa desde componentes React.

Alternativas consideradas: mutar store local directamente desde componentes. Se descarta porque rompería Undo/Redo, validación centralizada y futuros adaptadores.

### Nombre UML opcional de relaciones nombrables

`UmlRelationship` puede contener `name` opcional para Association, Aggregation y Composition. El Inspector emite `UpdateRelationshipName`, cuyo executor normaliza espacios y elimina el campo cuando queda vacío. Generalization no expone edición de nombre en este CU.

Rationale: el nombre es semántica UML y debe persistir en `CanonicalUmlModel`, entrar al historial y proyectarse al edge sin reemplazar los marcadores que distinguen cada tipo de relación.

### Drag como una sola operación lógica

El arrastre de un nodo podrá tener muchos eventos visuales intermedios, pero solo el final del drag deberá emitir un `MoveElement` hacia el Command Bus y registrar una entrada de historial.

Rationale: registrar una operación por pixel o evento intermedio consumiría rápidamente el límite de 100 operaciones y haría Undo/Redo poco útil.

Alternativas consideradas: emitir comandos durante cada movimiento intermedio. Se descarta porque mezcla feedback visual transitorio con mutaciones semánticas confirmadas de layout.

### Delete determinista y no destructivo implícito

`DeleteClass` eliminará la clase, su entrada de `DiagramLayout` y las relaciones donde participe como `sourceId` o `targetId`, siempre que otros elementos no la referencien como tipo. Si atributos, parámetros o `returnType` externos referencian esa clase, el comando será rechazado. `DeleteEnumeration` eliminará la enumeración y su entrada de layout solo si ningún atributo, parámetro o `returnType` la referencia.

Rationale: eliminar relaciones incidentes evita referencias rotas directas, pero borrar o cambiar tipos en elementos externos sería una mutación destructiva implícita y difícil de anticipar para el usuario.

Alternativas consideradas: reemplazar tipos automáticamente por primitivos o borrar atributos/operaciones externas. Se descartan porque ocultan pérdida de información y pueden cambiar el modelo más allá de la intención del comando.

### React Flow como proyección visual

Durante implementación se usará `@xyflow/react` para renderizar nodos y relaciones proyectados desde `ProjectDocument`.

Rationale: es el stack decidido para canvas UML, ofrece zoom, pan, selección, fit view, nodos custom y edges custom.

Alternativas consideradas: SVG manual o DOM custom. Se descartan porque aumentan el costo de interacción y layout sin aportar valor al CU.

### Routing visual derivado

El routing de edges se calcula como proyección pura de posiciones y dimensiones de `DiagramLayout`: líneas rectas cuando los extremos están alineados y segmentos ortogonales en los demás casos. Las etiquetas de multiplicidad se ubican junto a los segmentos de salida y llegada, fuera de nodos. No se persisten paths, bends ni handles en el dominio.

### ELK solo para posiciones y auto-layout undoable

ELK.js calculará posiciones de nodos y el resultado se aplicará como cambios de `DiagramLayout` mediante Command Bus. Cada ejecución de auto-layout será una sola operación lógica de historial aunque actualice varias posiciones.

Rationale: auto-layout debe ser determinista sobre lo visual, no alterar clases, atributos, enums, relaciones, tipos ni multiplicidades, y debe poder deshacerse o rehacerse de forma completa.

Alternativas consideradas: dejar auto-layout fuera de CU-02. Se descarta porque el roadmap lo incluye como parte del editor manual usable del Ciclo 1.

### Diagnósticos navegables

Los diagnósticos del validador se mostrarán en el workspace y el Inspector. Cuando tengan `elementId`, la UI intentará seleccionar y centrar el elemento visual correspondiente.

Rationale: CU-01 ya genera diagnósticos estructurados; CU-02 debe demostrar navegación básica desde validación hacia canvas.

Alternativas consideradas: mostrar solo conteos. Se descarta porque no cumple el comportamiento usable esperado.

### Responsive básico con canvas prioritario

En escritorio se usará distribución Sidebar | Canvas | Inspector. En pantallas pequeñas, Sidebar e Inspector podrán moverse a drawers y acciones secundarias a menú.

Rationale: preserva usabilidad básica sin diseñar una experiencia mobile completa, que pertenece a CUs posteriores.

Alternativas consideradas: soportar solo escritorio. Se descarta porque la UI del producto debe ser responsive desde el editor inicial.

## Risks / Trade-offs

- [Risk] Los snapshots pueden consumir memoria con modelos grandes → Mitigation: usar límite configurable inicial de 100 operaciones y reevaluar estrategias más eficientes en CUs posteriores si aparece necesidad real.
- [Risk] React Flow puede inducir mutaciones directas desde callbacks → Mitigation: tratar cada callback como adaptador que emite comandos y cubrirlo con tests.
- [Risk] La creación de relaciones desde UI puede ser compleja → Mitigation: planificar interacciones mínimas comprobables y mover refinamientos avanzados a iteraciones posteriores si no cambian el contrato.
- [Risk] ELK puede producir posiciones visuales inesperadas → Mitigation: limitarlo a layout, registrar una sola operación undoable y permitir mover elementos manualmente después.
- [Risk] Responsive del canvas puede crecer demasiado → Mitigation: limitar CU-02 a responsive básico con drawers y canvas prioritario.

## Migration Plan

- Agregar Command Bus e historial en `uml-core/` reutilizando `ProjectDocument` y validación existentes.
- Integrar scripts raíz existentes sin cambiar el flujo de verificación.
- Agregar dependencias de canvas, estado UI y layout solo durante la implementación, no durante planificación.
- Implementar workspace local en memoria sin backend ni persistencia.
- Mantener compatibilidad con tests de CU-00 y CU-01.
- Documentar prueba manual del workspace antes del cierre de CU-02.
