// CU-2P-08: realtime delivery of the project chat through the existing project room (`project:<id>`).
// The public message shape lives here so that the chat module depends on realtime, never the other way around.

export const PROJECT_CHAT_BROADCASTER = Symbol("PROJECT_CHAT_BROADCASTER");

export const PROJECT_CHAT_MESSAGE_KINDS = ["USER", "MENTOR", "NOTICE", "PROPOSAL"] as const;
export type ProjectChatMessageKind = (typeof PROJECT_CHAT_MESSAGE_KINDS)[number];

// Public message: no user ids, roles, project id, prompts or model metadata. `author` is null for the Mentor and notices.
export type ProjectChatPublicMessage = Readonly<{
  id: string;
  kind: ProjectChatMessageKind;
  author: Readonly<{ email: string }> | null;
  body: string;
  replyToId: string | null;
  proposalId: string | null;
  createdAt: string;
}>;

export type ProjectChatMentorState = "THINKING" | "IDLE";

export type ProjectChatMessageEvent = Readonly<{ projectId: string; message: ProjectChatPublicMessage }>;
export type ProjectChatMentorEvent = Readonly<{ projectId: string; replyToId: string; state: ProjectChatMentorState }>;

// Implemented by ProjectRealtimeGateway. Callers emit only after the message is persisted.
export interface ProjectChatBroadcaster {
  broadcastChatMessage(projectId: string, message: ProjectChatPublicMessage): void;
  broadcastChatMentorState(projectId: string, replyToId: string, state: ProjectChatMentorState): void;
}
