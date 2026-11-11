import { Logger } from "@nestjs/common";
import type { LocalTextModel } from "@examen-sw1/assistant-core";
import { LocalModelError } from "../assistant/local-text-model";
import { MENTOR_PROPOSAL_INTENT_SCHEMA, namesAreLiteral, parseMentorProposalIntent, type MentorProposalIntentParse } from "./mentor-proposal-intent";

// CU-2P-06, phase 7: generation of a MentorProposalIntent with the shared local Qwen (ASSISTANT_LOCAL_MODEL, the same
// queued node-llama-cpp model used by CU-2P-01/04/05 and the interpreter). The model only proposes; this provider
// returns a strictly validated intent or a domain error. It never resolves classes, assigns ids, builds or executes a
// UmlCommand, reads revisions or touches the project.

export const MENTOR_PROPOSAL_INTENT_GENERATOR = Symbol("MENTOR_PROPOSAL_INTENT_GENERATOR");

// Names only: the class names of the authoritative document, never ids, attributes, layout or the whole document.
export type MentorProposalIntentRequest = Readonly<{ instruction: string; classNames: readonly string[] }>;

export interface MentorProposalIntentGenerator {
  /**
   * Resolves `{ ok: true, intent }` or `{ ok: false, error }` (INVALID_PROPOSAL, UNSUPPORTED_OPERATION) for an output
   * that is not an allowed intent. Rejects with MentorProposalGenerationUnavailableError when the local model cannot
   * produce an answer (not configured, missing, busy, timeout, runtime failure).
   */
  generate(request: MentorProposalIntentRequest): Promise<MentorProposalIntentParse>;
}

// Carries no model path, prompt or raw output; the controller turns it into the usual safe 503.
export class MentorProposalGenerationUnavailableError extends Error {
  constructor() {
    super("La generación de propuestas no está disponible.");
    this.name = "MentorProposalGenerationUnavailableError";
  }
}

export const MENTOR_PROPOSAL_MAX_TOKENS = 128;

// One-shot example for literal names. Measured with Qwen3-1.7B-Q8_0 (2026-11-10): the copy rules alone, and an example
// with "dirección", did not stop "teléfono" → "telefono" (3/3); with this example "teléfono" is kept (3/3) and the
// behaviour generalizes ("teléfono" on Proveedor, "código", "género"). The name is still checked as a literal substring.
export const MENTOR_PROPOSAL_ACCENTED_EXAMPLE = {
  instruction: "Agrega el atributo teléfono de tipo String a Cliente",
  output: { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" },
} as const;

export const MENTOR_PROPOSAL_SYSTEM_PROMPT = [
  "Eres un generador de propuestas UML estructuradas.",
  "No produces código, no produces identificadores y no modificas el modelo: solo propones una intención.",
  "Selecciona únicamente una operación permitida; la única operación permitida es ADD_ATTRIBUTE (agregar un atributo a una clase existente).",
  "Copia className y attributeName literalmente desde la instrucción: no corrijas ortografía, no elimines tildes, no traduzcas ni normalices esos nombres y conserva las mayúsculas.",
  "Copy class and attribute names exactly as written by the user. Preserve accents, diacritics, capitalization and spelling. Never normalize identifiers.",
  "Copia el tipo tal como lo indica la instrucción.",
  "Si la instrucción pide cualquier otra cosa, responde {\"operation\":\"UNSUPPORTED\"}.",
  "Responde únicamente con el objeto JSON del schema solicitado.",
  // One-shot example with an accented name kept exactly.
  `Ejemplo: Instrucción: ${MENTOR_PROPOSAL_ACCENTED_EXAMPLE.instruction} → ${JSON.stringify(MENTOR_PROPOSAL_ACCENTED_EXAMPLE.output)}`,
].join(" ");

// Appended to the same user prompt for the single retry after a non-literal name.
export const MENTOR_PROPOSAL_LITERAL_RETRY_PROMPT = "Corrección: en el intento anterior cambiaste un nombre. Copia className y attributeName exactamente como aparecen en la instrucción, con las mismas tildes y mayúsculas.";

export function buildMentorProposalUserPrompt(request: MentorProposalIntentRequest, correction?: string): string {
  const names = [...new Set(request.classNames.map((name) => name.trim()).filter(Boolean))];
  return `Clases existentes en el modelo: ${JSON.stringify(names)}\nInstrucción: ${request.instruction}${correction ? `\n${correction}` : ""}`;
}

const NOT_LITERAL_ERROR = { code: "INVALID_PROPOSAL", message: "El asistente cambió el nombre de la clase o del atributo indicado en la instrucción.", diagnostics: [] } as const;

type Attempt = Readonly<{ kind: "done"; result: MentorProposalIntentParse }> | Readonly<{ kind: "not-literal" }>;

export class LocalQwenMentorProposalIntentProvider implements MentorProposalIntentGenerator {
  private readonly logger = new Logger(LocalQwenMentorProposalIntentProvider.name);

  constructor(private readonly model: Pick<LocalTextModel, "generateStructured"> | undefined) {}

  /**
   * At most two inferences. The only reason for a second one is a valid intent whose className or attributeName is
   * not a literal substring of the instruction (e.g. "teléfono" returned as "telefono"); it reuses the same
   * instruction, schema and strict parser plus a short correction. Unsupported operations, invalid output, extra
   * fields, model unavailability and later UML errors are never retried. A name the model alters twice is
   * INVALID_PROPOSAL; the server never rewrites it.
   */
  async generate(request: MentorProposalIntentRequest): Promise<MentorProposalIntentParse> {
    const first = await this.attempt(request);
    if (first.kind === "done") return first.result;
    this.logFailure("literal-names", "RETRY");
    const second = await this.attempt(request, MENTOR_PROPOSAL_LITERAL_RETRY_PROMPT);
    if (second.kind === "done") return second.result;
    this.logFailure("literal-names", NOT_LITERAL_ERROR.code);
    return { ok: false, error: NOT_LITERAL_ERROR };
  }

  private async attempt(request: MentorProposalIntentRequest, correction?: string): Promise<Attempt> {
    if (!this.model) {
      this.logFailure("model-configuration", "NOT_CONFIGURED");
      throw new MentorProposalGenerationUnavailableError();
    }
    let output: unknown;
    try {
      output = await this.model.generateStructured({
        systemPrompt: MENTOR_PROPOSAL_SYSTEM_PROMPT,
        userPrompt: buildMentorProposalUserPrompt(request, correction),
        schema: MENTOR_PROPOSAL_INTENT_SCHEMA,
        maxTokens: MENTOR_PROPOSAL_MAX_TOKENS,
      });
    } catch (error) {
      if (!(error instanceof LocalModelError)) throw error;
      this.logFailure("structured-generation", error.code);
      // The model answered, but not with one JSON object that matches the schema: an invalid proposal, not an outage.
      if (error.code === "INVALID_OUTPUT") return { kind: "done", result: { ok: false, error: { code: "INVALID_PROPOSAL", message: "El asistente no produjo una propuesta estructurada válida.", diagnostics: [] } } };
      throw new MentorProposalGenerationUnavailableError();
    }
    // The grammar already constrained the output; it is still validated as untrusted data.
    const parsed = parseMentorProposalIntent(output);
    if (!parsed.ok) {
      this.logFailure("intent-validation", parsed.error.code);
      return { kind: "done", result: parsed };
    }
    return namesAreLiteral(request.instruction, parsed.intent) ? { kind: "done", result: parsed } : { kind: "not-literal" };
  }

  // Stage and code only: never the instruction, the prompt, the raw output or the model path.
  private logFailure(stage: string, errorCode: string): void {
    this.logger.warn(JSON.stringify({ stage: `mentor-proposal:${stage}`, errorCode }));
  }
}
