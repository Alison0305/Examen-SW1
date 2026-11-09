import { Inject, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import { ProjectAccessService } from "../projects/project-access.service";
import { InvalidProjectDocumentError, ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { UML_ANALYSIS_AI_PROVIDER, type UmlAnalysisAiProvider } from "./uml-analysis-ai.contracts";
import { buildUmlAnalysisContext, type UmlAnalysisContext } from "./uml-analysis-context";
import type { UmlAnalysisErrorCode, UmlAnalysisFocus } from "./uml-analysis-fragment";
import { buildUmlAnalysisPrompt, type ContextTruncation } from "./uml-analysis-prompt";

// CU-2P-04, fase 4.4: application service of the UML analysis. It orchestrates authorization, project loading, the
// deterministic context, the compact prompt and the AI provider. It adds no UML or relational rule of its own and
// never writes: the analyzed model is the persisted one, read only.

// ---------------------------------------------------------------------------------------------
// Dependencies: the smallest surface the service needs. ProjectAccessService and ProjectsPersistenceService satisfy
// them structurally; with no update/save method in the type, the service cannot persist anything.

export type UmlAnalysisProjectAccess = Readonly<{
  requireView(projectId: string, userId: string): Promise<unknown>;
}>;

export type UmlAnalysisProjectReader = Readonly<{
  findProject(id: string): Promise<Readonly<{ revision: number; document: ProjectDocument }> | null>;
}>;

// ---------------------------------------------------------------------------------------------
// Response

// Public, stable diagnostics: CLASS_NOT_FOUND and RELATIONSHIP_NOT_FOUND are both ELEMENT_NOT_FOUND.
export type UmlAnalysisDiagnostic = "EMPTY_MODEL" | "ELEMENT_NOT_FOUND" | "INVALID_FOCUS_ID" | "INCONSISTENT_REFERENCE" | "CONTEXT_TOO_LARGE";

export type UmlAnalysisResponseFocus = Readonly<{
  kind: UmlAnalysisFocus["kind"];
  id?: string;
  // Display name of the analyzed element; for an unnamed relationship it is built from its ends, never stored.
  name?: string;
}>;

// Deterministic facts, diagnostics, conflicts and limitations, exactly as the context produced them.
export type UmlAnalysisResult = Pick<UmlAnalysisContext, "facts" | "diagnostics" | "conflicts" | "limitations" | "summary">;

// Generated text, kept apart from the deterministic result.
export type UmlAnalysisExplanation = Readonly<{ text: string; contextTruncation: ContextTruncation }>;

export type UmlAnalysisResponse = Readonly<{
  projectRevision: number;
  focus: UmlAnalysisResponseFocus;
  analysis: UmlAnalysisResult | null;
  explanation: UmlAnalysisExplanation | null;
  diagnostic?: UmlAnalysisDiagnostic;
}>;

const FOCUS_DIAGNOSTICS: Readonly<Record<UmlAnalysisErrorCode, UmlAnalysisDiagnostic>> = {
  EMPTY_MODEL: "EMPTY_MODEL",
  CLASS_NOT_FOUND: "ELEMENT_NOT_FOUND",
  RELATIONSHIP_NOT_FOUND: "ELEMENT_NOT_FOUND",
  INVALID_FOCUS_ID: "INVALID_FOCUS_ID",
  INCONSISTENT_REFERENCE: "INCONSISTENT_REFERENCE",
};

// Same wording as the CU-2P-01 mentor: no cause, path, model file or stack reaches the client.
const AI_UNAVAILABLE = "El Mentor IA no está disponible en este momento.";

// ---------------------------------------------------------------------------------------------
// Service

@Injectable()
export class UmlAnalysisService {
  constructor(
    @Inject(ProjectAccessService) private readonly access: UmlAnalysisProjectAccess,
    @Inject(ProjectsPersistenceService) private readonly projects: UmlAnalysisProjectReader,
    @Inject(UML_ANALYSIS_AI_PROVIDER) private readonly provider: UmlAnalysisAiProvider,
  ) {}

  /**
   * Analiza un elemento del modelo UML persistido de un proyecto que el usuario puede ver (OWNER, EDITOR o VIEWER).
   *
   * Orden: `requireView` → `findProject` → contexto determinista → prompt compacto → proveedor de IA (una vez).
   * - Sin acceso o proyecto inexistente: `NotFoundException` (misma política que el resto del backend).
   * - Documento persistido inválido: `UnprocessableEntityException`.
   * - Foco no analizable (modelo vacío, elemento inexistente, ID inválido, referencia inconsistente): respuesta con
   *   `diagnostic`, `analysis: null` y `explanation: null`; la IA no se ejecuta.
   * - Hechos obligatorios que no caben en el contexto del modelo: `analysis` disponible, `explanation: null` y
   *   `CONTEXT_TOO_LARGE`; la IA no se ejecuta.
   * - Fallo del proveedor: `ServiceUnavailableException` con un mensaje fijo, sin detalles internos.
   * Nunca modifica ni persiste el proyecto; `projectRevision` es la revisión cargada.
   */
  async analyze(projectId: string, userId: string, focus: UmlAnalysisFocus): Promise<UmlAnalysisResponse> {
    await this.access.requireView(projectId, userId);
    let project;
    try {
      project = await this.projects.findProject(projectId);
    } catch (error) {
      if (error instanceof InvalidProjectDocumentError) throw new UnprocessableEntityException("El modelo del proyecto no es válido para analizarlo.");
      throw error;
    }
    if (!project) throw new NotFoundException();
    const projectRevision = project.revision;

    const contextResult = buildUmlAnalysisContext(project.document.uml, focus);
    if (!contextResult.ok) {
      return { projectRevision, focus: requestedFocus(focus), analysis: null, explanation: null, diagnostic: FOCUS_DIAGNOSTICS[contextResult.error.code] };
    }
    const context = contextResult.context;
    const analysis: UmlAnalysisResult = { facts: context.facts, diagnostics: context.diagnostics, conflicts: context.conflicts, limitations: context.limitations, summary: context.summary };
    const responseFocus = analyzedFocus(context);

    const prompt = buildUmlAnalysisPrompt(context);
    if (prompt.status === "too-large") {
      return { projectRevision, focus: responseFocus, analysis, explanation: null, diagnostic: "CONTEXT_TOO_LARGE" };
    }

    let text: string;
    try {
      ({ text } = await this.provider.explain({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt }));
    } catch (error) {
      // The cause stays on the exception for server-side diagnosis; Nest does not serialize it into the body.
      // `description` keeps the body identical to CU-2P-01: { statusCode: 503, error: "Service Unavailable", message }.
      throw new ServiceUnavailableException(AI_UNAVAILABLE, { cause: error, description: "Service Unavailable" });
    }
    return { projectRevision, focus: responseFocus, analysis, explanation: { text, contextTruncation: prompt.contextTruncation } };
  }
}

// ---------------------------------------------------------------------------------------------
// Focus of the response

// When the element could not be analyzed, only what was requested is echoed: no name is looked up or guessed.
function requestedFocus(focus: UmlAnalysisFocus): UmlAnalysisResponseFocus {
  return focus.kind === "model" ? { kind: "model" } : { kind: focus.kind, id: focus.id };
}

function analyzedFocus(context: UmlAnalysisContext): UmlAnalysisResponseFocus {
  const focus = context.focus;
  if (focus.kind === "model") return { kind: "model" };
  const uml = context.facts.uml;
  if (focus.kind === "class") {
    const umlClass = uml.classes.find((entry) => entry.id === focus.id);
    return umlClass ? { kind: "class", id: focus.id, name: umlClass.name } : { kind: "class", id: focus.id };
  }
  const relationship = uml.relationships.find((entry) => entry.id === focus.id);
  if (!relationship) return { kind: "relationship", id: focus.id };
  if (relationship.name) return { kind: "relationship", id: focus.id, name: relationship.name };
  // Presentation only: built from the ends of the fragment, never written to the model.
  const source = relationship.source.elementName ?? relationship.source.elementId;
  const target = relationship.target.elementName ?? relationship.target.elementId;
  return { kind: "relationship", id: focus.id, name: relationship.type === "Generalization" ? `${source} → ${target}` : `${source} — ${target}` };
}
