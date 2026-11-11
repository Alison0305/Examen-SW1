import { Logger } from "@nestjs/common";
import type { LocalTextModel } from "@examen-sw1/assistant-core";
import { LocalModelError } from "../assistant/local-text-model";
import { MENTOR_PROPOSAL_INTENT_SCHEMA, parseMentorProposalIntent, type MentorProposalIntentParse } from "./mentor-proposal-intent";

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

export const MENTOR_PROPOSAL_SYSTEM_PROMPT = [
  "Eres un generador de propuestas UML estructuradas.",
  "No produces código, no produces identificadores y no modificas el modelo: solo propones una intención.",
  "Selecciona únicamente una operación permitida; la única operación permitida es ADD_ATTRIBUTE (agregar un atributo a una clase existente).",
  "Copia el nombre de la clase, el nombre del atributo y el tipo tal como los indica la instrucción; incluye multiplicity solo si la instrucción la indica.",
  "Si la instrucción pide cualquier otra cosa, responde {\"operation\":\"UNSUPPORTED\"}.",
  "Responde únicamente con el objeto JSON del schema solicitado.",
].join(" ");

export function buildMentorProposalUserPrompt(request: MentorProposalIntentRequest): string {
  const names = [...new Set(request.classNames.map((name) => name.trim()).filter(Boolean))];
  return `Clases existentes en el modelo: ${JSON.stringify(names)}\nInstrucción: ${request.instruction}`;
}

export class LocalQwenMentorProposalIntentProvider implements MentorProposalIntentGenerator {
  private readonly logger = new Logger(LocalQwenMentorProposalIntentProvider.name);

  constructor(private readonly model: Pick<LocalTextModel, "generateStructured"> | undefined) {}

  async generate(request: MentorProposalIntentRequest): Promise<MentorProposalIntentParse> {
    if (!this.model) {
      this.logFailure("model-configuration", "NOT_CONFIGURED");
      throw new MentorProposalGenerationUnavailableError();
    }
    let output: unknown;
    try {
      output = await this.model.generateStructured({
        systemPrompt: MENTOR_PROPOSAL_SYSTEM_PROMPT,
        userPrompt: buildMentorProposalUserPrompt(request),
        schema: MENTOR_PROPOSAL_INTENT_SCHEMA,
        maxTokens: MENTOR_PROPOSAL_MAX_TOKENS,
      });
    } catch (error) {
      if (!(error instanceof LocalModelError)) throw error;
      this.logFailure("structured-generation", error.code);
      // The model answered, but not with one JSON object that matches the schema: an invalid proposal, not an outage.
      if (error.code === "INVALID_OUTPUT") return { ok: false, error: { code: "INVALID_PROPOSAL", message: "El asistente no produjo una propuesta estructurada válida.", diagnostics: [] } };
      throw new MentorProposalGenerationUnavailableError();
    }
    // The grammar already constrained the output; it is still validated as untrusted data.
    const parsed = parseMentorProposalIntent(output);
    if (!parsed.ok) this.logFailure("intent-validation", parsed.error.code);
    return parsed;
  }

  // Stage and code only: never the instruction, the prompt, the raw output or the model path.
  private logFailure(stage: string, errorCode: string): void {
    this.logger.warn(JSON.stringify({ stage: `mentor-proposal:${stage}`, errorCode }));
  }
}
