# spring-backend-generator Specification

## Purpose

Generate a deterministic, safe Spring Boot backend project from a RelationalModel.

## Requirements

### Requirement: Deterministic generated files
The system SHALL generate ordered `GeneratedFile` artifacts using Handlebars before filesystem writing, and each generated JPA inverse association SHALL represent only the same relational association as its owning field.

#### Scenario: Equivalent relational model
- **WHEN** the generator receives the same RelationalModel and configuration
- **THEN** it returns the same paths and contents without timestamps or random values

#### Scenario: One-to-one inverse association
- **WHEN** a one-to-one relation has an owning foreign-key field in one participating entity
- **THEN** only the other participating entity contains an inverse `mappedBy` field that names that owning field

#### Scenario: Non-participating entity
- **WHEN** an entity does not participate in a relational association
- **THEN** its generated source contains no inverse field derived from that association

### Requirement: Safe generated output
The system SHALL reject duplicate paths, absolute paths and path traversal before writing generated files.

#### Scenario: Unsafe generated path
- **WHEN** a generated file path escapes the configured output root
- **THEN** generation reports a blocking error and writes no file outside that root

### Requirement: Composition lifecycle direction
The system SHALL project a Composition lifecycle from the relational composite to its parts, preserving foreign-key ownership and nullability while preventing lifecycle propagation from a part to its composite.

#### Scenario: One-to-many composition
- **WHEN** a Composition has a composite source and multiple target parts with a foreign key owned by the parts
- **THEN** the composite collection has `cascade = CascadeType.ALL` and `orphanRemoval = true`, and the part-to-composite field has no `CascadeType.ALL`

#### Scenario: Non-composition relationship
- **WHEN** an Association or Aggregation has the same cardinality shape as a Composition
- **THEN** its generated fields do not gain `CascadeType.ALL` or `orphanRemoval = true` from Composition lifecycle rules

#### Scenario: One-to-one composition
- **WHEN** a one-to-one Composition is represented by the relational model
- **THEN** lifecycle annotations are emitted on the composite-to-part association regardless of which participant owns the foreign key
