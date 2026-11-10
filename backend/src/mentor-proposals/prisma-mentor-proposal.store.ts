import { Inject, Injectable } from "@nestjs/common";
import type { MentorProposal as MentorProposalRow, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MentorProposalDataError, parseStoredMentorProposalCommand, parseStoredMentorProposalSummary } from "./mentor-proposal-stored-json";
import type {
  MarkMentorProposalAppliedInput,
  MentorProposalStore,
  MentorProposalTransitionResult,
  NewMentorProposal,
  RejectMentorProposalInput,
  StoredMentorProposal,
} from "./mentor-proposal-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maps a row to the domain record, re-validating the JSON and the status/resolution invariant on every read.
export function toStoredMentorProposal(row: MentorProposalRow): StoredMentorProposal {
  const base = {
    id: row.id,
    projectId: row.projectId,
    authorUserId: row.authorUserId,
    authorEmail: row.authorEmail,
    instruction: row.instruction,
    baseRevision: row.baseRevision,
    command: parseStoredMentorProposalCommand(row.command),
    summary: parseStoredMentorProposalSummary(row.summary),
    createdAt: row.createdAt,
  };
  switch (row.status) {
    case "PENDING":
      if (row.resolvedAt !== null || row.resolvedByUserId !== null || row.resultingRevision !== null) throw new MentorProposalDataError("resolution");
      return { ...base, status: "PENDING" };
    case "REJECTED":
      if (row.resolvedAt === null || row.resolvedByUserId === null || row.resultingRevision !== null) throw new MentorProposalDataError("resolution");
      return { ...base, status: "REJECTED", resolvedAt: row.resolvedAt, resolvedByUserId: row.resolvedByUserId };
    case "APPLIED":
      if (row.resolvedAt === null || row.resolvedByUserId === null || row.resultingRevision === null) throw new MentorProposalDataError("resolution");
      return { ...base, status: "APPLIED", resolvedAt: row.resolvedAt, resolvedByUserId: row.resolvedByUserId, resultingRevision: row.resultingRevision };
    default:
      throw new MentorProposalDataError("status");
  }
}

@Injectable()
export class PrismaMentorProposalStore implements MentorProposalStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(proposal: NewMentorProposal): Promise<StoredMentorProposal> {
    // Validated before writing too: an invalid command or summary is never persisted.
    const command = parseStoredMentorProposalCommand(proposal.command);
    const summary = parseStoredMentorProposalSummary(proposal.summary);
    const row = await this.prisma.mentorProposal.create({
      data: {
        id: proposal.id,
        projectId: proposal.projectId,
        authorUserId: proposal.authorUserId,
        authorEmail: proposal.authorEmail,
        instruction: proposal.instruction,
        baseRevision: proposal.baseRevision,
        status: "PENDING",
        command: command as unknown as Prisma.InputJsonValue,
        summary: summary as unknown as Prisma.InputJsonValue,
        createdAt: proposal.createdAt,
      },
    });
    return toStoredMentorProposal(row);
  }

  async findByProjectAndId(projectId: string, proposalId: string): Promise<StoredMentorProposal | undefined> {
    if (!UUID.test(projectId) || !UUID.test(proposalId)) return undefined;
    const row = await this.prisma.mentorProposal.findFirst({ where: { id: proposalId, projectId } });
    return row ? toStoredMentorProposal(row) : undefined;
  }

  reject(input: RejectMentorProposalInput): Promise<MentorProposalTransitionResult> {
    return this.resolvePending(input.projectId, input.proposalId, { status: "REJECTED", resolvedAt: input.resolvedAt, resolvedByUserId: input.resolvedByUserId });
  }

  markApplied(input: MarkMentorProposalAppliedInput): Promise<MentorProposalTransitionResult> {
    return this.resolvePending(input.projectId, input.proposalId, { status: "APPLIED", resolvedAt: input.resolvedAt, resolvedByUserId: input.resolvedByUserId, resultingRevision: input.resultingRevision });
  }

  // Single conditional UPDATE ... WHERE id AND projectId AND status = PENDING: concurrent transitions cannot both win.
  // Only status and resolution fields are written; command, summary, baseRevision, instruction and author never change.
  private async resolvePending(projectId: string, proposalId: string, data: Prisma.MentorProposalUncheckedUpdateManyInput): Promise<MentorProposalTransitionResult> {
    if (!UUID.test(projectId) || !UUID.test(proposalId)) return { ok: false, reason: "NOT_FOUND" };
    const updated = await this.prisma.mentorProposal.updateMany({ where: { id: proposalId, projectId, status: "PENDING" }, data });
    const row = await this.prisma.mentorProposal.findFirst({ where: { id: proposalId, projectId } });
    if (!row) return { ok: false, reason: "NOT_FOUND" };
    if (updated.count === 1) return { ok: true, proposal: toStoredMentorProposal(row) };
    if (row.status === "APPLIED") return { ok: false, reason: "PROPOSAL_ALREADY_APPLIED" };
    if (row.status === "REJECTED") return { ok: false, reason: "PROPOSAL_REJECTED" };
    throw new MentorProposalDataError("status");
  }
}
