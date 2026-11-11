## ADDED Requirements

### Requirement: Project chat shared by all project members
The system SHALL provide one persistent chat per project. OWNER, EDITOR and VIEWER SHALL be able to read and post messages. A user without access to the project SHALL receive 404 and SHALL NOT learn whether the project or its messages exist. Messages SHALL never be visible from another project.

#### Scenario: Member posts a message
- **WHEN** an OWNER, EDITOR or VIEWER posts a message with a body of 1 to 2000 characters after trimming
- **THEN** the system SHALL persist it with the author taken from the JWT, return 201 with the public message and SHALL NOT accept author, project, kind or date from the request body

#### Scenario: Invalid body
- **WHEN** the body is missing, empty after trimming, longer than 2000 characters or contains extra properties
- **THEN** the system SHALL respond 400 and SHALL NOT persist anything

#### Scenario: Outsider
- **WHEN** a user without access posts or lists messages of a project, or the project does not exist
- **THEN** the system SHALL respond 404 before reading or writing any message

### Requirement: Paginated message list
The system SHALL list the messages of a project newest first with keyset pagination on `createdAt DESC, id DESC`, an opaque cursor and `limit` 1..50 (default 30). The public message SHALL contain only `id`, `kind`, `author` (`{ email }` for a person, null for the Mentor or a notice), `body`, `replyToId`, `proposalId` and `createdAt`.

#### Scenario: Pages without duplicates
- **WHEN** a client follows `nextCursor` until it is null
- **THEN** every message of the project SHALL appear exactly once, newest first

#### Scenario: Invalid query
- **WHEN** `limit` is outside 1..50, the cursor is malformed or an unknown parameter is sent
- **THEN** the system SHALL respond 400 with a public error code

### Requirement: Realtime delivery
The system SHALL broadcast every persisted message to the project's Socket.IO room with the same public shape, so that every connected member sees it without reloading. A message SHALL be broadcast only after it is persisted.

#### Scenario: Two members connected
- **WHEN** member A posts a message
- **THEN** member B, connected to the same project room, SHALL receive it once, and members of other projects SHALL NOT receive it

### Requirement: Mentor intervention by mention
The system SHALL treat a message that mentions `@mentor` (case-insensitive, as a whole word) as a question to the Mentor IA. The human message SHALL be persisted and broadcast immediately; the Mentor answer SHALL be generated asynchronously through the existing `MentorService.query` with the text without the mention and SHALL be persisted and broadcast as a message of kind `MENTOR` that replies to the human message. Messages without a mention SHALL never invoke the model.

#### Scenario: Mention answered
- **WHEN** a member posts `@mentor ¿cómo relaciono Cliente y Pedido?`
- **THEN** the room SHALL see the human message, a Mentor-thinking status, and then one `MENTOR` message replying to it

#### Scenario: Plain message
- **WHEN** a member posts a message without `@mentor`
- **THEN** the model SHALL NOT be invoked

#### Scenario: Mentor unavailable
- **WHEN** the local model is not configured, times out, the queue is full or the question is invalid (empty or longer than 500 characters after removing the mention)
- **THEN** the system SHALL persist and broadcast one `NOTICE` message replying to the human message with a safe explanation, and SHALL NOT expose model paths, prompts or stack traces

### Requirement: Privacy of the public message
The public message and the realtime payload SHALL NOT include user ids, access roles, project ids, prompts, model output metadata or internal UML identifiers.

#### Scenario: Public shape
- **WHEN** a message is returned by the API or broadcast
- **THEN** its keys SHALL be exactly `id`, `kind`, `author`, `body`, `replyToId`, `proposalId` and `createdAt`

### Requirement: Explicit Mentor actions in the chat
The system SHALL let members start the CU-2P-05 technical recommendation and the CU-2P-06 UML proposal from the chat with `POST /projects/:id/chat/actions` and `{ action, text }` (text 1..500). Any member SHALL be able to request a recommendation; only OWNER and EDITOR SHALL be able to request a proposal, and a VIEWER SHALL receive 403 before anything is written. The human request SHALL be published at once; the result SHALL be published by the server as a `MENTOR` message (readable recommendation without internal fields) or a `PROPOSAL` message (the deterministic diff and the proposal id), or as a safe `NOTICE` when it fails. A client SHALL never be able to publish a Mentor answer or a proposal card itself, and creating a proposal SHALL NOT modify the model.

#### Scenario: Proposal from the chat
- **WHEN** an EDITOR requests the proposal «A la clase Cliente, agrégame un atributo ID de tipo integer»
- **THEN** the room SHALL see the request and then one `PROPOSAL` message with `+ Cliente.ID: integer` and its proposal id, the proposal SHALL be `PENDING` and the diagram SHALL be unchanged until an editor applies it through the CU-2P-06 apply route

#### Scenario: Viewer requests a proposal
- **WHEN** a VIEWER requests a proposal
- **THEN** the system SHALL respond 403 and SHALL NOT write any message or create any proposal

#### Scenario: Recommendation from the chat
- **WHEN** any member requests a technical recommendation
- **THEN** the room SHALL see the request and one `MENTOR` message with problem, alternatives, rationale and limitations, without confidence, revision or status fields
