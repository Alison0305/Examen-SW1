import { parseUmlTextProposal, type UmlClass, type UmlTextProposal } from "@examen-sw1/uml-core";

// Mirrors the UML half of the backend contract in assistant-core (POST /assistant/interpret).
export type UmlInterpretationDiagnostic = Readonly<{ code: string; message: string }>;
export type UmlInterpretation =
  | Readonly<{ ok: true; source: "strict" | "model"; proposal: UmlTextProposal }>
  | Readonly<{ ok: false; diagnostic: UmlInterpretationDiagnostic; fallback?: string }>;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
// Generous client limit: the backend bounds inference itself, but the first request also loads the model.
const CLIENT_TIMEOUT_MS = 120_000;
// Diagnostics meaning "the local model cannot answer"; only these fall back to the strict grammar.
const UNAVAILABLE_CODES = new Set(["NOT_CONFIGURED", "MODEL_NOT_FOUND", "RUNTIME_NOT_AVAILABLE", "HOST_UNAVAILABLE"]);
const STRICT_PREFIX = /^\s*(CREATE_CLASS|RENAME_CLASS|DELETE_CLASS)\b/;

export const isStrictUmlText = (text: string): boolean => STRICT_PREFIX.test(text);

export function interpretStrictUmlText(text: string): UmlInterpretation {
  const parsed = parseUmlTextProposal(text.trim());
  return parsed.success ? { ok: true, source: "strict", proposal: parsed.proposal } : { ok: false, diagnostic: { code: "INVALID_OUTPUT", message: parsed.message } };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readResponse(body: unknown): UmlInterpretation | undefined {
  if (!isRecord(body)) return undefined;
  if (body.ok === true && isRecord(body.proposal) && (body.source === "model" || body.source === "strict")) return { ok: true, source: body.source, proposal: body.proposal as UmlTextProposal };
  if (body.ok === false && isRecord(body.diagnostic) && typeof body.diagnostic.code === "string" && typeof body.diagnostic.message === "string") return { ok: false, diagnostic: { code: body.diagnostic.code, message: body.diagnostic.message } };
  return undefined;
}

// Sends natural Spanish to the local interpreter. It only returns a proposal: applying it stays in the Command Bus.
export async function interpretNaturalUmlText(text: string, classes: readonly Pick<UmlClass, "id" | "name">[], fetchImpl: typeof fetch = fetch): Promise<UmlInterpretation> {
  let result: UmlInterpretation | undefined;
  try {
    const response = await fetchImpl(`${API_BASE_URL}/assistant/interpret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "uml", text: text.trim(), classes: classes.map(({ id, name }) => ({ id, name })) }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    result = readResponse(await response.json().catch(() => undefined));
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    result = timedOut ? { ok: false, diagnostic: { code: "TIMEOUT", message: "La interpretación local superó el tiempo máximo." } } : { ok: false, diagnostic: { code: "HOST_UNAVAILABLE", message: "No se pudo contactar al intérprete local." } };
  }
  result ??= { ok: false, diagnostic: { code: "INVALID_OUTPUT", message: "El intérprete local devolvió una respuesta no válida." } };
  if (result.ok || !UNAVAILABLE_CODES.has(result.diagnostic.code)) return result;
  // Fallback: without the local model only the strict grammar remains available.
  const strict = interpretStrictUmlText(text);
  return strict.ok ? strict : { ...result, fallback: strict.diagnostic.message };
}
