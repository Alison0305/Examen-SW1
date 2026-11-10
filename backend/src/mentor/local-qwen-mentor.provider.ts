import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { LocalModelError, QueuedLocalTextModel } from "../assistant/local-text-model";
import { parseSingleJsonObject } from "../assistant/structured-json";
import type { MentorAiProvider, MentorMemory, MentorProjectContext, MentorRecommendationContext, MentorRecommendationDraft, MentorRecommendationProvider } from "./mentor.contracts";
import { hasUnsupportedCurrentStackReference, verifiedArchitectureBlocks } from "./mentor-recommendation-context";

const recommendationKeys = ["problem", "alternatives", "rationale", "limitations", "confidence", "needsClarification", "requiresUmlChange"] as const;
export const RECOMMENDATION_MAX_TOKENS = 384;
export const RECOMMENDATION_CONFIDENCE_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;
const recommendationSchema = {
  type: "object",
  properties: {
    problem: { type: "string", minLength: 1, maxLength: 160 },
    alternatives: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 140 } },
    rationale: { type: "string", minLength: 2, maxLength: 180 },
    limitations: { type: "string", minLength: 1, maxLength: 180 },
    confidence: { enum: RECOMMENDATION_CONFIDENCE_VALUES },
    needsClarification: { type: "boolean" },
    requiresUmlChange: { type: "boolean" },
  },
  required: [...recommendationKeys],
  additionalProperties: false,
} as const;

export class RecoverableTechnicalReferenceError extends Error {
  constructor() {
    super("La recomendación presentó tecnología no verificada como arquitectura actual.");
    this.name = "RecoverableTechnicalReferenceError";
  }
}

export class RecoverableRecommendationOutputError extends Error {
  constructor() {
    super("La recomendación estructurada no cumplió el contrato de calidad.");
    this.name = "RecoverableRecommendationOutputError";
  }
}

function nonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function simpleAlternative(value: unknown): value is string {
  return nonEmptyString(value, 140) && !/^[{[]/.test(value.trim());
}

function normalizedAlternative(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(?:we need to|need to|se recomienda|la propuesta seria|se propone|add a new|add|agregar|anadir|nuevo|nueva|un|una|el|la)\b/gu, " ")
    .replace(/\b(?:attribute|atributo)\b/gu, " atributo ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueAlternatives(alternatives: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return alternatives.filter((alternative) => {
    const normalized = normalizedAlternative(alternative);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function completeSentence(value: unknown): value is string {
  return nonEmptyString(value, 180) && /[.!?]["')\]]?$/.test(value.trim());
}

function hasUnsupportedReadOnlyLanguage(value: string): boolean {
  return /\b(?:agregamos|se\s+agreg[oó]|fue\s+aplicad[oa]|ya\s+se\s+modific[oó]|aplicamos|we\s+added|has\s+been\s+applied|was\s+applied)\b/iu.test(value)
    || /\b(?:we\s+need\s+to|add\s+(?:a\s+)?new\s+attribute)\b/iu.test(value);
}

function parseRecommendation(value: unknown): MentorRecommendationDraft | undefined {
  if (typeof value === "string") value = parseSingleJsonObject(value);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const output = value as Record<string, unknown>;
  if (Object.keys(output).length !== recommendationKeys.length || !recommendationKeys.every((key) => key in output)) return undefined;
  if (!nonEmptyString(output.problem, 160) || !Array.isArray(output.alternatives) || output.alternatives.length === 0 || output.alternatives.length > 3 || !output.alternatives.every(simpleAlternative) || !completeSentence(output.rationale) || !nonEmptyString(output.limitations, 180) || typeof output.confidence !== "number" || !RECOMMENDATION_CONFIDENCE_VALUES.includes(output.confidence as typeof RECOMMENDATION_CONFIDENCE_VALUES[number]) || typeof output.needsClarification !== "boolean" || typeof output.requiresUmlChange !== "boolean") return undefined;
  const fields = [output.problem, ...output.alternatives, output.rationale, output.limitations];
  if (fields.some(hasUnsupportedReadOnlyLanguage)) return undefined;
  return { problem: output.problem, alternatives: uniqueAlternatives(output.alternatives), rationale: output.rationale, limitations: output.limitations, confidence: output.confidence, needsClarification: output.needsClarification, requiresUmlChange: output.requiresUmlChange };
}

@Injectable()
export class LocalQwenMentorProvider implements MentorAiProvider, MentorRecommendationProvider {
  private readonly logger = new Logger(LocalQwenMentorProvider.name);

  constructor(private readonly model: QueuedLocalTextModel | undefined) {}

  async ask(context: MentorProjectContext, question: string, memory: MentorMemory = []): Promise<string> {
    if (!this.model) throw new ServiceUnavailableException("El Mentor IA local no está configurado.");
    try {
      return await this.model.generateText({
        systemPrompt: "Eres el Mentor IA de un proyecto UML. Responde solo con el contexto proporcionado. No inventes clases, atributos, enumeraciones ni relaciones. En cada relación, lee literalmente sourceToTarget y targetToSource: esas frases ya expresan la multiplicidad UML en la dirección correcta y nunca debes invertirlas. Si el contexto no basta, dilo claramente. Responde en español, de forma breve y técnica.",
        userPrompt: `Contexto UML actual autorizado:\n${JSON.stringify(context)}\n\nAntecedentes históricos autorizados (pueden estar desactualizados):\n${JSON.stringify(memory)}\n\nPregunta: ${question}`,
      });
    } catch (error) {
      if (error instanceof LocalModelError) throw new ServiceUnavailableException("El Mentor IA local no está disponible en este momento.");
      throw error;
    }
  }

  async recommend(context: MentorProjectContext, technicalContext: MentorRecommendationContext, question: string, memory: MentorMemory = [], retryInstruction?: string): Promise<MentorRecommendationDraft> {
    this.logger.log("recommendation:provider-entered");
    if (!this.model) {
      this.logRecommendationFailure("model-configuration", new LocalModelError("NOT_CONFIGURED"));
      throw new ServiceUnavailableException("El Mentor IA local no está configurado.");
    }
    let output: unknown;
    try {
      this.logger.log("recommendation:structured-generation-start");
      output = await this.model.generateStructured({
        systemPrompt: `Eres el Mentor IA. Devuelve exclusivamente un único objeto JSON, sin Markdown, títulos, texto adicional ni bloques de código. Usa exactamente estos campos: problem, alternatives, rationale, limitations, confidence, needsClarification, requiresUmlChange. alternatives es un arreglo de strings simples: no serialices objetos JSON dentro de sus strings. confidence debe ser exactamente uno de 0, 0.25, 0.5, 0.75 o 1. Para esta ruta, needsClarification debe ser false. Fundamenta solo en los contextos proporcionados. Para consultas de arquitectura, recomienda únicamente separación de responsabilidades, capas, módulos, servicios, DTOs y límites compatibles con la arquitectura actual; no elijas nuevamente tecnologías.\n\n${verifiedArchitectureBlocks()}\n\nUna alternativa futura no verificada solo se permite si la presentas explícitamente como alternativa futura, nunca como arquitectura actual. No inventes elementos UML, endpoints ni cambios aplicados. Responde en español y de forma concisa: problem hasta 160 caracteres, cada alternativa hasta 140, rationale debe ser una única frase completa de hasta 180 caracteres y limitations hasta 180.${retryInstruction ? `\n\n${retryInstruction}` : ""}`,
        userPrompt: `Contexto UML actual autorizado:\n${JSON.stringify(context)}\n\nHechos técnicos verificados:\n${JSON.stringify(technicalContext)}\n\nAntecedentes históricos autorizados (pueden estar desactualizados):\n${JSON.stringify(memory)}\n\nPregunta: ${question}`,
        schema: recommendationSchema,
        maxTokens: RECOMMENDATION_MAX_TOKENS,
      });
    } catch (error) {
      this.logRecommendationFailure("structured-generation", error);
      if (error instanceof LocalModelError) throw new ServiceUnavailableException("El Mentor IA local no está disponible en este momento.");
      if (error instanceof ServiceUnavailableException) throw error;
      throw error;
    }
    this.logger.log("recommendation:structured-generation-ok");
    const parsed = parseRecommendation(output);
    if (!parsed) {
      const error = new RecoverableRecommendationOutputError();
      this.logRecommendationFailure("recommendation-contract", error);
      throw error;
    }
    if (hasUnsupportedCurrentStackReference(parsed)) {
      const error = new RecoverableTechnicalReferenceError();
      this.logRecommendationFailure("technical-reference-validation", error);
      throw error;
    }
    this.logger.log("recommendation:contract-ok");
    return parsed;
  }

  private logRecommendationFailure(stage: string, error: unknown): void {
    const details = error instanceof LocalModelError
      ? { stage, errorName: error.name, errorCode: error.code, message: error.message }
      : error instanceof RecoverableTechnicalReferenceError
        ? { stage, errorName: error.name, errorCode: "UNVERIFIED_TECHNOLOGY", message: error.message }
        : error instanceof RecoverableRecommendationOutputError
          ? { stage, errorName: error.name, errorCode: "INVALID_OUTPUT", message: error.message }
        : { stage, errorName: error instanceof Error ? error.name : typeof error, errorCode: "UNEXPECTED", message: "Unexpected recommendation provider failure." };
    this.logger.warn(JSON.stringify(details));
  }
}
