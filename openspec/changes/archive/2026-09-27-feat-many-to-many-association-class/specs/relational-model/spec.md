## MODIFIED Requirements

### Requirement: Safe relational relationship projection
The system SHALL project classes that no están explícitamente excluidas como entidades, preserve target primary-key types in foreign keys, y omita una foreign key cuando target primary-key semantics no sean uniquely derivable.

#### Scenario: Multiple many-to-many relationships
- **WHEN** dos relaciones N:M directas conectan el mismo par de entidades en un documento histórico
- **THEN** cada relación tiene una join table determinista distinta y cada tabla tiene una restricción unique compuesta sobre sus dos foreign keys

#### Scenario: Association Class pending projection
- **WHEN** el modelo contiene una Association N:M con `associationClassId`
- **THEN** la interpretación relacional queda pendiente para Incremento 3 y este change no modifica el mapper

#### Scenario: Unsupported source semantics
- **WHEN** un source identifier es inválido, un atributo tiene tipo no soportado, o una relación alcanza una clase explícitamente excluida
- **THEN** el mapper reports a blocking diagnostic without silently sanitizing the name, creating a fallback column, or creating the relationship
