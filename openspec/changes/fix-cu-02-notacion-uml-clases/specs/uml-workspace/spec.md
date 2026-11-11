## ADDED Requirements

### Requirement: Notación UML de atributos y estereotipos
El workspace SHALL dibujar cada atributo de una clase con la notación UML 2.5.1 `visibilidad nombre: Tipo [multiplicidad]`, mostrar los tipos de referencia por el nombre del clasificador, permitir elegir una enumeración del modelo como tipo de atributo desde el inspector y dibujar los estereotipos con comillas angulares.

#### Scenario: Multiplicidad de atributo
- **WHEN** una clase tiene el atributo `telefonos` de tipo `string` con multiplicidad `0..*`
- **THEN** el nodo de la clase muestra `+ telefonos: string [0..*]`

#### Scenario: Multiplicidad por defecto
- **WHEN** un atributo no tiene multiplicidad o su multiplicidad es exactamente `1`
- **THEN** el nodo muestra el atributo sin corchetes

#### Scenario: Tipo de referencia por nombre
- **WHEN** un atributo tiene como tipo la enumeración `Estado` o una clase del modelo
- **THEN** el nodo y el inspector muestran el nombre del clasificador y nunca su identificador interno

#### Scenario: Referencia no resoluble
- **WHEN** el tipo de un atributo referencia un clasificador que no existe en el modelo
- **THEN** el nodo muestra `?` como tipo y no muestra el identificador

#### Scenario: Enumeración como tipo desde el inspector
- **WHEN** el usuario elige la enumeración `Estado` como tipo al crear o editar un atributo
- **THEN** el atributo queda tipado por esa enumeración mediante el Command Bus, con Undo

#### Scenario: Conservar un tipo de referencia al editar
- **WHEN** el usuario edita un atributo cuyo tipo es una enumeración o una clase y no cambia el tipo
- **THEN** el atributo conserva ese tipo de referencia y no pasa a `string`

#### Scenario: Estereotipo de enumeración
- **WHEN** el canvas dibuja una enumeración
- **THEN** su estereotipo se muestra como `«enumeration»`
