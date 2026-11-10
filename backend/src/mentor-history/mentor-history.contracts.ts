// CU-2P-07: contracts of the shared, project-scoped Mentor history.
// The history reads the same `MentorInteraction` table that CU-2P-03 writes (single source of truth), but it is a
// different use case from the Mentor memory: newest first, paginated, with author, full text and no Qwen.

// ---------------------------------------------------------------------------------------------
// Limits

export const MENTOR_HISTORY_DEFAULT_LIMIT = 20;
export const MENTOR_HISTORY_MAX_LIMIT = 50;
export const MENTOR_HISTORY_SEARCH_MAX_LENGTH = 200;
// An encoded cursor is ~120 characters; anything far longer is rejected before decoding.
export const MENTOR_HISTORY_CURSOR_MAX_LENGTH = 256;

// ---------------------------------------------------------------------------------------------
// Query

// Raw HTTP query (`GET /projects/:id/mentor/history?limit=&cursor=&q=`). Values arrive as strings, or as arrays
// when a parameter is repeated; anything else is rejected by `parseMentorHistoryQuery`.
export type MentorHistoryRawQuery = Readonly<Record<string, unknown>>;

// Keyset position: the last item already delivered, in the order `occurredAt DESC, id DESC`.
export type MentorHistoryCursor = Readonly<{ occurredAt: Date; id: string }>;

// Normalized, validated query used inside the backend.
export type MentorHistoryQuery = Readonly<{
  limit: number;
  cursor?: MentorHistoryCursor;
  // Trimmed text, 1–200 characters; matched case-insensitively against question and answer, always inside the project.
  search?: string;
}>;

export type MentorHistoryCursorErrorReason = "MALFORMED_CURSOR" | "UNSUPPORTED_CURSOR_VERSION" | "INVALID_CURSOR_DATE" | "INVALID_CURSOR_ID";

export type MentorHistoryQueryError =
  | Readonly<{ code: "INVALID_CURSOR"; reason: MentorHistoryCursorErrorReason; message: string }>
  | Readonly<{ code: "INVALID_LIMIT"; message: string }>
  | Readonly<{ code: "INVALID_SEARCH"; message: string }>
  | Readonly<{ code: "UNKNOWN_PARAMETER"; message: string }>;

export type MentorHistoryQueryParse = Readonly<{ ok: true; query: MentorHistoryQuery }> | Readonly<{ ok: false; error: MentorHistoryQueryError }>;

// ---------------------------------------------------------------------------------------------
// Public DTO (the only shape that leaves the backend)

export type MentorHistoryItem = Readonly<{
  id: string;
  author: Readonly<{ email: string }>;
  question: string;
  answer: string;
  // ISO 8601, UTC, millisecond precision.
  occurredAt: string;
}>;

export type MentorHistoryPage = Readonly<{
  items: readonly MentorHistoryItem[];
  // Opaque; null when there are no more items.
  nextCursor: string | null;
}>;

// Result of MentorHistoryService.list once access was granted: the page, or the deterministic query error (mapped to
// HTTP by the controller). Missing access is not a result: requireView throws its existing NotFoundException.
export type MentorHistoryListResult = Readonly<{ ok: true; page: MentorHistoryPage }> | Readonly<{ ok: false; error: MentorHistoryQueryError }>;

// CU-2P-06 has no proposal model yet: no proposal state is exposed here. When CU-2P-06 provides its source of truth,
// the item gains its state from there; CU-2P-07 does not invent fields, tables or placeholder values for it.

// ---------------------------------------------------------------------------------------------
// Persistence port (implemented by PrismaMentorHistoryReader)

// Fields of a `MentorInteraction` row that the history may read. `userId`, `accessRole`, `projectRevision` and
// `grounded` are deliberately absent: they never reach the public DTO.
export type MentorHistoryRecord = Readonly<{ id: string; authorEmail: string; question: string; answer: string; occurredAt: Date }>;

export const MENTOR_HISTORY_READER = Symbol("MENTOR_HISTORY_READER");

export interface MentorHistoryReader {
  /**
   * Returns one page of the project's interactions, newest first (`occurredAt DESC, id DESC`), strictly after
   * `query.cursor` when present, filtered by `query.search` when present. Only rows of `projectId` are read. It is
   * called after `requireView`; it never authorizes by itself and never calls the local model.
   */
  page(projectId: string, query: MentorHistoryQuery): Promise<MentorHistoryPage>;
}
