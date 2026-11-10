# project-contextual-mentor Specification

## Purpose

Permite consultas textuales al Mentor IA local con contexto UML autorizado, aislado por proyecto y fundamentado en el modelo vigente.

## Requirements

### Requirement: Authorized project mentor query
The system SHALL expose an authenticated mentor query scoped to one project and SHALL authorize view access before loading its document.

#### Scenario: Viewer queries an accessible project
- **WHEN** an authenticated VIEWER posts a valid question to `/projects/:id/mentor/query`
- **THEN** the system SHALL load only that project after `requireView` succeeds and return a contextual response

#### Scenario: Unrelated user queries a project
- **WHEN** an authenticated user without project access posts to the route
- **THEN** the system SHALL return the same not-found behavior as inaccessible projects and SHALL not load or expose its context

### Requirement: Semantic bounded mentor context
The system SHALL build a deterministic bounded context from `ProjectDocument.uml` and SHALL exclude visual layout, credentials and unrelated project data. When authorized project memory exists, the system SHALL provide it separately from the current UML context, with explicit bounded size and historical revision information.

#### Scenario: Two projects have different models
- **WHEN** comparable questions are sent for two accessible projects
- **THEN** each provider request SHALL contain only the model elements, revision and memory antecedents of its own project

#### Scenario: Project has prior Mentor interactions
- **WHEN** an authorized project query has bounded prior interactions
- **THEN** the provider SHALL receive the current UML context and the separate project antecedents without user identity fields

### Requirement: Grounded response and insufficient context
The system SHALL instruct its provider not to invent UML elements and SHALL return a grounded insufficient-context response when the model has no classes or an unambiguous requested element is absent.

#### Scenario: Empty UML model
- **WHEN** a valid query targets a project without classes
- **THEN** the system SHALL return `grounded: false`, `diagnostic: "INSUFFICIENT_CONTEXT"` and SHALL not call the provider

### Requirement: Replaceable provider and interaction registration
The Mentor service SHALL use provider and interaction-recorder contracts independent from Prisma and SHALL translate provider failures to a controlled service error.

#### Scenario: Provider completes a response
- **WHEN** the provider returns an answer
- **THEN** the recorder SHALL receive the project, user, revision, question and answer
