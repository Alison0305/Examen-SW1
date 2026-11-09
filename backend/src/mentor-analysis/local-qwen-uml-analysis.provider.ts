import { UmlAnalysisAiError, type UmlAnalysisAiProvider, type UmlAnalysisAiRequest, type UmlAnalysisAiResult, type UmlAnalysisTextGenerator } from "./uml-analysis-ai.contracts";

/**
 * Adaptador de CU-2P-04 hacia el modelo local de texto (Qwen3).
 *
 * Su única responsabilidad es entregar al generador exactamente el `systemPrompt` y el `userPrompt` recibidos,
 * validar la salida y devolver `{ text }`. No construye ni retoca prompts, no analiza UML, no consulta proyectos y
 * no conoce `UmlAnalysisContext`. Tampoco reintenta ni fabrica una explicación alternativa si la generación falla:
 * la capa superior decide cómo responder.
 *
 * Errores: `UmlAnalysisAiError` con `INVALID_OUTPUT` (respuesta vacía o no textual) o `GENERATION_FAILED` (el
 * generador falló; el error original queda en `cause` y su mensaje no se expone).
 */
export class LocalQwenUmlAnalysisProvider implements UmlAnalysisAiProvider {
  constructor(private readonly generator: UmlAnalysisTextGenerator) {}

  async explain(request: UmlAnalysisAiRequest): Promise<UmlAnalysisAiResult> {
    let output: unknown;
    try {
      // A fresh object with exactly the two prompts: no prefixes, suffixes or extra instructions.
      output = await this.generator.generateText({ systemPrompt: request.systemPrompt, userPrompt: request.userPrompt });
    } catch (error) {
      if (error instanceof UmlAnalysisAiError) throw error;
      throw new UmlAnalysisAiError("GENERATION_FAILED", { cause: error });
    }
    // The port promises a string, but the runtime behind it is outside this module: check before trusting it.
    if (typeof output !== "string") throw new UmlAnalysisAiError("INVALID_OUTPUT");
    // Only surrounding whitespace is removed; the content (accents, "0..*", arrows, names) is kept as generated.
    const text = output.trim();
    if (text.length === 0) throw new UmlAnalysisAiError("INVALID_OUTPUT");
    return { text };
  }
}
