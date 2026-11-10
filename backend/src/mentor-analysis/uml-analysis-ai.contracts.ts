// CU-2P-04, fase 4.3: boundary between the UML analysis and the model that writes the explanation.
// The provider only receives finished prompts (built by uml-analysis-prompt.ts, the single source of the CU-2P-04
// prompt). It never sees the canonical model, the project, the user or any HTTP concern.

// Own token of CU-2P-04. MENTOR_AI_PROVIDER belongs to CU-2P-01 and works with another context and prompt.
export const UML_ANALYSIS_AI_PROVIDER = Symbol("UML_ANALYSIS_AI_PROVIDER");

export type UmlAnalysisAiRequest = Readonly<{
  systemPrompt: string;
  userPrompt: string;
}>;

export type UmlAnalysisAiResult = Readonly<{
  // Generated explanation: never presented as a deterministic fact.
  text: string;
}>;

export interface UmlAnalysisAiProvider {
  explain(request: UmlAnalysisAiRequest): Promise<UmlAnalysisAiResult>;
}

/**
 * Puerto mínimo de generación de texto que consume el proveedor.
 *
 * Es una frontera estructural temporal: el modelo local compartido que CU-2P-01 expondrá como
 * `ASSISTANT_LOCAL_MODEL` ofrece `generateText({ systemPrompt, userPrompt }): Promise<string>` y, por tipado
 * estructural, satisfará este contrato sin adaptadores cuando esa rama llegue a `main`. No se importa ni se copia
 * nada de `backend/src/assistant/`: la cola, el timeout y el runtime siguen siendo responsabilidad de ese módulo.
 */
export interface UmlAnalysisTextGenerator {
  generateText(request: UmlAnalysisAiRequest): Promise<string>;
}

// INVALID_OUTPUT: the generator answered, but with nothing usable. GENERATION_FAILED: the generator itself failed.
// Both are meant to become 503 in the service/controller layer; this module does not know about HTTP.
export type UmlAnalysisAiErrorCode = "INVALID_OUTPUT" | "GENERATION_FAILED";

const messages: Readonly<Record<UmlAnalysisAiErrorCode, string>> = {
  INVALID_OUTPUT: "El modelo local no produjo una explicación utilizable.",
  GENERATION_FAILED: "El modelo local no pudo generar la explicación.",
};

// The message is always the fixed, user-safe one. The original failure is kept in `cause` for server-side
// diagnosis and is never part of the message.
export class UmlAnalysisAiError extends Error {
  constructor(readonly code: UmlAnalysisAiErrorCode, options?: Readonly<{ cause?: unknown }>) {
    super(messages[code], options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "UmlAnalysisAiError";
  }
}
