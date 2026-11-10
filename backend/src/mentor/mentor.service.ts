import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { MentorInteractionIdentityResolver } from "../mentor-identity/mentor-interaction-identity.resolver";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { MentorContextBuilder } from "./mentor-context.builder";
import { MENTOR_AI_PROVIDER, MENTOR_INTERACTION_MEMORY, MENTOR_INTERACTION_RECORDER, type MentorAiProvider, type MentorInteractionMemory, type MentorInteractionRecorder, type MentorMemory, type MentorQueryResponse, type MentorRecommendationProvider, type MentorRecommendationRequest, type MentorRecommendationResponse } from "./mentor.contracts";
import { buildVerifiedArchitectureFallback, buildVerifiedAttributeAdditionRecommendation, buildVerifiedSpringGenerationRecommendation, buildVerifiedUmlRecommendation, deterministicRecommendationClarification, VERIFIED_RECOMMENDATION_CONTEXT } from "./mentor-recommendation-context";
import { RecoverableRecommendationOutputError, RecoverableTechnicalReferenceError } from "./local-qwen-mentor.provider";

const explicitElement = /\b(?:clase|class)(?:\s+(?:la|el))?\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)/i;
const staleMemoryNotice = "Nota: esta recomendación proviene de una revisión anterior del modelo UML y podría estar desactualizada respecto al modelo actual.";
const technicalRetryInstruction = "La respuesta anterior fue rechazada porque presentó tecnologías no verificadas como arquitectura actual. Regenera usando exclusivamente el contexto técnico verificado. No presentes React, Node.js, microservicios ni otras tecnologías no verificadas como arquitectura actual. Devuelve únicamente el objeto JSON requerido.";
const ignoredMemoryWords = new Set(["para", "como", "sobre", "desde", "entre", "este", "esta", "proyecto", "recomendacion", "recomendás", "recomendas", "mantener", "logica", "lógica"]);

function relevantWords(value: string): Set<string> {
  return new Set((value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 4 && !ignoredMemoryWords.has(word)));
}

function selectRelevantMemory(memory: MentorMemory, question: string): MentorMemory {
  const questionWords = relevantWords(question);
  if (questionWords.size === 0) return [];
  return memory.filter((entry) => {
    const memoryWords = relevantWords(`${entry.question} ${entry.answer}`);
    return [...questionWords].some((word) => memoryWords.has(word));
  });
}

@Injectable()
export class MentorService {
  private readonly logger = new Logger(MentorService.name);

  constructor(
    @Inject(MentorInteractionIdentityResolver) private readonly identities: MentorInteractionIdentityResolver,
    @Inject(ProjectsPersistenceService) private readonly projects: ProjectsPersistenceService,
    @Inject(MentorContextBuilder) private readonly contexts: MentorContextBuilder,
    @Inject(MENTOR_AI_PROVIDER) private readonly provider: MentorAiProvider & Partial<MentorRecommendationProvider>,
    @Inject(MENTOR_INTERACTION_RECORDER) private readonly recorder: MentorInteractionRecorder,
    @Inject(MENTOR_INTERACTION_MEMORY) private readonly memory: MentorInteractionMemory,
  ) {}

  async query(projectId: string, authenticatedUser: AuthenticatedUser, rawQuestion: string): Promise<MentorQueryResponse> {
    const question = rawQuestion.trim();
    if (!question || question.length > 500) throw new BadRequestException("La pregunta debe contener entre 1 y 500 caracteres.");
    const identity = await this.identities.resolve(projectId, authenticatedUser);
    const project = await this.projects.findProject(projectId);
    if (!project) throw new NotFoundException();
    const context = this.contexts.build(project);
    if (context.classes.length === 0) return { answer: "El proyecto no contiene clases suficientes para responder esta consulta.", grounded: false, projectRevision: project.revision, diagnostic: "INSUFFICIENT_CONTEXT" };
    const requested = explicitElement.exec(question)?.[1];
    if (requested && !context.elementNames.some((name) => name.localeCompare(requested, undefined, { sensitivity: "accent" }) === 0)) {
      return { answer: `No se encontró la clase ${requested} en el modelo UML vigente del proyecto.`, grounded: false, projectRevision: project.revision, diagnostic: "ELEMENT_NOT_FOUND" };
    }
    const memory = await this.memory.recent(projectId, project.revision);
    let answer: string;
    try {
      answer = await this.provider.ask(context, question, memory);
    } catch {
      throw new ServiceUnavailableException("El Mentor IA no está disponible en este momento.");
    }
    if (memory.some((entry) => entry.isStale)) answer = `${answer}\n\n${staleMemoryNotice}`;
    const response = { answer, grounded: true, projectRevision: project.revision } as const;
    await this.recorder.record({ ...identity, projectRevision: project.revision, question, answer, grounded: true });
    return response;
  }

  async recommend(projectId: string, authenticatedUser: AuthenticatedUser, request: MentorRecommendationRequest): Promise<MentorRecommendationResponse> {
    this.logger.log("recommendation:start");
    const question = request.question.trim();
    if (!question || question.length > 500) throw new BadRequestException("La pregunta debe contener entre 1 y 500 caracteres.");
    const focus = request.focus?.trim();
    if (request.focus !== undefined && (!focus || focus.length > 80)) throw new BadRequestException("El foco debe contener entre 1 y 80 caracteres.");
    const identity = await this.identities.resolve(projectId, authenticatedUser);
    this.logger.log("recommendation:identity-ok");
    const project = await this.projects.findProject(projectId);
    if (!project) throw new NotFoundException();
    this.logger.log("recommendation:project-ok");
    const context = this.contexts.build(project);
    this.logger.log("recommendation:context-ok");
    const clarification = deterministicRecommendationClarification(context, question, focus);
    if (clarification) {
      this.logger.log("recommendation:deterministic-clarification");
      return clarification;
    }
    const directUmlRecommendation = buildVerifiedAttributeAdditionRecommendation(context, question) ?? buildVerifiedUmlRecommendation(context, question) ?? buildVerifiedSpringGenerationRecommendation(question);
    if (directUmlRecommendation) {
      this.logger.log("recommendation:direct-verified-uml");
      const recentMemory = await this.memory.recent(projectId, project.revision);
      const memory = selectRelevantMemory(recentMemory, question);
      const limitations = memory.some((entry) => entry.isStale) ? `${directUmlRecommendation.limitations}\n\n${staleMemoryNotice}` : directUmlRecommendation.limitations;
      const response: MentorRecommendationResponse = { status: "READ_ONLY", ...directUmlRecommendation, limitations, needsClarification: false, projectRevision: project.revision };
      this.logger.log("recommendation:direct-uml-ok");
      this.logger.log("recommendation:recorder-start");
      await this.recorder.record({ ...identity, projectRevision: project.revision, question, answer: JSON.stringify(response), grounded: true });
      this.logger.log("recommendation:recorder-ok");
      return response;
    }
    if (!this.provider.recommend) {
      this.logRecommendationFailure("recommendation:provider-unavailable", new ServiceUnavailableException());
      throw new ServiceUnavailableException("El Mentor IA no está disponible en este momento.");
    }
    const recentMemory = await this.memory.recent(projectId, project.revision);
    const memory = selectRelevantMemory(recentMemory, question);
    this.logger.log("recommendation:memory-ok");
    let recommendation;
    try {
      this.logger.log("recommendation:provider-start");
      recommendation = await this.provider.recommend(context, VERIFIED_RECOMMENDATION_CONTEXT, question, memory);
    } catch (error) {
      if (error instanceof RecoverableRecommendationOutputError) {
        const fallback = buildVerifiedUmlRecommendation(context, question);
        if (!fallback) {
          this.logRecommendationFailure("recommendation:provider-error", error);
          throw new ServiceUnavailableException("El Mentor IA no está disponible en este momento.");
        }
        this.logger.log("recommendation:fallback-verified-uml");
        recommendation = fallback;
        this.logger.log("recommendation:fallback-uml-ok");
      } else if (error instanceof RecoverableTechnicalReferenceError) {
        this.logger.log("recommendation:retry-context");
        try {
          this.logger.log("recommendation:retry-provider-start");
          recommendation = await this.provider.recommend(context, VERIFIED_RECOMMENDATION_CONTEXT, question, memory, technicalRetryInstruction);
          this.logger.log("recommendation:retry-ok");
        } catch (retryError) {
          const architectureFallback = retryError instanceof RecoverableTechnicalReferenceError ? buildVerifiedArchitectureFallback(question) : undefined;
          const umlFallback = retryError instanceof RecoverableTechnicalReferenceError ? buildVerifiedUmlRecommendation(context, question) : undefined;
          const fallback = architectureFallback ?? umlFallback;
          if (fallback) {
            this.logger.log(umlFallback ? "recommendation:fallback-verified-uml" : "recommendation:fallback-verified-context");
            recommendation = fallback;
            this.logger.log(umlFallback ? "recommendation:fallback-uml-ok" : "recommendation:fallback-ok");
          } else {
          this.logRecommendationFailure("recommendation:retry-failed", retryError);
          throw new ServiceUnavailableException("El Mentor IA no está disponible en este momento.");
          }
        }
      } else {
        this.logRecommendationFailure("recommendation:provider-error", error);
        throw new ServiceUnavailableException("El Mentor IA no está disponible en este momento.");
      }
    }
    this.logger.log("recommendation:validation-ok");
    const limitations = memory.some((entry) => entry.isStale) ? `${recommendation.limitations}\n\n${staleMemoryNotice}` : recommendation.limitations;
    const response: MentorRecommendationResponse = { status: "READ_ONLY", ...recommendation, limitations, needsClarification: false, projectRevision: project.revision };
    this.logger.log("recommendation:recorder-start");
    await this.recorder.record({ ...identity, projectRevision: project.revision, question, answer: JSON.stringify(response), grounded: true });
    this.logger.log("recommendation:recorder-ok");
    return response;
  }

  private logRecommendationFailure(stage: string, error: unknown): void {
    const details = error instanceof ServiceUnavailableException
      ? { stage, errorName: error.name, errorCode: error.getStatus(), message: "Recommendation provider is unavailable." }
      : error instanceof RecoverableTechnicalReferenceError
        ? { stage, errorName: error.name, errorCode: "UNVERIFIED_TECHNOLOGY", message: error.message }
        : error instanceof RecoverableRecommendationOutputError
          ? { stage, errorName: error.name, errorCode: "INVALID_OUTPUT", message: error.message }
        : { stage, errorName: error instanceof Error ? error.name : typeof error, errorCode: "UNEXPECTED", message: "Unexpected recommendation provider failure." };
    this.logger.warn(JSON.stringify(details));
  }
}
