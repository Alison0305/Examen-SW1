## MODIFIED Requirements

### Requirement: Distinct read-only recommendation presentation
The system SHALL let a user request a technical recommendation from the existing Mentor panel through an action distinct from the free query, and SHALL render the structured result as read-only information.

#### Scenario: Recommendation is presented in the Mentor panel
- **WHEN** an authorized user requests a technical recommendation from the panel
- **THEN** the panel SHALL show problem, alternatives, rationale, limitations, UML-change indication and clarification state without offering actions to apply, confirm, reject or execute a model change

#### Scenario: Recommendation requiring a UML change can start a proposal
- **WHEN** a recommendation has `requiresUmlChange` true and `needsClarification` false, and the user can edit the project
- **THEN** the panel MAY offer "Generar propuesta UML", which only starts a pending CU-2P-06 proposal from the user's own request and SHALL NOT modify the model, while the recommendation itself stays read-only

#### Scenario: No proposal action without a required change or edit access
- **WHEN** a recommendation has `requiresUmlChange` false or `needsClarification` true, or the user is a VIEWER
- **THEN** the panel SHALL NOT offer "Generar propuesta UML"
