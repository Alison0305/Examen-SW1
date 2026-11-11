import { isUUID } from "class-validator";
import { MENTOR_HISTORY_CURSOR_MAX_LENGTH, type MentorHistoryCursor, type MentorHistoryCursorErrorReason } from "./mentor-history.contracts";

// CU-2P-07: opaque keyset cursor. It is base64url(JSON { v, t, i }): the client only stores and returns it, it is
// not signed or encrypted (it grants nothing: every read is still authorized and scoped to the project), and the
// version field allows a later format change to be rejected explicitly.

const CURSOR_VERSION = 1;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
// Exactly what Date#toISOString produces: PostgreSQL TIMESTAMP(3) keeps millisecond precision.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type MentorHistoryCursorDecode = Readonly<{ ok: true; cursor: MentorHistoryCursor }> | Readonly<{ ok: false; reason: MentorHistoryCursorErrorReason }>;

/** Encodes the position of the last delivered item. Deterministic: the same position always yields the same cursor. */
export function encodeHistoryCursor(position: MentorHistoryCursor): string {
  if (!(position.occurredAt instanceof Date) || Number.isNaN(position.occurredAt.getTime())) throw new TypeError("occurredAt must be a valid Date");
  if (!isUUID(position.id)) throw new TypeError("id must be a UUID");
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, t: position.occurredAt.toISOString(), i: position.id }), "utf8").toString("base64url");
}

/** Decodes and validates a cursor received from the client; never throws. */
export function decodeHistoryCursor(value: unknown): MentorHistoryCursorDecode {
  if (typeof value !== "string" || value.length === 0 || value.length > MENTOR_HISTORY_CURSOR_MAX_LENGTH || !BASE64URL.test(value)) return { ok: false, reason: "MALFORMED_CURSOR" };
  const bytes = Buffer.from(value, "base64url");
  // Node decodes base64url leniently; only the canonical spelling of the bytes is accepted.
  if (bytes.toString("base64url") !== value) return { ok: false, reason: "MALFORMED_CURSOR" };
  let payload: unknown;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED_CURSOR" };
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { ok: false, reason: "MALFORMED_CURSOR" };
  const keys = Object.keys(payload).sort();
  if (keys.length !== 3 || keys[0] !== "i" || keys[1] !== "t" || keys[2] !== "v") return { ok: false, reason: "MALFORMED_CURSOR" };
  const { v, t, i } = payload as Record<"v" | "t" | "i", unknown>;
  if (v !== CURSOR_VERSION) return { ok: false, reason: "UNSUPPORTED_CURSOR_VERSION" };
  if (typeof t !== "string" || !ISO_INSTANT.test(t)) return { ok: false, reason: "INVALID_CURSOR_DATE" };
  const occurredAt = new Date(t);
  // Rejects impossible calendar dates such as 2026-02-30, which Date would silently roll over.
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== t) return { ok: false, reason: "INVALID_CURSOR_DATE" };
  if (typeof i !== "string" || !isUUID(i)) return { ok: false, reason: "INVALID_CURSOR_ID" };
  return { ok: true, cursor: { occurredAt, id: i } };
}
