import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { MentorInteractionIdentityResolver } from "../mentor-identity/mentor-interaction-identity.resolver";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { MentorContextBuilder } from "./mentor-context.builder";
import { MENTOR_AI_PROVIDER, MENTOR_INTERACTION_MEMORY, MENTOR_INTERACTION_RECORDER, type MentorAiProvider, type MentorInteractionMemory, type MentorInteractionRecorder, type MentorQueryResponse } from "./mentor.contracts";

const explicitElement = /\b(?:clase|class)(?:\s+(?:la|el))?\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)/i;
const staleMemoryNotice = "Nota: esta recomendación proviene de una revisión anterior del modelo UML y podría estar desactualizada respecto al modelo actual.";

@Injectable()
export class MentorService {
  constructor(
    @Inject(MentorInteractionIdentityResolver) private readonly identities: MentorInteractionIdentityResolver,
    @Inject(ProjectsPersistenceService) private readonly projects: ProjectsPersistenceService,
    @Inject(MentorContextBuilder) private readonly contexts: MentorContextBuilder,
    @Inject(MENTOR_AI_PROVIDER) private readonly provider: MentorAiProvider,
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
}
