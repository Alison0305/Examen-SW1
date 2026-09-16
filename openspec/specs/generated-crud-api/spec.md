# generated-crud-api Specification

## Purpose
Definir una API REST generada, estable y validada para operar entidades relacionales sin exponer mecanismos de consulta arbitrarios.

## Requirements

### Requirement: CRUD de entidades habilitadas
The system SHALL publish create, get, update, delete, list and count operations only for entities whose generation metadata permits the operation, using the declared resource name or the table name without automatic pluralization.

#### Scenario: Entidad habilitada
- **WHEN** a client invokes an allowed operation with a valid request
- **THEN** the API returns the documented resource representation and HTTP status

#### Scenario: Operación no habilitada
- **WHEN** a client invokes an operation disabled by metadata
- **THEN** the API returns a structured not-found response without exposing the operation

#### Scenario: Explicit identifiers
- **WHEN** a client creates a persistent entity
- **THEN** its create request contains the identifier, and update requests cannot include or alter it because the path identifier is authoritative

### Requirement: Consultas allow-listed y estables
The system SHALL validate page, size, repeated `sort`, repeated `filter` and search against declared metadata and return a deterministic paginated representation with `content`, `page`, `size`, `totalElements` and `totalPages`.

#### Scenario: Campo de orden inválido
- **WHEN** a list request names a field that is not sortable
- **THEN** the API returns a structured invalid-sort error

#### Scenario: Búsqueda sin campos habilitados
- **WHEN** a search request targets an entity without searchable fields
- **THEN** the API returns a structured invalid-search error

#### Scenario: Filter values with colons
- **WHEN** a filter uses `field:operator:value` and its value contains colons
- **THEN** the parser splits only the first two colons and validates the remaining value by the declared field type

### Requirement: Relaciones y errores seguros
The system SHALL validate referenced identifiers and return structured errors for invalid requests, missing resources and uniqueness conflicts without leaking persistence details.

#### Scenario: Referencia inexistente
- **WHEN** a create or update request names a related identifier that does not exist
- **THEN** the API returns an invalid-relation error and writes no resource

#### Scenario: Partial update nullability
- **WHEN** a PATCH omits a field, provides a value, or provides explicit null
- **THEN** omission preserves the value, a value updates it, and null is accepted only for nullable fields while the identifier remains immutable

#### Scenario: Delete blocked by foreign key
- **WHEN** deleting an Association or Aggregation participant violates a foreign-key restriction
- **THEN** the API returns a conflict error and does not invent a cascade
