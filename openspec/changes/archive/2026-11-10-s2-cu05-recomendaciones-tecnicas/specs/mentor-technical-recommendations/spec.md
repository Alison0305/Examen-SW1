## Purpose

Permite solicitar recomendaciones técnicas estructuradas y verificables sobre un proyecto autorizado, sin convertirlas en modificaciones ni acciones aplicadas sobre su modelo UML.

## ADDED Requirements

### Requirement: Structured read-only technical recommendation
The system SHALL return a technical recommendation with an identified problem, one or more alternatives, rationale, limitations or risks, confidence, clarification state and an explicit `requiresUmlChange` indicator. The response SHALL identify itself as a recommendation and SHALL state that no change has been applied.

#### Scenario: Recommendation may require a UML change
- **WHEN** an authorized user requests advice that recommends an attribute, relationship or multiplicity change
- **THEN** the response SHALL set `requiresUmlChange` to true and SHALL not modify the project's UML model, layout or revision

#### Scenario: Verified requested attribute addition
- **WHEN** an authorized user asks to add an absent attribute to an existing canonical UML class
- **THEN** the system SHALL return a deterministic Spanish read-only recommendation derived from that intent and the current model, SHALL set `requiresUmlChange` to true, and SHALL not invoke Qwen or add the attribute

#### Scenario: Architecture recommendation needs no UML change
- **WHEN** an authorized user requests advice about the verified application architecture
- **THEN** the response SHALL set `requiresUmlChange` to false and SHALL describe only a recommendation

### Requirement: Verifiable technical scope
The system SHALL base a recommendation only on the current semantic UML model, verified ShareGrams architecture facts, supported Spring backend generation facts and authorized project memory. It SHALL not invent technologies, UML elements, generated endpoints or applied changes.

#### Scenario: Architecture recommendation uses the real stack
- **WHEN** an authorized user asks how to keep frontend and backend logic separated
- **THEN** the recommendation SHALL use the verified Next.js, NestJS and, when persistence is relevant, PostgreSQL architecture facts without naming an unsupported stack

### Requirement: Verified architecture fallback after bounded technical retry
The system SHALL make at most one retry after `UNVERIFIED_TECHNOLOGY`. If that retry fails with the same error and a deterministically recognized general-architecture question has sufficient verified context, the system SHALL return a read-only structured fallback composed only from verified architecture facts. It SHALL not use the fallback for malformed provider output, engine failures, authorization failures, insufficient context, absent elements or external topics.

#### Scenario: Repeated unverified stack response for verified architecture
- **WHEN** both provider attempts for a general verified architecture question fail with `UNVERIFIED_TECHNOLOGY`
- **THEN** the system SHALL return a structured recommendation with `requiresUmlChange` false and without presenting React, Node.js or microservices as current architecture

### Requirement: Direct verified UML relationship recommendation
The system SHALL return a deterministic read-only recommendation before invoking Qwen when the current canonical UML context unambiguously verifies the mentioned relationship endpoints, relationship type, multiplicities, semantic direction when represented and current project revision. The recommendation SHALL use no facts from provider output or stale memory, SHALL preserve the verified relationship facts and SHALL not retry or invoke Qwen.

#### Scenario: Existing association with verified multiplicities
- **WHEN** an authorized user asks how to model an existing canonical association whose endpoints and multiplicities are verified
- **THEN** the system SHALL return a complete recommendation based on that association without invoking Qwen, SHALL preserve its type and multiplicities, SHALL not invent aggregation, composition or direction, and SHALL set `requiresUmlChange` to false without modifying UML, layout or revision

#### Scenario: Absent requested relationship
- **WHEN** an authorized user asks about a relationship whose mentioned endpoints do not form a verified canonical relationship
- **THEN** the system SHALL return the existing structured clarification and SHALL not invent a relationship or invoke the direct verified relationship recommendation

#### Scenario: Spring generation recommendation uses supported behavior
- **WHEN** an authorized user asks how to generate the Spring backend from the model
- **THEN** the system SHALL return a deterministic Spanish read-only recommendation before invoking Qwen, constrained to the verified canonical-UML validation and supported Spring generation pipeline, with `needsClarification` and `requiresUmlChange` set to false for a general request

### Requirement: Deterministic insufficient-context handling
The system SHALL return a structured clarification response without invoking the recommendation provider for a deterministically verifiable absent concrete UML element, relation, service or component, or for an external or ambiguous unsupported topic. It SHALL allow a general question about verified architecture without requiring a literal UML entity name.

#### Scenario: Requested UML element is absent
- **WHEN** an authorized request identifies a class or focused element not present in the current model
- **THEN** the response SHALL indicate insufficient context and SHALL not invent its attributes or relationships

#### Scenario: Unsupported external component
- **WHEN** an authorized request concerns an external component for which the project has no verified context
- **THEN** the response SHALL request clarification and SHALL not assume a provider, infrastructure or integration

#### Scenario: General verified architecture question
- **WHEN** an authorized request asks about the verified architecture without naming a UML element
- **THEN** the system SHALL send only the verified architecture context to the provider

### Requirement: Strict structured provider output
The system SHALL validate the exact structured recommendation output from Qwen before returning it. It SHALL return the existing controlled provider error for malformed, incomplete, extra-field or incorrectly typed output and SHALL not coerce free text or invent missing fields.

The system SHALL preserve only the first occurrence of each equivalent alternative after deterministic whitespace, case, punctuation and imperative-prefix normalization, without creating replacements. A rationale SHALL be one complete sentence within its bounded length; the system SHALL not truncate generated text after validation. Provider output SHALL be Spanish and SHALL not state or imply that a UML change was already applied.

#### Scenario: Invalid structured output
- **WHEN** Qwen returns an invalid structured recommendation
- **THEN** the system SHALL return a controlled availability error and SHALL not record an interaction

#### Scenario: Provider claims an applied change
- **WHEN** Qwen states that an attribute or UML change was added, applied or modified
- **THEN** the system SHALL reject the output as invalid and SHALL not record an interaction

### Requirement: Authorized memory and provider privacy
The system SHALL authorize project access before loading recommendation context or memory, and SHALL send the provider only the verified technical context and bounded memory for that project. It SHALL exclude identity, credentials, secrets and data from other projects.

#### Scenario: Recommendation reuses same-project memory
- **WHEN** an authorized recommendation has relevant bounded prior interactions in its project
- **THEN** the provider SHALL receive only that project's authorized memory with its revision staleness metadata

#### Scenario: Unrelated project request
- **WHEN** a user without view access requests a recommendation
- **THEN** the system SHALL not load the project, its memory or its technical context

### Requirement: Distinct read-only recommendation presentation
The system SHALL let a user request a technical recommendation from the existing Mentor panel through an action distinct from the free query, and SHALL render the structured result as read-only information.

#### Scenario: Recommendation is presented in the Mentor panel
- **WHEN** an authorized user requests a technical recommendation from the panel
- **THEN** the panel SHALL show problem, alternatives, rationale, limitations, UML-change indication and clarification state without offering actions to apply, confirm, reject or execute a model change

### Requirement: Bounded recommendation transport retry
The recommendation client SHALL retry its own POST request at most once only after a transport failure with no HTTP response. It SHALL not retry any HTTP response and SHALL not alter the free Mentor query behavior.

#### Scenario: Transport failure then success
- **WHEN** the first recommendation request fails at the transport layer and the retry succeeds
- **THEN** the client SHALL return the successful recommendation after exactly two requests

#### Scenario: HTTP failure
- **WHEN** a recommendation request receives an HTTP error response
- **THEN** the client SHALL surface that response without retrying

#### Scenario: Slow local inference
- **WHEN** a valid local Qwen recommendation takes longer than the former short inference limit
- **THEN** the panel SHALL remain visibly loading until the configured server-side inference bound or a response, and SHALL not create a duplicate request

#### Scenario: Abort cancellation
- **WHEN** the browser rejects a recommendation request with `AbortError`
- **THEN** the client SHALL surface the cancellation without retrying because it cannot establish that it was not intentional
