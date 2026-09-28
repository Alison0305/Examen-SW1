## Purpose

Permitir asociaciones UML recursivas visibles, persistidas y editables sin introducir un segundo modelo semántico.

## ADDED Requirements

### Requirement: Recursive Association
The system SHALL allow an Association whose source and target identify the same class while retaining independent multiplicities.

#### Scenario: Self Association
- **WHEN** a user selects the same class as both ends of an Association
- **THEN** one persisted relationship is created and rendered as a non-degenerate loop

#### Scenario: Independent multiplicities
- **WHEN** the two ends have different multiplicities
- **THEN** editing either end preserves the other end
