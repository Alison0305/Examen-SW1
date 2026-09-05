# nucleo-uml-validacion Specification

## Purpose
Define el núcleo semántico reutilizable del sistema UML para crear documentos, representar diagramas de clases, separar layout visual, serializar sin pérdida y validar modelos de forma determinista.

## Requirements

### Requirement: Workspace reutilizable de núcleo UML
El sistema SHALL incorporar un paquete reutilizable para el núcleo UML ubicado en `uml-core/`, directamente en la raíz del monorepo, y SHALL permitir que los scripts raíz de calidad lo incluyan junto con `frontend` y `backend` cuando CU-01 se implemente.

#### Scenario: Núcleo ubicado fuera de frontend y backend
- **WHEN** se revisa la estructura del repositorio después de aplicar CU-01
- **THEN** existe `uml-core/` como workspace independiente y no está contenido dentro de `frontend/` ni `backend/`

#### Scenario: Workspace incluido en el monorepo
- **WHEN** se revisa el `package.json` raíz después de aplicar CU-01
- **THEN** npm reconoce `uml-core` como workspace junto con `frontend` y `backend`

#### Scenario: Gates raíz incluyen el núcleo
- **WHEN** se ejecutan `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` desde la raíz después de aplicar CU-01
- **THEN** las verificaciones incluyen `uml-core` y siguen validando los workspaces existentes de CU-00

### Requirement: ProjectDocument con modelo y layout separados
El sistema SHALL representar cada documento de proyecto mediante un `ProjectDocument` con UUID, revisión, timestamps, `CanonicalUmlModel` y `DiagramLayout`, y MUST mantener el layout visual separado de la semántica UML.

#### Scenario: Creación de documento vacío
- **WHEN** se crea un documento de proyecto vacío desde el núcleo UML
- **THEN** el resultado contiene id UUID válido, revisión inicial válida, `createdAt`, `updatedAt`, un modelo UML vacío y un layout vacío

#### Scenario: Modelo canónico disponible
- **WHEN** se inspecciona un documento de proyecto creado por el núcleo UML
- **THEN** el documento contiene un `CanonicalUmlModel` capaz de almacenar clases, enumeraciones, paquetes y relaciones

#### Scenario: Layout separado de semántica
- **WHEN** se asigna una posición visual a un elemento UML existente
- **THEN** `DiagramLayout` almacena la información visual sin duplicar nombres, atributos, operaciones, relaciones, multiplicidades, tipos, paquetes ni metadatos semánticos

#### Scenario: Movimiento visual sin cambio semántico
- **WHEN** cambia únicamente la posición visual de un elemento en `DiagramLayout`
- **THEN** el contenido semántico de `CanonicalUmlModel` permanece equivalente

### Requirement: Serialización JSON sin pérdida
El sistema SHALL serializar un `ProjectDocument` a JSON y reconstruirlo desde JSON sin pérdida de información semántica ni visual dentro del alcance de CU-01.

#### Scenario: Round-trip de documento vacío
- **WHEN** un `ProjectDocument` vacío se serializa a JSON y se reconstruye desde ese JSON
- **THEN** el documento reconstruido conserva id, revisión, timestamps, modelo UML y layout equivalentes

#### Scenario: Round-trip de documento con UML y layout
- **WHEN** un `ProjectDocument` con clases, enumeraciones, paquetes, relaciones y posiciones visuales se serializa y reconstruye
- **THEN** el documento reconstruido conserva el mismo contenido semántico y visual permitido por CU-01

#### Scenario: JSON determinista para el mismo documento
- **WHEN** el mismo `ProjectDocument` se serializa repetidamente sin cambios intermedios
- **THEN** el JSON resultante representa la misma información de forma estable y reconstruible

### Requirement: Dominio UML de clases
El sistema SHALL representar los elementos necesarios para diagramas UML de clases, incluyendo clases, atributos, operaciones, parámetros, enumeraciones, paquetes, tipos, visibilidad, relaciones, multiplicidades y metadatos de generación separados.

#### Scenario: Clase UML completa
- **WHEN** se representa una clase UML
- **THEN** puede contener id, name, visibility, packageId opcional, attributes, operations y generationMetadata opcional

#### Scenario: Atributo UML completo
- **WHEN** se representa un atributo de una clase UML
- **THEN** puede contener id, name, visibility, type, multiplicity opcional y generationMetadata opcional

#### Scenario: Operación UML completa
- **WHEN** se representa una operación UML
- **THEN** puede contener id, name, visibility, parameters y returnType opcional

#### Scenario: Parámetro UML tipado
- **WHEN** se representa un parámetro de operación
- **THEN** contiene nombre y tipo de forma coherente con la representación de tipos del núcleo UML

#### Scenario: Enumeración UML
- **WHEN** se representa una enumeración UML
- **THEN** puede contener id, name, visibility, literals y packageId opcional

#### Scenario: Paquetes UML anidados
- **WHEN** se representa un paquete UML
- **THEN** puede agrupar elementos y referenciar opcionalmente un paquete padre existente

### Requirement: Tipos, visibilidad y multiplicidad estructurada
El sistema SHALL diferenciar tipos primitivos de referencias UML, SHALL soportar visibilidades UML iniciales y SHALL representar multiplicidades mediante estructura validable.

#### Scenario: Tipos primitivos iniciales
- **WHEN** se define un tipo primitivo en el núcleo UML
- **THEN** puede representar `string`, `integer`, `boolean`, `number`, `date` o `datetime`

#### Scenario: Referencias a elementos UML
- **WHEN** se define un tipo por referencia
- **THEN** la referencia puede apuntar a una clase o enumeración del mismo modelo UML

#### Scenario: Visibilidades soportadas
- **WHEN** se define visibilidad para clases, atributos, operaciones o enumeraciones
- **THEN** el valor pertenece a `public`, `private`, `protected` o `package`

#### Scenario: Multiplicidad estructurada finita
- **WHEN** se representa una multiplicidad como `2..5`
- **THEN** queda expresada mediante límite inferior `2` y límite superior finito `5`

#### Scenario: Multiplicidad estructurada ilimitada
- **WHEN** se representa una multiplicidad como `0..*` o `1..*`
- **THEN** queda expresada mediante límite inferior numérico y límite superior ilimitado

### Requirement: Relaciones UML tipadas
El sistema SHALL soportar relaciones UML de tipo Association, Aggregation, Composition y Generalization, cada una con identidad UUID propia y referencias válidas a elementos del modelo.

#### Scenario: Asociación entre elementos
- **WHEN** se representa una relación Association
- **THEN** contiene id propio, tipo de relación, sourceId y targetId hacia elementos UML existentes

#### Scenario: Agregación entre elementos
- **WHEN** se representa una relación Aggregation
- **THEN** contiene id propio, tipo de relación, sourceId y targetId hacia elementos UML existentes

#### Scenario: Composición entre elementos
- **WHEN** se representa una relación Composition
- **THEN** contiene id propio, tipo de relación, sourceId y targetId hacia elementos UML existentes

#### Scenario: Generalización entre clases
- **WHEN** se representa una relación Generalization
- **THEN** contiene id propio y conecta una clase especializada con una clase general existentes

### Requirement: Metadatos de generación separados
El sistema SHALL representar los metadatos propios del generador separados conceptualmente del UML estándar y MUST evitar tratarlos como parte de la semántica UML pura.

#### Scenario: Metadatos opcionales en clase
- **WHEN** una clase necesita información del perfil de generación
- **THEN** esa información se almacena en `generationMetadata` opcional, separada de id, nombre, visibilidad, atributos, operaciones y paquete UML

#### Scenario: Metadatos opcionales en atributo
- **WHEN** un atributo necesita información del perfil de generación
- **THEN** esa información se almacena en `generationMetadata` opcional, separada de nombre, visibilidad, tipo y multiplicidad UML

#### Scenario: Perfil declarativo inicial
- **WHEN** se representan metadatos de generación en CU-01
- **THEN** el modelo puede expresar de forma declarativa conceptos como `entity`, `auditable`, `readOnly`, `searchable`, `crud`, `required`, `unique`, `sortable` y `defaultSort` sin implementar todavía generación ni persistencia

### Requirement: Validación determinista con diagnósticos estructurados
El sistema SHALL proveer un único motor de validación reutilizable para `CanonicalUmlModel` y documentos de proyecto, y SHALL producir diagnósticos estructurados en orden determinista.

#### Scenario: Resultado de validación estructurado
- **WHEN** se valida un modelo UML
- **THEN** el resultado contiene una colección ordenada de diagnósticos con severity, code, message, path y elementId opcional

#### Scenario: Severidades iniciales
- **WHEN** el motor emite diagnósticos
- **THEN** cada diagnóstico usa severity `error` o `warning`, donde los errores se consideran bloqueantes para operaciones futuras y los warnings no son bloqueantes por defecto

#### Scenario: Determinismo del validador
- **WHEN** se valida dos veces el mismo modelo sin cambios intermedios
- **THEN** se obtienen los mismos diagnósticos con los mismos códigos y en el mismo orden

#### Scenario: Modelo válido sin errores
- **WHEN** se valida un modelo coherente con UUIDs válidos, nombres requeridos, referencias existentes, multiplicidades válidas y layout consistente
- **THEN** el resultado no contiene errores

#### Scenario: Diagnóstico navegable
- **WHEN** un error o warning corresponde a un elemento UML concreto
- **THEN** el diagnóstico incluye un path lógico y, cuando corresponde, el elementId afectado

### Requirement: Reglas mínimas de validación UML
El sistema SHALL validar reglas mínimas de integridad para identidad, nombres, referencias, relaciones, herencia, paquetes, layout, revisión y metadatos de generación dentro del alcance de CU-01.

#### Scenario: UUID inválido o repetido
- **WHEN** el modelo contiene un UUID inválido o más de un elemento con el mismo UUID
- **THEN** el validador emite un diagnóstico con código estable para identificar el problema

#### Scenario: Nombres obligatorios y duplicados
- **WHEN** faltan nombres requeridos o existen clases/enumeraciones duplicadas dentro del mismo paquete o atributos duplicados dentro de la misma clase
- **THEN** el validador emite diagnósticos estructurados para cada problema encontrado

#### Scenario: Referencias y tipos inexistentes
- **WHEN** un elemento referencia una clase, enumeración, paquete o tipo UML que no existe en el modelo
- **THEN** el validador emite diagnósticos con path y elementId cuando corresponda

#### Scenario: Relación inválida
- **WHEN** una relación tiene source o target inexistente, o una Generalization apunta a sí misma
- **THEN** el validador emite errores estructurados con códigos estables

#### Scenario: Ciclo de herencia
- **WHEN** las generalizaciones forman un ciclo de herencia
- **THEN** el validador emite errores deterministas para el ciclo detectado

#### Scenario: Multiplicidad inválida
- **WHEN** una multiplicidad tiene lower negativo, upper finito menor que lower o una forma no estructuralmente válida
- **THEN** el validador emite un error de multiplicidad con código estable

#### Scenario: Paquete padre inválido o circular
- **WHEN** un paquete referencia un padre inexistente o los paquetes forman un ciclo
- **THEN** el validador emite diagnósticos estructurados para el problema de paquetes

#### Scenario: Layout con referencia inexistente
- **WHEN** una entrada de `DiagramLayout` referencia un elementId inexistente
- **THEN** el validador emite un diagnóstico sin modificar el modelo canónico

#### Scenario: Revisión inválida y metadatos incoherentes
- **WHEN** un `ProjectDocument` tiene revision inválida o generationMetadata con valores básicos incoherentes
- **THEN** el validador emite diagnósticos estructurados y deterministas

### Requirement: Demo manual ejecutable del núcleo UML
El sistema SHALL incluir una demo manual ejecutable desde la raíz mediante `npm run demo:uml` para demostrar creación, validación, serialización y diagnóstico de modelos válidos e inválidos sin interfaz gráfica.

#### Scenario: Demo de modelo válido
- **WHEN** se ejecuta `npm run demo:uml` desde la raíz
- **THEN** la salida muestra que se creó un proyecto, cantidad de clases, enumeraciones y relaciones, validación sin errores bloqueantes y serialización JSON correcta

#### Scenario: Demo de modelo inválido
- **WHEN** se ejecuta `npm run demo:uml` desde la raíz
- **THEN** la salida incluye un caso inválido con errores estructurados, incluyendo códigos estables como duplicidad de id o multiplicidad inválida

#### Scenario: Demo sin frontend ni backend
- **WHEN** se ejecuta la demo manual de CU-01
- **THEN** no requiere iniciar el frontend, el backend, una base de datos, React Flow ni servicios de colaboración

### Requirement: Límite de alcance de CU-01
CU-01 SHALL limitarse al núcleo UML canónico y validación, y no SHALL implementar funcionalidades pertenecientes a CU-02 ni a casos de uso posteriores.

#### Scenario: Sin canvas ni Command Bus
- **WHEN** se revisa el cambio de CU-01
- **THEN** no implementa React Flow, canvas UML, workspace gráfico, toolbox, inspector, Zustand, ELK.js, UmlCommand, Command Bus, Undo ni Redo

#### Scenario: Sin persistencia ni colaboración
- **WHEN** se revisa el cambio de CU-01
- **THEN** no implementa Prisma, PostgreSQL, persistencia, autenticación, JWT, ownership, Socket.IO ni colaboración

#### Scenario: Sin generación ni capacidades multimodales
- **WHEN** se revisa el cambio de CU-01
- **THEN** no implementa generación Spring Boot, OpenAPI generado, Postman, Domain Manifest, IA, Qwen, voz, Vosk, Florence-2, XMI ni Capacitor
