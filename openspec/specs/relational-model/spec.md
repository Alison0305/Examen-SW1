# relational-model Specification

## Purpose

Define a deterministic relational projection of the canonical UML model with navigable generation diagnostics.

## Requirements

### Requirement: Deterministic relational projection
The system SHALL transform the same valid CanonicalUmlModel and generation configuration into the same ordered RelationalModel.

#### Scenario: Repeated mapping
- **WHEN** the mapper receives equivalent input twice
- **THEN** tables, columns, constraints and relations have equivalent ordered content

### Requirement: Blocking generation gaps
The system SHALL report structured blocking diagnostics when required relational semantics cannot be derived from UML metadata.

#### Scenario: Missing primary key metadata
- **WHEN** an entity has no approved identifier mapping
- **THEN** the mapper reports a blocking diagnostic and does not invent a primary key

### Requirement: Safe relational relationship projection
The system SHALL project only classes marked as entities, preserve target primary-key types in foreign keys, and omit a foreign key when target primary-key semantics are not uniquely derivable.

#### Scenario: Multiple many-to-many relationships
- **WHEN** two N:M relationships connect the same entity pair
- **THEN** each relationship has a distinct deterministic join table and each join table has a composite unique constraint over its two foreign-key columns

#### Scenario: Unsupported source semantics
- **WHEN** a source identifier is invalid, an attribute type is unsupported, or a relationship reaches a non-entity
- **THEN** the mapper reports a blocking diagnostic without silently sanitizing the name, creating a fallback column, or creating the relationship
