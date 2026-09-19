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
The system SHALL disponer de un benchmark reproducible de comandos que registre dataset, configuración, versión o modelo, hardware, validez estructurada, precisión, falsos positivos, rechazos correctos, latencia, RAM, VRAM y tiempo de carga cuando aplique.

#### Scenario: Ejecución de benchmark
- **WHEN** se ejecuta el benchmark con un dataset y configuración identificados
- **THEN** el resultado registra los valores medidos y los casos fallidos sin inventar métricas no observadas
