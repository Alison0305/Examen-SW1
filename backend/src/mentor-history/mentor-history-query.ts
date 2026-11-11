import { MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT, MENTOR_PROPOSAL_HISTORY_MAX_LIMIT } from "../mentor-proposals/mentor-proposal.contracts";
import { decodeHistoryCursor } from "./mentor-history-cursor";
import {
  MENTOR_HISTORY_DEFAULT_LIMIT,
  MENTOR_HISTORY_MAX_LIMIT,
  MENTOR_HISTORY_SEARCH_MAX_LENGTH,
  type MentorHistoryCursor,
  type MentorHistoryQueryParse,
  type MentorProposalHistoryQueryParse,
} from "./mentor-history.contracts";

// CU-2P-07: raw HTTP query → normalized `MentorHistoryQuery`. Pure, never throws; the error codes are mapped to HTTP
// by the controller in a later phase.

const ALLOWED_PARAMETERS = new Set(["limit", "cursor", "q"]);
const DECIMAL_INTEGER = /^[0-9]{1,3}$/;
// PostgreSQL TEXT rejects NUL and the other C0/DEL characters have no place in a search box.
const hasControlCharacter = (value: string) => [...value].some((character) => {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
});

export function parseMentorHistoryQuery(raw: unknown): MentorHistoryQueryParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: { code: "UNKNOWN_PARAMETER", message: "La consulta del historial no es válida." } };
  const query = raw as Record<string, unknown>;
  const unknown = Object.keys(query).filter((key) => !ALLOWED_PARAMETERS.has(key)).sort();
  if (unknown.length > 0) return { ok: false, error: { code: "UNKNOWN_PARAMETER", message: `Parámetros no admitidos: ${unknown.join(", ")}.` } };

  const limit = parseLimit(query.limit, MENTOR_HISTORY_DEFAULT_LIMIT, MENTOR_HISTORY_MAX_LIMIT);
  if (limit === undefined) return { ok: false, error: { code: "INVALID_LIMIT", message: `limit debe ser un entero entre 1 y ${MENTOR_HISTORY_MAX_LIMIT}.` } };

  let cursor: MentorHistoryCursor | undefined;
  if (query.cursor !== undefined) {
    const decoded = decodeHistoryCursor(query.cursor);
    if (!decoded.ok) return { ok: false, error: { code: "INVALID_CURSOR", reason: decoded.reason, message: "El cursor del historial no es válido." } };
    cursor = decoded.cursor;
  }

  let search: string | undefined;
  if (query.q !== undefined) {
    const value = typeof query.q === "string" ? query.q.trim() : "";
    if (value.length < 1 || value.length > MENTOR_HISTORY_SEARCH_MAX_LENGTH || hasControlCharacter(value)) {
      return { ok: false, error: { code: "INVALID_SEARCH", message: `La búsqueda debe contener entre 1 y ${MENTOR_HISTORY_SEARCH_MAX_LENGTH} caracteres sin caracteres de control.` } };
    }
    search = value;
  }

  return { ok: true, query: { limit, ...(cursor ? { cursor } : {}), ...(search !== undefined ? { search } : {}) } };
}

// Absent → the default; a single decimal string within 1..max → that number; anything else (0, 51, "abc", "1.5",
// " 5", a repeated parameter delivered as an array) → undefined. Shared by both history queries.
function parseLimit(value: unknown, defaultLimit: number, maxLimit: number): number | undefined {
  if (value === undefined) return defaultLimit;
  const parsed = typeof value === "string" && DECIMAL_INTEGER.test(value) ? Number(value) : Number.NaN;
  return parsed >= 1 && parsed <= maxLimit ? parsed : undefined;
}

const PROPOSAL_PARAMETERS = new Set(["limit"]);

/**
 * Raw HTTP query of `GET /projects/:id/mentor/history/proposals` → the limit for MentorProposalHistoryService.list.
 * Only `limit` is accepted, with CU-2P-06's own range and default (its constants, not a copy): the proposal list has
 * no cursor and no search, so `cursor`, `q` or any other parameter is UNKNOWN_PARAMETER. Pure, never throws.
 */
export function parseMentorProposalHistoryQuery(raw: unknown): MentorProposalHistoryQueryParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: { code: "UNKNOWN_PARAMETER", message: "La consulta de propuestas no es válida." } };
  const query = raw as Record<string, unknown>;
  const unknown = Object.keys(query).filter((key) => !PROPOSAL_PARAMETERS.has(key)).sort();
  if (unknown.length > 0) return { ok: false, error: { code: "UNKNOWN_PARAMETER", message: `Parámetros no admitidos: ${unknown.join(", ")}.` } };
  const limit = parseLimit(query.limit, MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT, MENTOR_PROPOSAL_HISTORY_MAX_LIMIT);
  if (limit === undefined) return { ok: false, error: { code: "INVALID_LIMIT", message: `limit debe ser un entero entre 1 y ${MENTOR_PROPOSAL_HISTORY_MAX_LIMIT}.` } };
  return { ok: true, limit };
}
