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

// The part of MentorService used by the chat (CU-2P-01 query: context, memory, Qwen and recorder).
export interface ProjectChatMentor {
  query(projectId: string, user: Readonly<{ id: string; email: string }>, question: string): Promise<Readonly<{ answer: string }>>;
}

export type ProjectChatPage = Readonly<{ items: readonly ProjectChatPublicMessage[]; nextCursor: string | null }>;

export type ProjectChatErrorCode = "INVALID_BODY" | "INVALID_LIMIT" | "INVALID_CURSOR" | "UNKNOWN_PARAMETER";
export type ProjectChatError = Readonly<{ code: ProjectChatErrorCode; message: string }>;

// Safe texts of the notices the chat posts when the Mentor cannot answer. No model path, prompt or stack trace.
export const PROJECT_CHAT_NOTICES = {
  MENTOR_UNAVAILABLE: "El Mentor IA no está disponible o está ocupado en este momento. Vuelve a mencionarlo en unos segundos.",
  INVALID_QUESTION: `Escribe una pregunta de hasta ${PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH} caracteres después de @mentor.`,
  MENTOR_FAILED: "No fue posible obtener la respuesta del Mentor IA.",
} as const;

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
