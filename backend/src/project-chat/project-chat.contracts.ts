import type { ProjectChatMessageKind, ProjectChatPublicMessage } from "../realtime/project-chat-broadcaster";

export type { ProjectChatMessageKind, ProjectChatPublicMessage } from "../realtime/project-chat-broadcaster";

// CU-2P-08 (issue #17): shared project chat with Mentor IA intervention by mention.

export const PROJECT_CHAT_BODY_MAX_LENGTH = 2000;
export const PROJECT_CHAT_DEFAULT_LIMIT = 30;
export const PROJECT_CHAT_MAX_LIMIT = 50;
// Same bound as POST /projects/:id/mentor/query (CU-2P-01).
export const PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH = 500;

export const PROJECT_CHAT_STORE = Symbol("PROJECT_CHAT_STORE");
export const PROJECT_CHAT_MENTOR = Symbol("PROJECT_CHAT_MENTOR");
export const PROJECT_CHAT_CLOCK = Symbol("PROJECT_CHAT_CLOCK");
export const PROJECT_CHAT_ID_FACTORY = Symbol("PROJECT_CHAT_ID_FACTORY");

// Persisted message (internal). Only USER messages have an author (CHECK constraint in the migration).
export type StoredProjectChatMessage = Readonly<{
  id: string;
  projectId: string;
  kind: ProjectChatMessageKind;
  authorUserId: string | null;
  authorEmail: string | null;
  body: string;
  mentionsMentor: boolean;
  replyToId: string | null;
  proposalId: string | null;
  createdAt: Date;
}>;

export type NewProjectChatMessage = StoredProjectChatMessage;

export type ProjectChatCursor = Readonly<{ createdAt: Date; id: string }>;

export interface ProjectChatStore {
  create(message: NewProjectChatMessage): Promise<StoredProjectChatMessage>;
  // Newest first (createdAt DESC, id DESC), strictly after the cursor; at most `take` rows. Always filtered by project.
  list(projectId: string, take: number, cursor?: ProjectChatCursor): Promise<readonly StoredProjectChatMessage[]>;
}

// The part of MentorService used by the chat: CU-2P-01 query (context, memory, Qwen and recorder) and CU-2P-05
// technical recommendation. Both keep their own authorization and recording.
export type ProjectChatRecommendation = Readonly<{
  problem: string;
  alternatives: readonly string[];
  rationale: string;
  limitations: string;
  needsClarification: boolean;
  requiresUmlChange: boolean;
}>;

export interface ProjectChatMentor {
  query(projectId: string, user: Readonly<{ id: string; email: string }>, question: string): Promise<Readonly<{ answer: string }>>;
  recommend(projectId: string, user: Readonly<{ id: string; email: string }>, request: Readonly<{ question: string }>): Promise<ProjectChatRecommendation>;
}

// The part of CU-2P-06 used by the chat: creating a PENDING proposal (requireEdit, Qwen intent, resolver, preview).
export type ProjectChatProposalResult =
  | Readonly<{ ok: true; proposal: Readonly<{ id: string; summary: readonly Readonly<{ kind: "added" | "removed" | "changed"; label: string }>[] }> }>
  | Readonly<{ ok: false; error: Readonly<{ code: string; message: string }> }>;

export interface ProjectChatProposals {
  create(projectId: string, user: Readonly<{ id: string; email: string }>, instruction: string): Promise<ProjectChatProposalResult>;
}

export const PROJECT_CHAT_PROPOSALS = Symbol("PROJECT_CHAT_PROPOSALS");

// Explicit Mentor actions published in the chat (CU-2P-05 and CU-2P-06). Same text bound as their own endpoints.
export const PROJECT_CHAT_ACTIONS = ["RECOMMENDATION", "PROPOSAL"] as const;
export type ProjectChatAction = (typeof PROJECT_CHAT_ACTIONS)[number];
export const PROJECT_CHAT_ACTION_TEXT_MAX_LENGTH = 500;

export type ProjectChatPage = Readonly<{ items: readonly ProjectChatPublicMessage[]; nextCursor: string | null }>;

export type ProjectChatErrorCode = "INVALID_BODY" | "INVALID_ACTION" | "INVALID_LIMIT" | "INVALID_CURSOR" | "UNKNOWN_PARAMETER";
export type ProjectChatError = Readonly<{ code: ProjectChatErrorCode; message: string }>;

// Safe texts of the notices the chat posts when the Mentor cannot answer. No model path, prompt or stack trace.
export const PROJECT_CHAT_NOTICES = {
  MENTOR_UNAVAILABLE: "El Mentor IA no está disponible o está ocupado en este momento. Vuelve a mencionarlo en unos segundos.",
  INVALID_QUESTION: `Escribe una pregunta de hasta ${PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH} caracteres después de @mentor.`,
  MENTOR_FAILED: "No fue posible obtener la respuesta del Mentor IA.",
  PROPOSAL_FORBIDDEN: "Ya no tienes permiso de edición para proponer cambios UML en este proyecto.",
} as const;

// Public prefixes of the human message that starts an explicit action, so everyone reads what was asked.
export const PROJECT_CHAT_ACTION_PREFIXES: Readonly<Record<ProjectChatAction, string>> = {
  RECOMMENDATION: "Recomendación técnica:",
  PROPOSAL: "Propuesta de cambio UML:",
};

// Readable text of a CU-2P-05 recommendation; internal fields (confidence, revision, status) never appear.
export function formatProjectChatRecommendation(recommendation: ProjectChatRecommendation): string {
  const sections = [`Problema:\n${recommendation.problem}`];
  if (recommendation.alternatives.length > 0) sections.push(`Alternativas:\n${recommendation.alternatives.map((alternative) => `- ${alternative}`).join("\n")}`);
  sections.push(`Razón:\n${recommendation.rationale}`, `Limitaciones:\n${recommendation.limitations}`);
  if (recommendation.needsClarification) sections.push("Se necesita aclaración: aporta el contexto solicitado antes de continuar.");
  else if (recommendation.requiresUmlChange) sections.push("Implica un cambio UML: puedes pedir «Proponer cambio UML».");
  return sections.join("\n\n");
}

const DIFF_PREFIX = { added: "+", removed: "−", changed: "~" } as const;

// Body of a PROPOSAL message: the deterministic diff of CU-2P-06, one line per change. No ids, command or instruction.
export function formatProjectChatProposalSummary(summary: readonly Readonly<{ kind: "added" | "removed" | "changed"; label: string }>[]): string {
  return summary.map((line) => `${DIFF_PREFIX[line.kind]} ${line.label}`).join("\n");
}

export function toProjectChatPublicMessage(message: StoredProjectChatMessage): ProjectChatPublicMessage {
  return {
    id: message.id,
    kind: message.kind,
    author: message.kind === "USER" && message.authorEmail ? { email: message.authorEmail } : null,
    body: message.body,
    replyToId: message.replyToId,
    proposalId: message.proposalId,
    createdAt: message.createdAt.toISOString(),
  };
}
