## MODIFIED Requirements

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
