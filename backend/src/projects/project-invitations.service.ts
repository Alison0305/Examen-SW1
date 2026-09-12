import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { Prisma, ProjectInvitationStatus, type ProjectMemberRole } from "@prisma/client";
import { normalizeEmail } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const invitationSelect = {
  id: true,
  projectId: true,
  invitedById: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  resolvedAt: true,
} as const;

@Injectable()
export class ProjectInvitationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(projectId: string) {
    return this.prisma.projectInvitation.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: invitationSelect,
    });
  }

  async create(projectId: string, invitedById: string, email: string, role: ProjectMemberRole) {
    const normalizedEmail = normalizeEmail(email);
    await this.ensureNotProjectParticipant(projectId, normalizedEmail);

    const existing = await this.prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: normalizedEmail } },
    });
    const now = new Date();
    if (existing?.status === ProjectInvitationStatus.PENDING && existing.expiresAt > now) {
      throw new ConflictException();
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hash(token);
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    try {
      const invitation = existing
        ? await this.prisma.projectInvitation.update({
            where: { id: existing.id },
            data: { invitedById, role, tokenHash, status: ProjectInvitationStatus.PENDING, expiresAt, resolvedAt: null },
            select: invitationSelect,
          })
        : await this.prisma.projectInvitation.create({
            data: { projectId, invitedById, email: normalizedEmail, role, tokenHash, expiresAt },
            select: invitationSelect,
          });
      return { ...invitation, token };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException();
      throw error;
    }
  }

  async revoke(projectId: string, invitationId: string) {
    const result = await this.prisma.projectInvitation.updateMany({
      where: { id: invitationId, projectId, status: ProjectInvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      data: { status: ProjectInvitationStatus.REVOKED, resolvedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException();
  }

  async get(token: string, email: string) {
    const invitation = await this.findActive(token, email);
    return this.publicInvitation(invitation);
  }

  async accept(token: string, userId: string, email: string) {
    return this.resolve(token, userId, email, ProjectInvitationStatus.ACCEPTED);
  }

  async reject(token: string, userId: string, email: string) {
    return this.resolve(token, userId, email, ProjectInvitationStatus.REJECTED);
  }

  private async resolve(token: string, userId: string, email: string, status: "ACCEPTED" | "REJECTED") {
    const tokenHash = this.hash(token);
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.projectInvitation.findUnique({ where: { tokenHash }, select: { id: true } });
      if (!candidate) throw new NotFoundException();

      // Serialize resolution so a second concurrent request observes the resolved state.
      await tx.$queryRaw`SELECT 1 FROM "ProjectInvitation" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`;
      const invitation = await tx.projectInvitation.findUnique({
        where: { id: candidate.id },
        include: { project: { select: { ownerId: true } } },
      });
      if (!invitation || !this.isActiveForEmail(invitation, email) || invitation.project.ownerId === userId) throw new NotFoundException();

      const membership = await tx.projectMembership.findUnique({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        select: { userId: true },
      });
      if (membership) throw new NotFoundException();

      if (status === ProjectInvitationStatus.ACCEPTED) {
        await tx.projectMembership.upsert({
          where: { projectId_userId: { projectId: invitation.projectId, userId } },
          create: { projectId: invitation.projectId, userId, role: invitation.role },
          update: { role: invitation.role },
        });
      }
      const resolvedAt = new Date();
      const resolved = await tx.projectInvitation.update({
        where: { id: invitation.id },
        data: { status, resolvedAt },
        select: invitationSelect,
      });
      return this.publicInvitation(resolved);
    });
  }

  private async findActive(token: string, email: string) {
    const invitation = await this.prisma.projectInvitation.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { project: { select: { ownerId: true } } },
    });
    if (!invitation || !this.isActiveForEmail(invitation, email)) throw new NotFoundException();
    return invitation;
  }

  private isActiveForEmail(invitation: { email: string; status: ProjectInvitationStatus; expiresAt: Date }, email: string) {
    return invitation.status === ProjectInvitationStatus.PENDING && invitation.expiresAt > new Date() && invitation.email === normalizeEmail(email);
  }

  private async ensureNotProjectParticipant(projectId: string, email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
    const membership = await this.prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { userId: true } });
    if (project?.ownerId === user.id || membership) throw new ConflictException();
  }

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private publicInvitation(invitation: Prisma.ProjectInvitationGetPayload<{ select: typeof invitationSelect }>) {
    return {
      id: invitation.id,
      projectId: invitation.projectId,
      invitedById: invitation.invitedById,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      resolvedAt: invitation.resolvedAt,
    };
  }
}
