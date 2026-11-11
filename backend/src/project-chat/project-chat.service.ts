import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import { PROJECT_CHAT_BROADCASTER, type ProjectChatBroadcaster } from "../realtime/project-chat-broadcaster";
import {
  PROJECT_CHAT_CLOCK,
  PROJECT_CHAT_ID_FACTORY,
  PROJECT_CHAT_MENTOR,
  PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH,
  PROJECT_CHAT_NOTICES,
  PROJECT_CHAT_STORE,
  toProjectChatPublicMessage,
  type ProjectChatError,
  type ProjectChatMentor,
  type ProjectChatPage,
  type ProjectChatPublicMessage,
  type ProjectChatStore,
  type StoredProjectChatMessage,
} from "./project-chat.contracts";
import { encodeProjectChatCursor, parseMentorMention, parseProjectChatBody, parseProjectChatListQuery } from "./project-chat-input";

export type PostProjectChatResult =
  | Readonly<{ ok: true; message: ProjectChatPublicMessage; mentorReply?: Promise<void> }>
  | Readonly<{ ok: false; error: ProjectChatError }>;

export type ListProjectChatResult = Readonly<{ ok: true; page: ProjectChatPage }> | Readonly<{ ok: false; error: ProjectChatError }>;

// CU-2P-08. Every member (OWNER, EDITOR, VIEWER) reads and writes; access is checked with requireView before any read
// or write (404 without access). Messages are broadcast only after they are persisted.
//
// A message that mentions @mentor is answered asynchronously: the human message is persisted, broadcast and returned
// at once; then the room sees THINKING, the Mentor answer (MentorService.query: same context, memory and recorder as
// CU-2P-01/03, no new prompt) or a safe NOTICE, and IDLE. The model is never invoked without a mention.
@Injectable()
export class ProjectChatService {
  private readonly logger = new Logger(ProjectChatService.name);
  private readonly now: () => Date;

  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireView">,
    @Inject(PROJECT_CHAT_STORE) private readonly store: ProjectChatStore,
    @Inject(PROJECT_CHAT_BROADCASTER) private readonly broadcaster: ProjectChatBroadcaster,
    @Inject(PROJECT_CHAT_MENTOR) private readonly mentor: ProjectChatMentor,
    @Optional() @Inject(PROJECT_CHAT_CLOCK) clock?: () => Date,
    @Optional() @Inject(PROJECT_CHAT_ID_FACTORY) idFactory?: () => string,
  ) {
    this.now = clock ?? (() => new Date());
    this.uuid = idFactory ?? randomUUID;
  }

  private readonly uuid: () => string;

  async post(projectId: string, user: AuthenticatedUser, rawBody: unknown): Promise<PostProjectChatResult> {
    await this.access.requireView(projectId, user.id);
    const parsed = parseProjectChatBody(rawBody);
    if (!parsed.ok) return parsed;

    const mention = parseMentorMention(parsed.body);
    const stored = await this.store.create({
      id: this.uuid(),
      projectId,
      kind: "USER",
      authorUserId: user.id,
      authorEmail: user.email,
      body: parsed.body,
      mentionsMentor: mention.mentionsMentor,
      replyToId: null,
      proposalId: null,
      createdAt: this.now(),
    });
    const message = toProjectChatPublicMessage(stored);
    this.broadcaster.broadcastChatMessage(projectId, message);

    if (!mention.mentionsMentor) return { ok: true, message };
    const mentorReply = this.answerMention(stored, user, mention.question);
    return { ok: true, message, mentorReply };
  }

  async list(projectId: string, user: AuthenticatedUser, rawQuery: unknown): Promise<ListProjectChatResult> {
    await this.access.requireView(projectId, user.id);
    const parsed = parseProjectChatListQuery(rawQuery);
    if (!parsed.ok) return parsed;
    const { limit, cursor } = parsed.query;
    const rows = await this.store.list(projectId, limit + 1, cursor);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const nextCursor = rows.length > limit && last ? encodeProjectChatCursor({ createdAt: last.createdAt, id: last.id }) : null;
    return { ok: true, page: { items: items.map(toProjectChatPublicMessage), nextCursor } };
  }

  // Never rejects: every outcome is a message in the chat or a log line.
  private async answerMention(question: StoredProjectChatMessage, user: AuthenticatedUser, text: string): Promise<void> {
    const projectId = question.projectId;
    if (!text || text.length > PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH) {
      await this.reply(question, "NOTICE", PROJECT_CHAT_NOTICES.INVALID_QUESTION);
      return;
    }
    this.broadcaster.broadcastChatMentorState(projectId, question.id, "THINKING");
    try {
      const response = await this.mentor.query(projectId, user, text);
      await this.reply(question, "MENTOR", response.answer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        // The author lost access while the Mentor was answering: nothing is published.
        this.logFailure("access-lost");
      } else if (error instanceof ServiceUnavailableException) {
        await this.reply(question, "NOTICE", PROJECT_CHAT_NOTICES.MENTOR_UNAVAILABLE);
      } else if (error instanceof BadRequestException) {
        await this.reply(question, "NOTICE", PROJECT_CHAT_NOTICES.INVALID_QUESTION);
      } else {
        this.logFailure("unexpected");
        await this.reply(question, "NOTICE", PROJECT_CHAT_NOTICES.MENTOR_FAILED);
      }
    } finally {
      this.broadcaster.broadcastChatMentorState(projectId, question.id, "IDLE");
    }
  }

  private async reply(question: StoredProjectChatMessage, kind: "MENTOR" | "NOTICE", body: string): Promise<void> {
    try {
      const stored = await this.store.create({
        id: this.uuid(),
        projectId: question.projectId,
        kind,
        authorUserId: null,
        authorEmail: null,
        body,
        mentionsMentor: false,
        replyToId: question.id,
        proposalId: null,
        createdAt: this.now(),
      });
      this.broadcaster.broadcastChatMessage(question.projectId, toProjectChatPublicMessage(stored));
    } catch {
      this.logFailure("reply-persistence");
    }
  }

  // Stage only: never the message, the question, the answer or the user.
  private logFailure(stage: string): void {
    this.logger.warn(JSON.stringify({ stage: `project-chat:mentor-${stage}` }));
  }
}
