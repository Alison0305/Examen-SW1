## MODIFIED Requirements

### Requirement: Semantic bounded mentor context
The system SHALL build a deterministic bounded context from `ProjectDocument.uml` and SHALL exclude visual layout, credentials and unrelated project data. When authorized project memory exists, the system SHALL provide it separately from the current UML context, with explicit bounded size and historical revision information.

#### Scenario: Two projects have different models
- **WHEN** comparable questions are sent for two accessible projects
- **THEN** each provider request SHALL contain only the model elements, revision and memory antecedents of its own project

#### Scenario: Project has prior Mentor interactions
- **WHEN** an authorized project query has bounded prior interactions
- **THEN** the provider SHALL receive the current UML context and the separate project antecedents without user identity fields
