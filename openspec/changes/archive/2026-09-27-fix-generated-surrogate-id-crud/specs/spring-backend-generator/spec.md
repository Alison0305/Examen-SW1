## MODIFIED Requirements

### Requirement: Deterministic generated files
The system SHALL exclude relational columns marked `generated` from create and update requests and assignments while retaining them in entities and responses.

#### Scenario: Equivalent relational model
- **WHEN** the generator receives the same RelationalModel and configuration
- **THEN** it returns the same paths and contents without timestamps or random values

#### Scenario: One-to-one inverse association
- **WHEN** a one-to-one relation has an owning foreign-key field in one participating entity
- **THEN** only the other participating entity contains an inverse `mappedBy` field that names that owning field

#### Scenario: Non-participating entity
- **WHEN** an entity does not participate in a relational association
- **THEN** its generated source contains no inverse field derived from that association

#### Scenario: Generated surrogate identifier
- **WHEN** an entity has a primary key with `generated: true`
- **THEN** its create and update requests omit that column, its create service does not assign it, and its entity and response retain it

#### Scenario: Non-generated identifier
- **WHEN** an identifier is not marked generated
- **THEN** its existing create contract remains unchanged
