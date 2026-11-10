## Context

The integrated Mentor already authorizes through `MentorInteractionIdentityResolver`, projects semantic `ProjectDocument.uml` with `MentorContextBuilder`, reads bounded Prisma memory and sends isolated UML and memory sections to local Qwen. The Spring export pipeline verifies canonical UML, maps it deterministically to a relational model and invokes the existing Spring generator. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Add a typed, read-only recommendation flow while preserving the existing free Mentor endpoint and memory recorder.
- Ground recommendations in a small deterministic catalogue of verified architecture and generator facts plus the existing semantic UML context.
- Return a deterministic clarification before Qwen for deterministically unsupported topics or missing concrete focused elements, while allowing general verified architecture questions without a literal UML entity.
- Leave a response contract that CU-2P-06 can consume as input without introducing proposal, diff or execution semantics.

**Non-Goals:**
- Applying, previewing, confirming or persisting an applied UML change; invoking the Command Bus; changing `ProjectDocument`, layout or revision.
- Copying CU-2P-04, requiring its contracts, extending memory limits, adding Prisma data, a UI history, RAG, embeddings, external services or cloud providers.
- Changing the existing free query endpoint or treating generated Spring artifacts as source code to execute.

## Decisions

### Specific route and service operation

Add `POST /projects/:id/mentor/recommendations` rather than extending `POST /projects/:id/mentor/query`. The free endpoint has a stable textual contract while recommendation responses are structured and must remain visibly distinct from future executable proposals. Both operations reuse one Mentor module, identity resolver, project loader, semantic context builder, memory reader, recorder and local Qwen queue. A route-specific DTO may accept an optional focus element name, which is matched only against the semantic context.

### Typed recommendation boundary

Introduce a recommendation request/result contract separate from `MentorQueryResponse`. The result contains `problem`, `alternatives`, `rationale`, `limitations`, `requiresUmlChange`, `needsClarification`, `confidence`, `projectRevision` and an explicit read-only status. The Qwen adapter uses the existing structured-generation capability and validates its output into this closed contract; malformed output becomes a controlled provider failure rather than unvalidated text. `requiresUmlChange` is descriptive only and no field denotes applied, accepted or executed state.

After shape validation, alternatives are deduplicated by a deterministic normalized key while retaining the first original string and its order. The rationale budget is limited to one complete sentence of at most 180 characters. Neither operation invents content or slices Qwen output; an unfinished rationale is rejected as invalid structured output before it can reach the API or panel.

### Verified context catalogue and conservative guard

Build recommendation input from: the existing UML context; a constant catalogue limited to the actual Next.js, NestJS, PostgreSQL, Prisma, Qwen-local and Spring-export facts; and a compact generator capability summary derived from the verified export pipeline. A deterministic topic/focus guard admits general architecture questions grounded in the catalogue even when they name no UML element. It returns a structured clarification without calling Qwen only for deterministically verifiable absent explicit classes, relations, services or components, and for external or ambiguous unsupported topics such as payments. This is preferred to relying only on a model instruction; it does not reject a general verified architecture question merely because it lacks a literal entity name.

### Verified architecture fallback after bounded retry

Architecture prompts include explicit `CURRENT_ARCHITECTURE` and `DO_NOT_PRESENT_AS_CURRENT` blocks so Qwen recommends compatible organization rather than selecting the current stack. The provider still validates the complete generated contract and may retry only once after `UNVERIFIED_TECHNOLOGY`. If that exact error recurs, and the question matches the deterministic general-architecture domain after the normal context guards have established sufficient context, the service composes a read-only response from the verified architecture catalogue. It never uses Qwen output or memory for this fallback. All other failures, insufficient context, external topics, authorization failures and malformed output preserve the controlled error or clarification behavior.

### Recommendation request lifetime and transport retry

The recommendation browser request has no client-side abort controller or timeout, so a valid local Qwen inference remains pending until the server responds. The local-model server bound defaults to 120 seconds, while remaining configurable through `ASSISTANT_TIMEOUT_MS`; it prevents an indefinitely blocked inference without treating a normal CPU inference as failed at 30 seconds. The client retries only a `TypeError` raised by `fetch` before an HTTP response, waits briefly before that one retry, and makes at most two POST attempts. HTTP responses, including 4xx, 5xx and 503, are never retried. `AbortError` is not retried because this flow owns no abort signal and it cannot safely distinguish an intentional navigation from a recoverable cancellation. The panel has a synchronous in-flight guard as well as disabled controls, and presents the spinner on the operation that is running.

### Direct verified UML relationship recommendation

When the question names both endpoints of an existing canonical relationship with its type and multiplicities verified, the service composes one read-only recommendation from that relationship before loading memory or invoking Qwen. It preserves only canonical type, endpoints, multiplicities and represented direction; it does not infer aggregation, composition, inverse direction, attributes or alternative multiplicities. It leaves `requiresUmlChange` false because it describes the current verified relationship. Stale memory may retain its warning but never supplies relationship facts. Missing elements, empty models, absent multiplicities, absent relationships, external topics and authorization failures cannot enter this deterministic path and preserve the existing clarification or provider flow.

### Memory and privacy reuse

The recommendation service resolves identity and `requireView` before project loading, then reads `MentorInteractionMemory.recent(projectId, revision)` unchanged. It passes only question, answer, revision and `isStale` memory fields; it omits user identity, roles, JWT, credentials, hashes and other project data. Successful recommendations are recorded through the existing recorder so the established persistence remains the sole memory source.

### No-modification invariant

The recommendation flow has no dependency on a command bus, persistence update or layout adapter. Tests retain a serialized project document and revision before the request and assert equality afterwards; service tests assert no mutation collaborator is invoked. CU-2P-06 can later translate a returned recommendation into a separate proposal without treating this response as an instruction to execute.

## Risks / Trade-offs

- [Conservative topic recognition rejects useful but underspecified questions] → return an explicit clarification with the supported context needed rather than hallucinating an integration.
- [Small local Qwen produces malformed structured output] → validate the exact response shape, required keys and value types and surface the existing controlled availability/error path; never coerce free text or infer missing fields into a recommendation.
- [Memory can be stale] → reuse existing `isStale` metadata and deterministic stale notice without enlarging the memory budget.
- [CU-2P-04 may later provide richer analysis] → expose recommendation context as a narrow internal boundary so CU-2P-04 can contribute an optional verified section after it is merged, without becoming a current dependency.

## Migration Plan

1. Deploy the backend code with the additive recommendation route; no schema migration is required.
2. Existing free Mentor clients continue using their unchanged route and contract.
3. Roll back by removing the additive route and recommendation contracts; existing interactions remain valid Mentor memory records.
