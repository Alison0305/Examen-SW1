## Purpose

Define el primer workspace UML manual usable en memoria y la ruta única de mutación con Command Bus, Undo/Redo, validación, diagnósticos navegables, auto-layout y responsive básico sobre `ProjectDocument`.

## ADDED Requirements

### Requirement: Optional relationship labels
The workspace SHALL render the label of an Association, Aggregation, or Composition only when `UmlRelationship.name` is present, and SHALL persist inline edits through `UpdateRelationshipName`.

#### Scenario: Edit a relationship label inline
- **WHEN** the user double-clicks a nameable relationship and confirms a name
- **THEN** the Command Bus updates the canonical relationship name and the projected edge renders it

### Requirement: Workspace UML local en memoria
El sistema SHALL permitir abrir un workspace UML manual que trabaje sobre un `ProjectDocument` local en memoria, sin persistencia ni servicios externos durante CU-02.

#### Scenario: Apertura del workspace
- **WHEN** el usuario accede al workspace UML de CU-02
- **THEN** el sistema muestra un documento UML local inicial listo para edición manual

#### Scenario: Documento local en memoria
- **WHEN** el usuario crea o edita elementos en el workspace
- **THEN** los cambios se reflejan en el `ProjectDocument` local sin requerir base de datos, autenticación ni backend de persistencia

#### Scenario: Sin reaplicar CU-01
- **WHEN** el workspace necesita modelo, layout o validación
- **THEN** reutiliza las capacidades existentes de CU-01 en lugar de redefinir otra fuente de verdad UML

### Requirement: Ruta única de mutación UML
El sistema SHALL canalizar toda mutación UML manual mediante comandos ejecutados por un Command Bus antes de modificar el `ProjectDocument`, y SHALL devolver un `CommandResult` exitoso o rechazado para cada intento de mutación.

#### Scenario: Mutación desde UI
- **WHEN** una acción de UI solicita crear, modificar, mover o eliminar un elemento UML
- **THEN** la acción se traduce a un comando UML antes de modificar el documento

#### Scenario: Mutación desde canvas
- **WHEN** el usuario completa el movimiento de un nodo en el canvas
- **THEN** el movimiento se aplica mediante un comando de layout y actualiza `DiagramLayout`

#### Scenario: Mutación desde Inspector
- **WHEN** el usuario edita propiedades en el Inspector
- **THEN** la edición se aplica mediante un comando UML y no mediante modificación directa del modelo

#### Scenario: CommandResult exitoso
- **WHEN** un comando válido se ejecuta correctamente
- **THEN** el resultado indica éxito, incluye el documento actualizado y puede incluir diagnósticos del documento resultante

#### Scenario: CommandResult rechazado con diagnósticos
- **WHEN** un comando no cumple las reglas del modelo o de validación
- **THEN** el resultado indica rechazo y puede incluir diagnósticos estructurados provenientes de la validación

#### Scenario: Documento sin cambios ante rechazo
- **WHEN** un comando se rechaza
- **THEN** el `ProjectDocument` conserva exactamente el estado anterior al intento de comando

#### Scenario: Historial sin cambios ante rechazo
- **WHEN** un comando se rechaza
- **THEN** el comando no se incorpora al historial y no altera la disponibilidad de Undo ni Redo

#### Scenario: Diagnósticos de rechazo visibles
- **WHEN** un comando rechazado devuelve diagnósticos estructurados
- **THEN** el workspace puede mostrarlos en la UI de validación aunque el documento permanezca sin cambios

#### Scenario: Diagnóstico de rechazo navegable
- **WHEN** un diagnóstico de comando rechazado tiene `elementId` de un elemento existente
- **THEN** la UI puede seleccionar y enfocar ese elemento sin modificar el documento

### Requirement: Comandos de clases, atributos y enumeraciones
El sistema SHALL soportar comandos manuales iniciales para crear, renombrar y eliminar clases, atributos y enumeraciones dentro del modelo UML.

#### Scenario: Crear clase
- **WHEN** el usuario solicita crear una clase desde el workspace
- **THEN** se agrega una clase UML válida al `CanonicalUmlModel` y su entrada visual en `DiagramLayout`

#### Scenario: Renombrar clase
- **WHEN** el usuario renombra una clase existente
- **THEN** el nombre de la clase cambia en el modelo canónico conservando su identidad

#### Scenario: DeleteClass sin referencias externas
- **WHEN** el usuario elimina una clase que no es referenciada como tipo por otros elementos
- **THEN** la clase se elimina del `CanonicalUmlModel`

#### Scenario: DeleteClass elimina relaciones incidentes
- **WHEN** una clase eliminable participa como `sourceId` o `targetId` de relaciones UML
- **THEN** esas relaciones incidentes se eliminan junto con la clase

#### Scenario: DeleteClass elimina layout
- **WHEN** una clase eliminable tiene entrada en `DiagramLayout`
- **THEN** su entrada visual se elimina junto con la clase

#### Scenario: DeleteClass rechazado por referencia de tipo
- **WHEN** otra clase, atributo, parámetro o `returnType` referencia la clase como tipo
- **THEN** `DeleteClass` se rechaza sin reemplazar tipos ni borrar atributos u operaciones externas automáticamente

#### Scenario: Agregar atributo
- **WHEN** el usuario agrega un atributo a una clase
- **THEN** el atributo queda asociado a esa clase con nombre, visibilidad, tipo y multiplicidad opcional válidos

#### Scenario: Actualizar atributo
- **WHEN** el usuario modifica nombre, visibilidad, tipo o multiplicidad de un atributo
- **THEN** el atributo se actualiza mediante comando y el modelo resultante se valida

#### Scenario: Remover atributo
- **WHEN** el usuario remueve un atributo existente
- **THEN** el atributo deja de formar parte de la clase sin afectar otros elementos no relacionados

#### Scenario: Crear enumeración
- **WHEN** el usuario solicita crear una enumeración
- **THEN** se agrega una enumeración UML válida al `CanonicalUmlModel` y su entrada visual en `DiagramLayout`

#### Scenario: Renombrar enumeración
- **WHEN** el usuario renombra una enumeración existente
- **THEN** el nombre cambia conservando la identidad y las referencias válidas

#### Scenario: DeleteEnumeration sin referencias
- **WHEN** el usuario elimina una enumeración que no es referenciada como tipo por atributos, parámetros ni `returnType`
- **THEN** la enumeración se elimina del `CanonicalUmlModel`

#### Scenario: DeleteEnumeration elimina layout
- **WHEN** una enumeración eliminable tiene entrada en `DiagramLayout`
- **THEN** su entrada visual se elimina junto con la enumeración

#### Scenario: DeleteEnumeration rechazado por referencia de tipo
- **WHEN** algún atributo, parámetro o `returnType` referencia la enumeración como tipo
- **THEN** `DeleteEnumeration` se rechaza sin reemplazar tipos ni borrar atributos u operaciones automáticamente

#### Scenario: Literales de enumeración
- **WHEN** el usuario agrega o remueve literales de una enumeración
- **THEN** los literales se actualizan en el modelo canónico mediante comandos

### Requirement: Comandos de relaciones y multiplicidades
El sistema SHALL permitir crear, eliminar y configurar relaciones UML de tipo Association, Aggregation, Composition y Generalization con multiplicidades estructuradas.

#### Scenario: Crear relación Association
- **WHEN** el usuario conecta dos elementos mediante Association
- **THEN** se crea una relación Association válida entre origen y destino existentes

#### Scenario: Nombrar relación UML opcional
- **WHEN** el usuario asigna o limpia un nombre para una Association, Aggregation o Composition
- **THEN** el nombre normalizado se actualiza mediante comando en el `CanonicalUmlModel`, puede quedar ausente si está vacío y el tipo de relación se conserva independientemente

#### Scenario: Generalization sin nombre editable
- **WHEN** el usuario selecciona una Generalization
- **THEN** el Inspector no ofrece edición de nombre para esa relación

#### Scenario: Crear relación Aggregation
- **WHEN** el usuario conecta dos elementos mediante Aggregation
- **THEN** se crea una relación Aggregation válida entre origen y destino existentes

#### Scenario: Crear relación Composition
- **WHEN** el usuario conecta dos elementos mediante Composition
- **THEN** se crea una relación Composition válida entre origen y destino existentes

#### Scenario: Crear relación Generalization
- **WHEN** el usuario conecta dos clases mediante Generalization
- **THEN** se crea una generalización válida entre clase especializada y clase general

#### Scenario: Eliminar relación
- **WHEN** el usuario elimina una relación existente
- **THEN** la relación deja de existir en el modelo sin modificar clases, atributos ni enumeraciones no relacionadas

#### Scenario: Configurar multiplicidad
- **WHEN** el usuario configura multiplicidad de origen o destino de una relación
- **THEN** la multiplicidad queda representada mediante estructura `lower` y `upper` válida

#### Scenario: Rechazar multiplicidad inválida
- **WHEN** el usuario intenta aplicar una multiplicidad con `lower` negativo o `upper` finito menor que `lower`
- **THEN** el comando se rechaza y el documento conserva el estado anterior

### Requirement: Historial local Undo y Redo
El sistema SHALL mantener historial local de operaciones aceptadas con Undo y Redo, límite inicial configurable de 100 operaciones y limpieza de Redo cuando se ejecuta un comando nuevo después de Undo.

#### Scenario: Historial de comando aceptado
- **WHEN** un comando se ejecuta correctamente
- **THEN** el estado anterior queda disponible para Undo dentro del historial local

#### Scenario: Undo restaura estado anterior
- **WHEN** el usuario ejecuta Undo después de una operación aceptada
- **THEN** el `ProjectDocument` vuelve al estado anterior correspondiente

#### Scenario: Redo restaura estado siguiente
- **WHEN** el usuario ejecuta Redo después de Undo
- **THEN** el `ProjectDocument` vuelve al estado posterior correspondiente

#### Scenario: Comando nuevo limpia Redo
- **WHEN** el usuario ejecuta un comando nuevo después de Undo
- **THEN** el historial de Redo se limpia

#### Scenario: Límite de historial
- **WHEN** el historial supera el límite configurado de operaciones
- **THEN** el sistema conserva solo las operaciones más recientes dentro de ese límite

#### Scenario: Estado habilitado de Undo y Redo
- **WHEN** no hay estados disponibles para Undo o Redo
- **THEN** las acciones correspondientes aparecen deshabilitadas o no ejecutan cambios

### Requirement: Proyección visual del documento UML
El sistema SHALL proyectar `ProjectDocument` hacia el canvas visual sin convertir el estado interno del canvas en dominio persistido ni fuente de verdad.

#### Scenario: Render de clases
- **WHEN** el documento contiene clases UML
- **THEN** el canvas muestra nodos de clase con nombre, atributos visibles y compartimentos UML

#### Scenario: Render de enumeraciones
- **WHEN** el documento contiene enumeraciones UML
- **THEN** el canvas muestra nodos de enumeración con estereotipo, nombre y literales visibles

#### Scenario: Render de relaciones
- **WHEN** el documento contiene relaciones UML
- **THEN** el canvas muestra relaciones visuales con tipo UML y multiplicidades visibles cuando existan

#### Scenario: Routing visual de relaciones
- **WHEN** cambia la posición visual de un clasificador
- **THEN** el canvas recalcula una ruta recta u ortogonal desde `DiagramLayout` sin persistir bends o paths en el modelo canónico

#### Scenario: Generalization UML limpia
- **WHEN** el canvas muestra una Generalization
- **THEN** renderiza un triángulo hueco hacia el classifier general, sin etiqueta central ni multiplicidades

#### Scenario: Render de nombre de relación
- **WHEN** una Association, Aggregation o Composition tiene nombre
- **THEN** el canvas muestra ese nombre como etiqueta central sin alterar sus marcadores UML ni sus multiplicidades independientes

#### Scenario: Fuente de verdad semántica
- **WHEN** el canvas renderiza nodos y edges
- **THEN** la semántica proviene de `CanonicalUmlModel` y no del estado interno del canvas

#### Scenario: Fuente de verdad visual
- **WHEN** el canvas necesita posiciones de elementos
- **THEN** las posiciones provienen de `DiagramLayout`

### Requirement: Interacción manual del canvas
El sistema SHALL permitir seleccionar elementos, mover elementos, hacer zoom, hacer pan y ejecutar fit view en el workspace UML.

#### Scenario: Seleccionar elemento
- **WHEN** el usuario selecciona un nodo o relación en el canvas
- **THEN** el workspace refleja la selección y muestra sus propiedades relevantes

#### Scenario: Mover elemento
- **WHEN** el usuario completa el arrastre de un nodo UML
- **THEN** el cambio de posición se registra mediante un único comando `MoveElement` y actualiza únicamente información visual de layout

#### Scenario: Drag completo como una operación
- **WHEN** un usuario arrastra un nodo durante varios movimientos intermedios
- **THEN** el workspace registra una sola operación lógica de historial al finalizar el drag, no una operación por pixel ni por evento intermedio

#### Scenario: Zoom
- **WHEN** el usuario usa controles o gestos de zoom
- **THEN** el canvas cambia el nivel de zoom sin alterar el modelo canónico

#### Scenario: Pan
- **WHEN** el usuario desplaza la vista del canvas
- **THEN** el viewport cambia sin alterar el modelo canónico

#### Scenario: Fit view
- **WHEN** el usuario ejecuta fit view
- **THEN** el canvas ajusta la vista al contenido disponible sin modificar semántica UML

### Requirement: Inspector de edición UML
El sistema SHALL permitir editar clases, enumeraciones, atributos, relaciones y multiplicidades desde un Inspector, enviando toda edición mediante comandos UML.

#### Scenario: Inspector de clase
- **WHEN** el usuario selecciona una clase
- **THEN** el Inspector permite editar nombre, visibilidad y atributos de la clase

#### Scenario: Inspector de atributo
- **WHEN** el usuario edita un atributo desde el Inspector
- **THEN** puede modificar nombre, tipo, visibilidad y multiplicidad aplicando comandos

#### Scenario: Inspector de enumeración
- **WHEN** el usuario selecciona una enumeración
- **THEN** el Inspector permite editar nombre, visibilidad y literales mediante comandos

#### Scenario: Inspector de relación
- **WHEN** el usuario selecciona una relación
- **THEN** el Inspector permite revisar tipo, origen, destino y editar multiplicidades mediante comandos

#### Scenario: Nombre de relación desde Inspector
- **WHEN** el usuario edita el nombre opcional de una Association, Aggregation o Composition desde Inspector
- **THEN** el cambio se aplica mediante Command Bus y se refleja en la etiqueta del edge

#### Scenario: Edición inválida desde Inspector
- **WHEN** el Inspector intenta aplicar una edición inválida
- **THEN** el sistema rechaza el comando y conserva el documento anterior

### Requirement: Validación y diagnósticos navegables
El sistema SHALL validar el documento local, mostrar diagnósticos estructurados, contar errores y warnings, y permitir navegar desde un diagnóstico hasta el elemento afectado.

#### Scenario: Mostrar diagnósticos
- **WHEN** la validación produce errores o warnings
- **THEN** el workspace muestra los diagnósticos con severidad, código, mensaje y path lógico

#### Scenario: Contador de diagnósticos
- **WHEN** existen diagnósticos en el documento
- **THEN** el workspace muestra un contador de errores y warnings

#### Scenario: Navegar desde diagnóstico
- **WHEN** el usuario activa un diagnóstico asociado a un elemento
- **THEN** el canvas selecciona y enfoca el elemento correspondiente cuando exista representación visual

#### Scenario: Diagnóstico sin elemento visual
- **WHEN** un diagnóstico no puede asociarse a un elemento visible
- **THEN** el workspace muestra el diagnóstico sin intentar modificar el modelo ni seleccionar un elemento inexistente

#### Scenario: Validación después de comando
- **WHEN** se ejecuta un comando aceptado
- **THEN** el workspace actualiza el resultado de validación del documento local

#### Scenario: Diagnósticos de comando rechazado
- **WHEN** un comando rechazado devuelve diagnósticos sin modificar el documento
- **THEN** el workspace muestra esos diagnósticos como feedback de la operación inválida

### Requirement: Auto-layout de elementos visuales
El sistema SHALL permitir ejecutar auto-layout para calcular posiciones visuales, aplicar el resultado únicamente sobre `DiagramLayout` e integrarlo obligatoriamente con Command Bus e historial como una sola operación lógica.

#### Scenario: Ejecutar auto-layout
- **WHEN** el usuario solicita auto-layout
- **THEN** el sistema calcula nuevas posiciones para elementos visuales del workspace

#### Scenario: Auto-layout cambia varias posiciones
- **WHEN** el auto-layout calcula posiciones para varios nodos
- **THEN** `DiagramLayout` refleja las nuevas posiciones de esos nodos

#### Scenario: Auto-layout como una sola operación de historial
- **WHEN** el auto-layout actualiza la posición de varios nodos
- **THEN** el historial registra una sola operación lógica para todo el resultado calculado

#### Scenario: Undo de auto-layout
- **WHEN** el usuario ejecuta Undo después de auto-layout
- **THEN** se restauran todas las posiciones anteriores afectadas por esa operación

#### Scenario: Redo de auto-layout
- **WHEN** el usuario ejecuta Redo después de deshacer auto-layout
- **THEN** se reaplican todas las posiciones calculadas por esa operación

#### Scenario: Auto-layout no modifica semántica
- **WHEN** se aplica el resultado de auto-layout
- **THEN** clases, atributos, enumeraciones, relaciones, tipos y multiplicidades del modelo canónico permanecen equivalentes

### Requirement: UI responsive básica del workspace
El sistema SHALL ofrecer una experiencia responsive básica en la que el canvas sea prioritario y los paneles secundarios se adapten en pantallas pequeñas.

#### Scenario: Layout de escritorio
- **WHEN** el workspace se abre en escritorio
- **THEN** se presenta una distribución con Sidebar, Canvas e Inspector visibles y el canvas como zona dominante

#### Scenario: Toolbox vertical izquierdo
- **WHEN** el workspace se abre en escritorio
- **THEN** el Toolbox se muestra como una lista vertical con icono y texto en el Sidebar izquierdo, mientras Inspector permanece a la derecha

#### Scenario: Layout de pantalla pequeña
- **WHEN** el workspace se abre en una pantalla pequeña
- **THEN** el canvas mantiene prioridad y Sidebar e Inspector pueden abrirse como drawers

#### Scenario: Acciones secundarias en pantalla pequeña
- **WHEN** no hay espacio suficiente para todas las acciones
- **THEN** las acciones secundarias pueden agruparse en menú sin impedir la edición principal del canvas

### Requirement: Límite de alcance de CU-02
CU-02 SHALL limitarse a Command Bus, Undo/Redo y workspace UML manual local en memoria, y no SHALL implementar funcionalidades de CU-03 ni de casos posteriores.

#### Scenario: Sin persistencia ni proyectos reales
- **WHEN** se revisa CU-02
- **THEN** no incluye PostgreSQL, Prisma, guardado de proyectos, apertura de proyectos persistidos, revisión optimista ni gestión real de proyectos

#### Scenario: Sin autenticación ni ownership
- **WHEN** se revisa CU-02
- **THEN** no incluye registro, login, JWT, usuarios, ownership, membresías ni invitaciones

#### Scenario: Sin colaboración realtime
- **WHEN** se revisa CU-02
- **THEN** no incluye Socket.IO, colaboración, presencia ni cursores remotos

#### Scenario: Sin generación ni asistentes
- **WHEN** se revisa CU-02
- **THEN** no incluye RelationalModel, generación Spring Boot, OpenAPI, Postman, Domain Manifest, frontend generado, IA, lenguaje natural, voz ni Vosk

#### Scenario: Sin multimodalidad ni mobile final
- **WHEN** se revisa CU-02
- **THEN** no incluye XMI, Florence-2, imagen a UML, Capacitor, Android ni offline/LAN final
