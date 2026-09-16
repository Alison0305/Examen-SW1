## ADDED Requirements

### Requirement: API generation metadata projection
The system SHALL preserve explicitly declared CRUD, read-only, resource-name, searchable, sortable and default-sort metadata needed by downstream generated API artifacts.

#### Scenario: Metadata absent
- **WHEN** an entity or attribute omits optional API metadata
- **THEN** the projection applies documented deterministic defaults without inferring plural forms or business semantics

#### Scenario: Ambiguous default sort
- **WHEN** more than one attribute declares default sort for an entity, or its attribute is not sortable
- **THEN** the projection reports a blocking diagnostic
