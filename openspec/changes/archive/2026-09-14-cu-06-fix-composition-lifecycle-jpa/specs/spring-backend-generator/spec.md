## ADDED Requirements

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
