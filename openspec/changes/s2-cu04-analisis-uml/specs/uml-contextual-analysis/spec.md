## ADDED Requirements

### Requirement: Análisis autorizado de solo lectura
El sistema SHALL exponer `POST /projects/:id/mentor/analysis` con JWT, SHALL autorizar con `requireView` antes de cargar el proyecto y SHALL analizar únicamente el modelo persistido de ese proyecto. El sistema SHALL NOT persistir cambios, ejecutar comandos UML ni aceptar un modelo, un usuario o una revisión desde el cliente.

#### Scenario: VIEWER analiza una clase
- **WHEN** un VIEWER autenticado envía `{ "focus": { "kind": "class", "id": "<uuid>" } }` para un proyecto accesible
- **THEN** el sistema SHALL responder 200 con `analysis` y `explanation` y la revisión del proyecto SHALL permanecer igual

#### Scenario: Usuario sin acceso
- **WHEN** un usuario autenticado sin acceso al proyecto solicita un análisis
- **THEN** el sistema SHALL responder 404 sin cargar el documento ni llamar al modelo local

#### Scenario: Cuerpo con datos ajenos al foco
- **WHEN** el cuerpo incluye `userId`, `question`, un modelo UML u otra propiedad además de `focus`
- **THEN** el sistema SHALL responder 400 sin ejecutar el análisis

### Requirement: Hechos deterministas antes de la IA
El sistema SHALL determinar sin IA las clases, atributos, relaciones, multiplicidades, FK, nulabilidad, tablas intermedias, herencia, diagnósticos, conflictos y limitaciones del foco, a partir de `CanonicalUmlModel`, `validateCanonicalUmlModel` y `mapToRelationalModel`, y SHALL devolverlos separados de la explicación generada.

#### Scenario: Asociación 1:N
- **WHEN** se analiza `Cliente [1] — [0..*] Pedido`
- **THEN** los hechos SHALL indicar la FK `pedido.cliente_id → cliente.id` NOT NULL y las frases "Por cada Cliente: 0..* Pedido." y "Por cada Pedido: 1 Cliente."

#### Scenario: Extremos invertidos
- **WHEN** la misma asociación se modela con Pedido como source y Cliente como target
- **THEN** los hechos físicos SHALL ser idénticos y la explicación SHALL NOT invertir el significado

#### Scenario: Relacional no derivable
- **WHEN** las clases carecen de identificador y el mapper no puede generar la FK
- **THEN** el análisis UML SHALL seguir disponible, `relationalDerivable` SHALL ser `false` y SHALL NOT inventarse ninguna FK

#### Scenario: Multiplicidad no garantizada por el esquema
- **WHEN** un extremo declara `1..*` o `2..5`
- **THEN** el análisis SHALL incluir las limitaciones de mínimo y, si corresponde, de máximo no garantizados por el esquema

### Requirement: Diagnósticos de foco sin IA
El sistema SHALL responder con un diagnóstico estable y sin llamar al modelo local cuando el foco no se pueda analizar, y SHALL NOT resolver un elemento por nombre.

#### Scenario: Elemento eliminado
- **WHEN** el foco referencia una clase o relación que ya no existe, aunque otra tenga el mismo nombre
- **THEN** el sistema SHALL responder 200 con `diagnostic: "ELEMENT_NOT_FOUND"`, `analysis: null` y `explanation: null`

#### Scenario: Modelo vacío
- **WHEN** el modelo no contiene clases ni enumeraciones
- **THEN** el sistema SHALL responder 200 con `diagnostic: "EMPTY_MODEL"` sin llamar al modelo local

#### Scenario: Contexto esencial demasiado grande
- **WHEN** los hechos obligatorios del foco no caben en el presupuesto del prompt
- **THEN** el sistema SHALL responder 200 con `analysis`, `explanation: null` y `diagnostic: "CONTEXT_TOO_LARGE"` sin llamar al modelo local

### Requirement: Prompt compacto con recorte declarado
El sistema SHALL proyectar el contexto en un prompt de texto dentro de `MAX_PROMPT_CHARACTERS`, sin layout ni UUID innecesarios, SHALL conservar siempre los hechos obligatorios del foco y SHALL declarar cualquier recorte en `contextTruncation` y en el propio prompt.

#### Scenario: Modelo grande
- **WHEN** el modelo completo no cabe en el presupuesto
- **THEN** el sistema SHALL omitir primero el catálogo de no soportadas, después relaciones y atributos adicionales y después encabezados de clase, y `contextTruncation.omitted` SHALL contar lo omitido

### Requirement: Modelo local compartido y fallos controlados
El sistema SHALL generar la explicación con la misma instancia de `ASSISTANT_LOCAL_MODEL` que usan CU-2P-01 y CU-08 y SHALL traducir cualquier fallo o ausencia del modelo a 503 sin exponer detalles internos.

#### Scenario: Modelo local no configurado o con fallo
- **WHEN** `ASSISTANT_MODEL_PATH` no está configurado o la generación falla
- **THEN** el sistema SHALL responder 503 con el mensaje "El Mentor IA no está disponible en este momento."

### Requirement: Explicar desde el workspace
El panel Mentor IA SHALL ofrecer "Explicar selección" para clases y relaciones y "Explicar modelo", independientes de la consulta libre de CU-2P-01, y SHALL mostrar el resultado como texto de solo lectura identificado por el foco que devolvió el servidor.

#### Scenario: Enumeración seleccionada
- **WHEN** la selección del editor es una enumeración
- **THEN** "Explicar selección" SHALL estar deshabilitado con el mensaje "Las enumeraciones aún no se pueden analizar individualmente." y SHALL NOT enviarse ninguna petición

#### Scenario: La selección cambia durante el análisis
- **WHEN** el usuario selecciona otro elemento antes de que termine el análisis de Cliente
- **THEN** el resultado SHALL titularse "Análisis de: Cliente"
