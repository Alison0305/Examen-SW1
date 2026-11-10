## ADDED Requirements

### Requirement: Separate technical recommendation query
The system SHALL expose an authenticated technical-recommendation query separate from the free Mentor query and SHALL preserve the existing free-query contract. The recommendation query SHALL return a structured read-only result and SHALL not invoke UML commands or persistence that changes a project document.

#### Scenario: Existing free query remains compatible
- **WHEN** an authenticated user sends a valid request to the existing free Mentor query
- **THEN** the system SHALL preserve its existing textual response contract and behavior

#### Scenario: Authorized user requests a technical recommendation
- **WHEN** an authenticated user with view access sends a valid technical recommendation request
- **THEN** the system SHALL authorize access before loading context and return a structured recommendation or structured clarification
