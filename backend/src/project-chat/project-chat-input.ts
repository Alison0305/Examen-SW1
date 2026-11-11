import {
  PROJECT_CHAT_BODY_MAX_LENGTH,
  PROJECT_CHAT_DEFAULT_LIMIT,
  PROJECT_CHAT_MAX_LIMIT,
  type ProjectChatCursor,
  type ProjectChatError,
} from "./project-chat.contracts";

// Pure parsers of the chat API input. They never throw; the controller maps errors to 400.

const MENTION = /(^|[^\p{L}\p{N}_@])@mentor(?![\p{L}\p{N}_])/giu;

// `@mentor` as a whole word, case-insensitive ("@Mentor", "hola @mentor,"), never "@mentores" or "a@mentor".
// The question is the text without the mentions, with whitespace collapsed.
export function parseMentorMention(body: string): Readonly<{ mentionsMentor: boolean; question: string }> {
  const mentionsMentor = new RegExp(MENTION.source, MENTION.flags).test(body);
  if (!mentionsMentor) return { mentionsMentor: false, question: "" };
  const question = body.replace(new RegExp(MENTION.source, MENTION.flags), "$1").replace(/\s+/g, " ").trim();
  return { mentionsMentor: true, question };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// POST body: exactly `{ body }`, a string of 1..2000 characters after trimming. A null or non-object body is a 400,
// never a 500. Author, project, kind, dates or ids sent by a client are extra properties and also a 400.
export function parseProjectChatBody(raw: unknown): Readonly<{ ok: true; body: string }> | Readonly<{ ok: false; error: ProjectChatError }> {
  const invalid = { ok: false as const, error: { code: "INVALID_BODY" as const, message: `El mensaje debe tener entre 1 y ${PROJECT_CHAT_BODY_MAX_LENGTH} caracteres.` } };
  if (!isRecord(raw)) return invalid;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "body" || typeof raw.body !== "string") return invalid;
  const body = raw.body.trim();
  if (!body || body.length > PROJECT_CHAT_BODY_MAX_LENGTH) return invalid;
  return { ok: true, body };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_INTEGER = /^[0-9]+$/;

// Opaque cursor: base64url of { v: 1, t: ISO date, i: message id }. Not signed: every read is authorized per project.
export function encodeProjectChatCursor(cursor: ProjectChatCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, t: cursor.createdAt.toISOString(), i: cursor.id }), "utf8").toString("base64url");
}

function decodeProjectChatCursor(value: string): ProjectChatCursor | undefined {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(parsed) || Object.keys(parsed).sort().join(",") !== "i,t,v" || parsed.v !== 1) return undefined;
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string" || !UUID.test(parsed.i)) return undefined;
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.t) return undefined;
    return { createdAt, id: parsed.i };
  } catch {
    return undefined;
  }
}

export type ProjectChatListQuery = Readonly<{ limit: number; cursor?: ProjectChatCursor }>;

// GET query: `limit` 1..50 (default 30) and `cursor`; anything else (including repeated parameters) is a 400.
export function parseProjectChatListQuery(raw: unknown): Readonly<{ ok: true; query: ProjectChatListQuery }> | Readonly<{ ok: false; error: ProjectChatError }> {
  if (!isRecord(raw)) return { ok: false, error: { code: "UNKNOWN_PARAMETER", message: "La consulta no es válida." } };
  const unknown = Object.keys(raw).filter((key) => key !== "limit" && key !== "cursor").sort();
  if (unknown.length > 0) return { ok: false, error: { code: "UNKNOWN_PARAMETER", message: `Parámetros no admitidos: ${unknown.join(", ")}.` } };

  let limit = PROJECT_CHAT_DEFAULT_LIMIT;
  if (raw.limit !== undefined) {
    const parsed = typeof raw.limit === "string" && DECIMAL_INTEGER.test(raw.limit) ? Number(raw.limit) : Number.NaN;
    if (!(parsed >= 1 && parsed <= PROJECT_CHAT_MAX_LIMIT)) return { ok: false, error: { code: "INVALID_LIMIT", message: `limit debe ser un entero entre 1 y ${PROJECT_CHAT_MAX_LIMIT}.` } };
    limit = parsed;
  }

  if (raw.cursor === undefined) return { ok: true, query: { limit } };
  const cursor = typeof raw.cursor === "string" ? decodeProjectChatCursor(raw.cursor) : undefined;
  if (!cursor) return { ok: false, error: { code: "INVALID_CURSOR", message: "El cursor no es válido." } };
  return { ok: true, query: { limit, cursor } };
}
