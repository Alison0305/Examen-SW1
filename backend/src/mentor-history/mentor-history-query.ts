import { decodeHistoryCursor } from "./mentor-history-cursor";
import {
  MENTOR_HISTORY_DEFAULT_LIMIT,
  MENTOR_HISTORY_MAX_LIMIT,
  MENTOR_HISTORY_SEARCH_MAX_LENGTH,
  type MentorHistoryCursor,
  type MentorHistoryQueryParse,
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

  let limit = MENTOR_HISTORY_DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const value = query.limit;
    const parsed = typeof value === "string" && DECIMAL_INTEGER.test(value) ? Number(value) : Number.NaN;
    if (!(parsed >= 1 && parsed <= MENTOR_HISTORY_MAX_LIMIT)) return { ok: false, error: { code: "INVALID_LIMIT", message: `limit debe ser un entero entre 1 y ${MENTOR_HISTORY_MAX_LIMIT}.` } };
    limit = parsed;
  }

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
