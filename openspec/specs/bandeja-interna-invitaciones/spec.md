# bandeja-interna-invitaciones Specification

## Purpose
Provide authenticated users with an internal inbox to review and resolve pending project invitations.

## Requirements

### Requirement: Pending invitation inbox
The system SHALL allow an authenticated user to list only active PENDING invitations whose normalized email matches their authenticated email, without exposing invitation tokens or token hashes.

#### Scenario: Registered recipient loads projects
- **WHEN** the recipient loads the projects screen
- **THEN** the system shows the count and details of their pending invitations

#### Scenario: Other recipient invitation
- **WHEN** an authenticated user requests their inbox
- **THEN** invitations addressed to another email are absent

### Requirement: Authenticated invitation resolution
The system SHALL let the matching authenticated recipient accept or reject an active invitation by id while preserving existing token resolution behavior.

#### Scenario: Accept
- **WHEN** the recipient accepts a pending invitation
- **THEN** the invitation becomes ACCEPTED, membership is created or updated by existing rules, and the project is available in their project list

#### Scenario: Reject
- **WHEN** the recipient rejects a pending invitation
- **THEN** it becomes REJECTED and no membership is created

#### Scenario: Unauthorized id
- **WHEN** a different user resolves an invitation id
- **THEN** the system does not resolve it or expose invitation details
