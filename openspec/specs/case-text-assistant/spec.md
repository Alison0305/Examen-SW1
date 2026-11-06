# case-text-assistant Specification

## Purpose

Permitir que el editor CASE reciba propuestas textuales UML de forma segura, conservando el modelo canónico y el Command Bus como única ruta de mutación.

## Requirements

### Requirement: Propuesta textual UML estructurada
The system SHALL convertir una intención textual UML en una propuesta estructurada y validable antes de que pueda afectar el proyecto del editor CASE. Para texto en español natural, se envía al endpoint de interpretación cuando la gramática estricta no coincida, presentando la propuesta resultante para aprobación.

#### Scenario: Propuesta reconocida
- **WHEN** una intención textual corresponde a una mutación UML permitida
- **THEN** la interfaz presenta la propuesta y sus datos estructurados antes de aplicarla

#### Scenario: Propuesta no válida
- **WHEN** la intención no puede representarse como una mutación UML permitida y tipada
- **THEN** el editor informa el rechazo y no modifica el proyecto

#### Scenario: Texto en gramática estricta
- **WHEN** el texto ingresado coincide con `CREATE_CLASS name="X"` o similares
- **THEN** se usa el parser estricto existente sin llamar al endpoint

#### Scenario: Texto en español natural
- **WHEN** el texto ingresado es español natural como "crear clase paciente"
- **THEN** se envía al endpoint `POST /assistant/interpret` con `mode: "uml"` y las clases existentes, y se presenta la propuesta resultante

#### Scenario: Frase fuera de dominio
- **WHEN** el texto ingresado es una frase que no corresponde a una operación UML válida (ej. "hola cómo estás")
- **THEN** el endpoint devuelve diagnóstico `OUT_OF_DOMAIN` y la interfaz muestra el error sin presentar propuesta

#### Scenario: Diagrama sin clases y operación imposible
- **WHEN** el usuario solicita renombrar o eliminar una clase pero el diagrama no tiene clases
- **THEN** el sistema devuelve diagnóstico apropiado indicando que la operación no es posible

#### Scenario: Interpretación fallida
- **WHEN** el endpoint devuelve un diagnóstico de error
- **THEN** la interfaz muestra el error y no presenta propuesta ni modifica el proyecto

#### Scenario: Modelo no disponible con texto natural
- **WHEN** el texto es español natural y el modelo no está disponible
- **THEN** se intenta parsear con gramática estricta; si falla, se muestra diagnóstico apropiado

#### Scenario: VIEWER con texto natural
- **WHEN** un VIEWER intenta enviar texto natural para interpretación
- **THEN** la interfaz no permite la operación o el sistema rechaza la propuesta resultante, manteniendo que el rol VIEWER no puede ejecutar propuestas UML

### Requirement: Aplicación exclusiva mediante CASE Command Bus
The system SHALL adaptar una propuesta aprobada a `UmlCommand` y SHALL aplicarla exclusivamente mediante el `UmlCommandBus`, con la validación, historial y semántica existentes.

#### Scenario: Aplicación aprobada
- **WHEN** la persona usuaria aprueba una propuesta UML válida
- **THEN** la mutación pasa por el Command Bus y queda disponible para las reglas existentes de validación y Undo/Redo

#### Scenario: Ruta directa prohibida
- **WHEN** una propuesta intenta modificar directamente `CanonicalUmlModel`, `ProjectDocument` o `DiagramLayout`
- **THEN** la integración la rechaza y no persiste ningún cambio directo

### Requirement: Aislamiento de responsabilidades CASE y aplicación generada
The system SHALL mantener separadas las acciones sobre entidades de la aplicación generada y las mutaciones UML del editor CASE; un comando de un contexto SHALL NOT ejecutarse en el otro.

#### Scenario: Contexto de aplicación generada
- **WHEN** se recibe un comando dirigido a una entidad del Domain Manifest
- **THEN** solo puede seguir la validación y ejecución de la aplicación generada

#### Scenario: Contexto CASE
- **WHEN** se recibe una propuesta de mutación UML
- **THEN** solo puede seguir la adaptación y ejecución mediante el Command Bus CASE
