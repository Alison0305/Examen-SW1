## Purpose

Proporciona memoria persistente y acotada para que el Mentor recupere antecedentes autorizados de un proyecto sin exponer identidad ni datos de otros proyectos.

## ADDED Requirements

### Requirement: Persisted project interaction memory
The system SHALL persist each completed Mentor interaction with its project, authenticated author snapshot, authorized role, server occurrence time, project revision, question, answer and grounded state.

#### Scenario: Interaction survives a new repository instance
- **WHEN** a completed interaction is recorded and memory is read through a new repository instance
- **THEN** its author, project, timestamp, revision, question and answer SHALL be available

### Requirement: Authorized project-scoped memory retrieval
The system SHALL retrieve Mentor memory only after project view access is authorized and SHALL return interactions from only the requested project.

#### Scenario: Shared project members query memory
- **WHEN** two authorized users query the same project
- **THEN** both SHALL receive its project memory while each persisted interaction retains its own author

#### Scenario: Unauthorized user queries a project
- **WHEN** a user without project access queries Mentor
- **THEN** the system SHALL not retrieve or expose that project's memory

### Requirement: Bounded chronological memory context
The system SHALL use explicit limits for the number and total text size of recovered interactions and SHALL return selected antecedents in chronological order.

#### Scenario: History exceeds the memory window
- **WHEN** a project contains more interactions than the configured window or text budget
- **THEN** the system SHALL provide only the bounded recent subset

### Requirement: Revision-aware historical antecedents
The system SHALL retain the project revision of each interaction and SHALL mark an antecedent from an earlier revision as potentially stale when the current revision is newer.

#### Scenario: UML revision advances
- **WHEN** memory from revision N is recovered for a project at revision N+1
- **THEN** the recovered antecedent SHALL identify its historical revision and potential staleness
