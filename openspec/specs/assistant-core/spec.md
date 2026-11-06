# assistant-core Specification

## Purpose

Definir un núcleo reutilizable que convierta intenciones estructuradas en acciones permitidas y verificables sobre la aplicación generada, sin ejecutar instrucciones arbitrarias.

## Requirements

### Requirement: Lenguaje intermedio AssistantCommand cerrado
The system SHALL representar cada acción textual mediante un `AssistantCommand` tipado, independiente de la frase de origen y de URLs, con operaciones limitadas a `LIST`, `GET`, `SEARCH`, `CREATE`, `UPDATE`, `DELETE` y `COUNT`.

#### Scenario: Operación admitida
- **WHEN** una intención se normaliza a una de las siete operaciones permitidas
- **THEN** el comando contiene únicamente la operación, entidad, identificador, campos, criterios y relación que correspondan a esa operación

#### Scenario: Operación no admitida
- **WHEN** una intención solicita una operación fuera de la allow-list
- **THEN** no se produce un comando ejecutable y se informa un rechazo estructurado

### Requirement: Validación contra capacidades declaradas
The system SHALL validar el comando antes de ejecutarlo contra el Domain Manifest v1: entidad, operación, campos, tipos, identificadores, relaciones y restricciones declaradas.

#### Scenario: Comando válido
- **WHEN** el comando usa una entidad, operación, datos y relaciones permitidos y tipados
- **THEN** la validación lo aprueba para ejecución

#### Scenario: Campo o relación inválida
- **WHEN** el comando referencia un campo, tipo o relación inexistente o no permitido
- **THEN** la validación lo rechaza sin invocar el backend generado

#### Scenario: Acción destructiva
- **WHEN** el comando solicita `DELETE`
- **THEN** el sistema exige la confirmación explícita definida por la interfaz antes de ejecutarlo

#### Scenario: Validación estructural sin IO
- **WHEN** un comando se valida contra el Domain Manifest v1
- **THEN** el validator usa los nombres de operación declarados, no construye rutas ni realiza IO, y devuelve diagnósticos `VALIDATION_ERROR` para entidad, operación, identificador, campo, tipo o relación inválidos

#### Scenario: Campos de escritura y búsqueda
- **WHEN** se valida CREATE, UPDATE o SEARCH
- **THEN** CREATE permite identifier y exige atributos required, UPDATE rechaza identifier dentro de fields y fields vacío, y SEARCH exige criterio no vacío y query solo cuando existe un atributo searchable

#### Scenario: Tipos y relaciones v1
- **WHEN** se valida un valor o scope de relación
- **THEN** los tipos v1 se validan sin coerción, null solo se admite para atributos no required, arrays se rechazan y una relación verifica nombre, identifier fuente y target declarado sin resolver transporte

### Requirement: Ejecución sin destinos arbitrarios
The system SHALL resolver un comando validado exclusivamente a una operación declarada por el Domain Manifest v1 y los contratos generados; SHALL NOT aceptar SQL, código, URLs arbitrarias ni destinos proporcionados por el texto.

#### Scenario: Ejecución permitida
- **WHEN** un comando validado corresponde a una operación declarada
- **THEN** el executor invoca únicamente el método y ruta declarados para esa operación y devuelve un resultado estructurado

#### Scenario: Ejecución mediante adapter autorizado
- **WHEN** el executor recibe un comando y un adapter inyectable
- **THEN** valida antes de IO, deriva el request exclusivamente del Manifest y no recibe base URL, path ni método desde el comando

#### Scenario: Confirmación destructiva
- **WHEN** DELETE no recibe confirmación externa explícita
- **THEN** devuelve `CONFIRMATION_REQUIRED` y no invoca el adapter

#### Scenario: Intento de URL o instrucción arbitraria
- **WHEN** la entrada contiene una URL, SQL o una instrucción de código como destino o acción
- **THEN** el comando se rechaza y el executor no realiza ninguna llamada

### Requirement: Medición reproducible del asistente textual
The system SHALL disponer de un benchmark reproducible de comandos que registre dataset, configuración, versión o modelo, hardware, validez estructurada, precisión, falsos positivos, rechazos correctos, latencia, RAM, VRAM y tiempo de carga cuando aplique. El corpus debe estar en `assistant-core` (puro) mientras que el runner que carga el modelo real vive en backend.

#### Scenario: Ejecución de benchmark
- **WHEN** se ejecuta el benchmark con un dataset y configuración identificados
- **THEN** el resultado registra los valores medidos y los casos fallidos sin inventar métricas no observadas

#### Scenario: Benchmark con modelo disponible
- **WHEN** se ejecuta el runner de benchmark en backend con el modelo configurado y disponible
- **THEN** el runner envía `inputSpanish` al modelo vía `LlamaTextModel` directamente (no por HTTP) y mide accuracy, validez estructurada, falsos positivos, rechazos correctos, latencia p50/p95, RAM, VRAM y tiempo de carga

#### Scenario: Corpus ampliado
- **WHEN** se define el corpus para benchmark con modelo
- **THEN** incluye variantes de las mismas intenciones: sinónimos, errores típicos de STT, variaciones de mayúsculas/acentos y frases fuera de dominio (con resultado esperado `UNSUPPORTED`), cada una con resultado esperado

#### Scenario: Comparación de configuraciones
- **WHEN** se ejecuta el benchmark para comparar configuraciones
- **THEN** se comparan como mínimo Q4_K_M vs Q8_0 y GPU vs CPU, registrando todas las métricas requeridas por AGENTS.md §18

### Requirement: Construcción de JSON Schema dinámico para interpretación
The system SHALL proveer funciones puras que construyan JSON Schemas dinámicos para `node-llama-cpp` a partir de las clases existentes (modo UML) o del Domain Manifest (modo data), incluyendo una variante `UNSUPPORTED` para rechazar frases fuera de dominio.

#### Scenario: buildUmlInterpretationSchema con clases
- **WHEN** se invoca `buildUmlInterpretationSchema(classes)` con una lista de clases `[{id, name}]`
- **THEN** devuelve un JSON Schema que restringe operaciones a `CREATE_CLASS`, `RENAME_CLASS`, `DELETE_CLASS`, `UNSUPPORTED` y `targetName` a un enum de nombres existentes

#### Scenario: buildUmlInterpretationSchema sin clases
- **WHEN** se invoca `buildUmlInterpretationSchema([])` con lista vacía
- **THEN** devuelve un JSON Schema que solo permite `CREATE_CLASS` y `UNSUPPORTED`, porque `targetName` no puede ser un enum vacío

#### Scenario: buildDataInterpretationSchema
- **WHEN** se invoca `buildDataInterpretationSchema(manifest)` con un `DomainManifestV1`
- **THEN** devuelve un JSON Schema que restringe `entity` a entidades declaradas, `operation` a las siete operaciones permitidas más `UNSUPPORTED`, y campos a los declarados por entidad usando `oneOf` (una variante por entidad)

### Requirement: Prompts estructurados en español
The system SHALL proveer funciones puras que generen prompts en español con pocos ejemplos para guiar la inferencia del modelo hacia salidas estructuradas válidas, incluyendo ejemplos de cuándo usar la variante `UNSUPPORTED`.

#### Scenario: Prompt UML
- **WHEN** se genera un prompt para modo UML con el texto del usuario y las clases existentes
- **THEN** el prompt incluye instrucciones en español, ejemplos de entrada/salida incluido un ejemplo de frase fuera de dominio que produce `UNSUPPORTED`, las clases disponibles y el texto a interpretar

#### Scenario: Prompt data
- **WHEN** se genera un prompt para modo data con el texto del usuario y el manifest
- **THEN** el prompt incluye instrucciones en español, ejemplos de entrada/salida incluido un ejemplo de frase fuera de dominio que produce `UNSUPPORTED`, las entidades y operaciones disponibles y el texto a interpretar

### Requirement: Resolución de propuestas UML por nombre
The system SHALL proveer una función pura `resolveUmlProposalByName` que convierta una propuesta con `targetName` en una propuesta con `targetId`, rechazando nombres inexistentes o ambiguos.

#### Scenario: Resolución exitosa CREATE_CLASS
- **WHEN** se resuelve una propuesta `CREATE_CLASS` con `className`
- **THEN** no se requiere resolución de ID porque es una creación; se valida que el nombre no esté duplicado

#### Scenario: Resolución exitosa RENAME_CLASS
- **WHEN** se resuelve una propuesta `RENAME_CLASS` con `targetName` que existe una sola vez
- **THEN** se devuelve la propuesta con `targetId` correspondiente

#### Scenario: Resolución fallida por nombre inexistente
- **WHEN** se resuelve una propuesta con `targetName` que no existe
- **THEN** se devuelve diagnóstico estructurado `NAME_NOT_FOUND` con el nombre buscado

#### Scenario: Resolución fallida por ambigüedad
- **WHEN** se resuelve una propuesta con `targetName` que corresponde a múltiples clases
- **THEN** se devuelve diagnóstico estructurado `NAME_AMBIGUOUS` con el nombre y los IDs encontrados
