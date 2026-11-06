# local-text-interpreter Specification

## Purpose
Proveer un runtime local de inferencia LLM que interprete español natural y produzca propuestas estructuradas validables para operaciones UML y de datos, sin depender de proveedores cloud ni ejecutar acciones directamente.

## Requirements

### Requirement: Endpoint de interpretación con modos aislados
The system SHALL exponer un endpoint `POST /assistant/interpret` que reciba texto en español natural y produzca propuestas estructuradas, con dos modos aislados: `"uml"` para propuestas UML y `"data"` para `AssistantCommand`.

#### Scenario: Interpretación modo UML
- **WHEN** se recibe una solicitud con `mode: "uml"`, `text` en español natural y `classes: [{id, name}]`
- **THEN** el sistema produce una `UmlTextProposal` estructurada con `targetName` (no UUID) o un diagnóstico estructurado

#### Scenario: Interpretación modo data
- **WHEN** se recibe una solicitud con `mode: "data"`, `text` en español natural y `manifest: DomainManifestV1`
- **THEN** el sistema produce un `AssistantCommand` estructurado o un diagnóstico estructurado

#### Scenario: Aislamiento de modos
- **WHEN** un texto del modo UML se envía al modo data o viceversa
- **THEN** el sistema rechaza la solicitud o produce un diagnóstico de frase fuera de dominio sin producir un comando del modo incorrecto

#### Scenario: Frase fuera de dominio
- **WHEN** se recibe una frase como "hola cómo estás" que no corresponde a ninguna operación válida
- **THEN** el sistema produce `{ "operation": "UNSUPPORTED", "reason": "..." }` y el endpoint traduce a diagnóstico `OUT_OF_DOMAIN`, nunca a un comando ejecutable

#### Scenario: Endpoint sin JWT
- **WHEN** se invoca el endpoint desde la aplicación generada/Android por LAN
- **THEN** el endpoint responde sin requerir autenticación JWT, siguiendo el patrón de `/speech/recognize`

### Requirement: JSON Schema dinámico como gramática
The system SHALL generar un JSON Schema dinámico para `node-llama-cpp` con los nombres de entidades, campos, relaciones y clases como `enum`, incluyendo una variante `UNSUPPORTED` para rechazar frases fuera de dominio.

#### Scenario: Schema UML con clases existentes
- **WHEN** se construye el schema para modo UML con clases `[{id: "abc", name: "Paciente"}, {id: "def", name: "Doctor"}]`
- **THEN** el schema restringe `targetName` a un `enum` conteniendo exactamente `["Paciente", "Doctor"]` y permite `operation: "UNSUPPORTED"` como variante de rechazo

#### Scenario: Schema UML sin clases (diagrama vacío)
- **WHEN** se construye el schema para modo UML con lista de clases vacía `[]`
- **THEN** el schema solo permite `operation: "CREATE_CLASS"` y `operation: "UNSUPPORTED"`, porque RENAME_CLASS y DELETE_CLASS requieren un `targetName` que no puede ser un enum vacío

#### Scenario: Schema data con entidades del manifest
- **WHEN** se construye el schema para modo data con un manifest que declara entidades `rol` y `usuario`
- **THEN** el schema restringe `entity` a un `enum` conteniendo exactamente `["rol", "usuario"]` y permite `operation: "UNSUPPORTED"` como variante de rechazo

#### Scenario: Validación posterior al schema
- **WHEN** el modelo produce una salida que satisface el JSON Schema dinámico
- **THEN** el sistema ejecuta adicionalmente el validador existente (`parseStructuredAssistantOutput`, `validateAssistantCommand`)

### Requirement: Resolución de nombres sin UUID
The system SHALL resolver nombres de clases a identificadores de forma determinista mediante un resolvedor en `assistant-core` que mapea nombre a `classId`, rechazando nombres inexistentes o ambiguos.

#### Scenario: Nombre exacto encontrado
- **WHEN** el modelo produce `targetName: "Paciente"` y existe exactamente una clase con ese nombre
- **THEN** el resolvedor devuelve el `classId` correspondiente

#### Scenario: Nombre inexistente
- **WHEN** el modelo produce `targetName: "Enfermero"` y no existe ninguna clase con ese nombre
- **THEN** el resolvedor rechaza con diagnóstico `NAME_NOT_FOUND`

#### Scenario: Nombre ambiguo
- **WHEN** el modelo produce `targetName: "Usuario"` y existen múltiples clases con ese nombre
- **THEN** el resolvedor rechaza con diagnóstico `NAME_AMBIGUOUS` sin intentar elegir una

### Requirement: Configuración y ciclo de vida del modelo
The system SHALL cargar el modelo GGUF una vez como singleton lazy, permitir precarga opcional, usar parámetros de muestreo deterministas con modo thinking desactivado, y procesar una sola inferencia concurrente mediante una cola.

#### Scenario: Modelo no configurado
- **WHEN** `ASSISTANT_MODEL_PATH` no está definido
- **THEN** el sistema reporta diagnóstico `NOT_CONFIGURED` y el fallback a gramática estricta permanece disponible

#### Scenario: Modelo no encontrado
- **WHEN** `ASSISTANT_MODEL_PATH` apunta a un archivo inexistente
- **THEN** el sistema reporta diagnóstico `MODEL_NOT_FOUND` sin intentar descargar

#### Scenario: Runtime no disponible
- **WHEN** `node-llama-cpp` no puede cargar (p.ej. falta de bibliotecas nativas)
- **THEN** el sistema reporta diagnóstico `RUNTIME_NOT_AVAILABLE`

#### Scenario: Inferencia timeout
- **WHEN** la inferencia supera `ASSISTANT_TIMEOUT_MS`
- **THEN** el sistema aborta la inferencia y devuelve diagnóstico `TIMEOUT`

#### Scenario: Concurrencia
- **WHEN** llegan múltiples solicitudes de interpretación simultáneas
- **THEN** las solicitudes se encolan y se procesan secuencialmente; solicitudes adicionales pueden recibir `BUSY` si la cola excede el límite

### Requirement: Fallback obligatorio
The system SHALL conservar la gramática estricta existente como fallback cuando el modelo no está disponible o el texto ya está en sintaxis estricta.

#### Scenario: Texto en sintaxis estricta
- **WHEN** el texto recibido coincide exactamente con la gramática estricta (`CREATE_CLASS name="X"`)
- **THEN** el sistema usa el parser estricto sin invocar el modelo

#### Scenario: Modelo no disponible
- **WHEN** el modelo no está configurado, no se encuentra o falla
- **THEN** el sistema intenta parsear con la gramática estricta; si falla, reporta diagnóstico apropiado

### Requirement: Operación sin Internet
The system SHALL funcionar completamente sin conexión a Internet, usando exclusivamente el modelo GGUF local y el runtime `node-llama-cpp`.

#### Scenario: Red desconectada
- **WHEN** se invoca el endpoint con la red desconectada
- **THEN** la interpretación funciona normalmente usando el modelo local

#### Scenario: Sin proveedores cloud
- **WHEN** se inspecciona el código del intérprete
- **THEN** no existe ninguna URL, API key ni cliente HTTP hacia proveedores LLM externos
