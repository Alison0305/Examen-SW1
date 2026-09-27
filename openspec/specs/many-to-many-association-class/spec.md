# many-to-many-association-class Specification

## Purpose

Representar asociaciones UML muchos-a-muchos mediante una Association Class canónica, visible, persistida y reversible.

## Requirements

### Requirement: Transformación visible de asociación muchos-a-muchos
The system SHALL conservar la Association N:M original y vincular una UmlClass real sin atributos mediante `associationClassId`.

#### Scenario: Asociación N:M nueva
- **WHEN** una persona crea Cliente `0..*` y Producto `0..*`
- **THEN** existe ClienteProducto sin id UML, sin relaciones 1:N artificiales y la Association referencia su `associationClassId`

### Requirement: Persistencia e identidad determinista
The system SHALL conservar el mismo `associationClassId` entre cliente, servidor, persistencia, layout y reload sin duplicados.

#### Scenario: Recarga y movimiento
- **WHEN** se guarda, recarga y mueve una Association Class
- **THEN** el vínculo semántico y su layout persisten con el mismo identificador

### Requirement: Compatibilidad histórica
The system SHALL mantener las relaciones N:M históricas sin `associationClassId` sin transformarlas durante carga o deserialización.

#### Scenario: Documento histórico
- **WHEN** se carga una N:M sin vínculo de Association Class
- **THEN** conserva su semántica anterior
