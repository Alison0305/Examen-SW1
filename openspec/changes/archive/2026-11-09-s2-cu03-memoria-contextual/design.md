## Context

CU-2P-01 provides the authorized Mentor endpoint and local Qwen provider; CU-2P-02 provides identity derived from JWT and `requireView`. The recorder is currently an ephemeral replacement boundary. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Persist completed interactions in the existing PostgreSQL/Prisma database.
- Recover a deterministic, project-scoped and bounded memory block after authorization.
- Keep memory separate from the current UML context and identify older revisions.

**Non-Goals:**
- Embeddings, vector search, RAG services, a new endpoint, a visible conversation history, browser storage, automatic UML changes or another AI provider.

## Decisions

### Prisma interaction record

Add `MentorInteraction` related to `Project` and `User`, storing identity snapshots, revision, question, answer and grounded state. `Project` uses cascade deletion; `User` uses restrict deletion, matching existing ownership conventions. This is the sole persisted memory source.

### Recorder and reader boundaries

Keep `MentorInteractionRecorder` as the write boundary and add a dedicated memory reader interface backed by Prisma. `MentorService` resolves identity first, loads the project, then reads project memory; it never accepts identity or memory from HTTP input.

### Bounded deterministic selection

Use constants of six interactions, 1,200 characters per antecedent and 6,000 total characters. Query the newest bounded rows, fit them from newest backwards within the budget, then return selected entries chronologically. This avoids unbounded Qwen prompts without relevance heuristics or new dependencies.

### Separate prompt sections

Extend the provider boundary with a memory value separate from `MentorProjectContext`. It contains question, answer, revision and stale flag only. Qwen receives explicit current-UML and historical-memory sections, never user id, email, role, JWT or secrets.

### Revision staleness

An entry is potentially stale when its stored revision is lower than the current project revision. It remains available but is labeled in the prompt rather than represented as current UML state.

## Risks / Trade-offs

- Long historical answers may consume context → per-entry and total character limits preserve recent context.
- Recent-only selection may omit an older relevant answer → deterministic bounded memory is the intended initial strategy; semantic retrieval is deferred.
- Migration requires PostgreSQL availability → validate schema and migration status without reading secrets.

## Migration Plan

1. Add schema relations and generate a Prisma migration.
2. Deploy migration before backend instances use the persistent recorder.
3. Roll back application code if needed; historical rows remain intact and do not alter project documents.
