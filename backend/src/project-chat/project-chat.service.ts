import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { MentorProposalGenerationUnavailableError } from "../mentor-proposals/local-qwen-mentor-proposal-intent.provider";
import { ProjectAccessService } from "../projects/project-access.service";
import { PROJECT_CHAT_BROADCASTER, type ProjectChatBroadcaster } from "../realtime/project-chat-broadcaster";
import {
  formatProjectChatProposalSummary,
  formatProjectChatRecommendation,
  PROJECT_CHAT_ACTION_PREFIXES,
  PROJECT_CHAT_CLOCK,
  PROJECT_CHAT_ID_FACTORY,
  PROJECT_CHAT_MENTOR,
  PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH,
  PROJECT_CHAT_NOTICES,
  PROJECT_CHAT_PROPOSALS,
  PROJECT_CHAT_STORE,
  toProjectChatPublicMessage,
  type ProjectChatError,
  type ProjectChatMentor,
  type ProjectChatPage,
  type ProjectChatProposals,
  type ProjectChatPublicMessage,
  type ProjectChatStore,
  type StoredProjectChatMessage,
} from "./project-chat.contracts";
import { encodeProjectChatCursor, parseMentorMention, parseProjectChatAction, parseProjectChatBody, parseProjectChatListQuery } from "./project-chat-input";

export type PostProjectChatResult =
  | Readonly<{ ok: true; message: ProjectChatPublicMessage; mentorReply?: Promise<void> }>
  | Readonly<{ ok: false; error: ProjectChatError }>;

export type ListProjectChatResult = Readonly<{ ok: true; page: ProjectChatPage }> | Readonly<{ ok: false; error: ProjectChatError }>;

// What a Mentor task publishes in reply to the human message; null publishes nothing.
type MentorOutcome = Readonly<{ kind: "MENTOR" | "NOTICE" | "PROPOSAL"; body: string; proposalId?: string }> | null;

// CU-2P-08. Every member (OWNER, EDITOR, VIEWER) reads and writes; access is checked with requireView (requireEdit for
// a UML proposal) before any read or write. Messages are broadcast only after they are persisted.
//
// The Mentor intervenes only when asked: a message that mentions @mentor (CU-2P-01 query) or an explicit action
// (CU-2P-05 recommendation, CU-2P-06 proposal). The human message is persisted, broadcast and returned at once; then
// the room sees THINKING, the result (a MENTOR answer, a PROPOSAL card or a safe NOTICE) and IDLE. The results are
// always published by the server, so a client can never post a Mentor answer or a proposal card itself.
@Injectable()
export class ProjectChatService {
  private readonly logger = new Logger(ProjectChatService.name);
  private readonly now: () => Date;
  private readonly uuid: () => string;

  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireView" | "requireEdit">,
    @Inject(PROJECT_CHAT_STORE) private readonly store: ProjectChatStore,
    @Inject(PROJECT_CHAT_BROADCASTER) private readonly broadcaster: ProjectChatBroadcaster,
    @Inject(PROJECT_CHAT_MENTOR) private readonly mentor: ProjectChatMentor,
    @Inject(PROJECT_CHAT_PROPOSALS) private readonly proposals: ProjectChatProposals,
    @Optional() @Inject(PROJECT_CHAT_CLOCK) clock?: () => Date,
    @Optional() @Inject(PROJECT_CHAT_ID_FACTORY) idFactory?: () => string,
  ) {
    this.now = clock ?? (() => new Date());
    this.uuid = idFactory ?? randomUUID;
  }

  async post(projectId: string, user: AuthenticatedUser, rawBody: unknown): Promise<PostProjectChatResult> {
    await this.access.requireView(projectId, user.id);
    const parsed = parseProjectChatBody(rawBody);
    if (!parsed.ok) return parsed;

    const mention = parseMentorMention(parsed.body);
    const stored = await this.publishHuman(projectId, user, parsed.body, mention.mentionsMentor);
    const message = toProjectChatPublicMessage(stored);
    if (!mention.mentionsMentor) return { ok: true, message };

    const question = mention.question;
    if (!question || question.length > PROJECT_CHAT_MENTOR_QUESTION_MAX_LENGTH) {
      return { ok: true, message, mentorReply: this.reply(stored, { kind: "NOTICE", body: PROJECT_CHAT_NOTICES.INVALID_QUESTION }) };
    }
    const mentorReply = this.runMentorTask(stored, async () => ({ kind: "MENTOR", body: (await this.mentor.query(projectId, user, question)).answer }));
    return { ok: true, message, mentorReply };
  }

  // Explicit actions: RECOMMENDATION (any member, CU-2P-05) and PROPOSAL (OWNER and EDITOR only, CU-2P-06: a VIEWER
  // gets 403 before anything is written). The proposal is created PENDING; nothing changes in the model until an
  // editor applies it through the CU-2P-06 apply route.
  async postAction(projectId: string, user: AuthenticatedUser, rawBody: unknown): Promise<PostProjectChatResult> {
    await this.access.requireView(projectId, user.id);
    const parsed = parseProjectChatAction(rawBody);
    if (!parsed.ok) return parsed;
    if (parsed.action === "PROPOSAL") await this.access.requireEdit(projectId, user.id);

    const stored = await this.publishHuman(projectId, user, `${PROJECT_CHAT_ACTION_PREFIXES[parsed.action]} ${parsed.text}`, true);
    const message = toProjectChatPublicMessage(stored);
    const text = parsed.text;

    const mentorReply = parsed.action === "RECOMMENDATION"
      ? this.runMentorTask(stored, async () => ({ kind: "MENTOR", body: formatProjectChatRecommendation(await this.mentor.recommend(projectId, user, { question: text })) }))
      : this.runMentorTask(stored, async () => {
        const created = await this.proposals.create(projectId, user, text);
        if (!created.ok) return { kind: "NOTICE", body: `No se pudo crear la propuesta UML: ${created.error.message}` };
        return { kind: "PROPOSAL", body: formatProjectChatProposalSummary(created.proposal.summary), proposalId: created.proposal.id };
      });
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

  private async publishHuman(projectId: string, user: AuthenticatedUser, body: string, mentionsMentor: boolean): Promise<StoredProjectChatMessage> {
    const stored = await this.store.create({
      id: this.uuid(),
      projectId,
      kind: "USER",
      authorUserId: user.id,
      authorEmail: user.email,
      body,
      mentionsMentor,
      replyToId: null,
      proposalId: null,
      createdAt: this.now(),
    });
    this.broadcaster.broadcastChatMessage(projectId, toProjectChatPublicMessage(stored));
    return stored;
  }

  // Never rejects: every outcome is a message in the chat or a log line. THINKING and IDLE frame the task.
  private async runMentorTask(question: StoredProjectChatMessage, task: () => Promise<MentorOutcome>): Promise<void> {
    const projectId = question.projectId;
    this.broadcaster.broadcastChatMentorState(projectId, question.id, "THINKING");
    try {
      await this.reply(question, await task());
    } catch (error) {
      await this.reply(question, this.outcomeOfFailure(error));
    } finally {
      this.broadcaster.broadcastChatMentorState(projectId, question.id, "IDLE");
    }
  }

  private outcomeOfFailure(error: unknown): MentorOutcome {
    if (error instanceof NotFoundException) {
      // The author lost access while the Mentor was working: nothing is published.
      this.logFailure("access-lost");
      return null;
    }
    if (error instanceof ServiceUnavailableException || error instanceof MentorProposalGenerationUnavailableError) return { kind: "NOTICE", body: PROJECT_CHAT_NOTICES.MENTOR_UNAVAILABLE };
    if (error instanceof BadRequestException) return { kind: "NOTICE", body: PROJECT_CHAT_NOTICES.INVALID_QUESTION };
    if (error instanceof ForbiddenException) return { kind: "NOTICE", body: PROJECT_CHAT_NOTICES.PROPOSAL_FORBIDDEN };
    this.logFailure("unexpected");
    return { kind: "NOTICE", body: PROJECT_CHAT_NOTICES.MENTOR_FAILED };
  }

  private async reply(question: StoredProjectChatMessage, outcome: MentorOutcome): Promise<void> {
    if (!outcome) return;
    try {
      const stored = await this.store.create({
        id: this.uuid(),
        projectId: question.projectId,
        kind: outcome.kind,
        authorUserId: null,
        authorEmail: null,
        body: outcome.body,
        mentionsMentor: false,
        replyToId: question.id,
        proposalId: outcome.proposalId ?? null,
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
