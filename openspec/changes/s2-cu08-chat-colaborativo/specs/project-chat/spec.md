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
