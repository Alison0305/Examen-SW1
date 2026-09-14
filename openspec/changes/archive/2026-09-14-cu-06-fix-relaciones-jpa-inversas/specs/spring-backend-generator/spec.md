## MODIFIED Requirements

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
