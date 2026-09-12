import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ProjectMemberRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const ProjectAccessRole = {
  OWNER: "OWNER",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  NONE: "NONE",
} as const;

export type ProjectAccessRole = (typeof ProjectAccessRole)[keyof typeof ProjectAccessRole];

@Injectable()
export class ProjectAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(projectId: string, userId: string): Promise<ProjectAccessRole> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, memberships: { where: { userId }, select: { role: true } } },
    });
    if (!project) return ProjectAccessRole.NONE;
    if (project.ownerId === userId) return ProjectAccessRole.OWNER;
    return project.memberships[0]?.role === ProjectMemberRole.EDITOR ? ProjectAccessRole.EDITOR
      : project.memberships[0]?.role === ProjectMemberRole.VIEWER ? ProjectAccessRole.VIEWER
      : ProjectAccessRole.NONE;
  }

  async requireView(projectId: string, userId: string): Promise<Exclude<ProjectAccessRole, "NONE">> {
    const role = await this.resolve(projectId, userId);
    if (role === ProjectAccessRole.NONE) throw new NotFoundException();
    return role;
  }

  async requireEdit(projectId: string, userId: string): Promise<"OWNER" | "EDITOR"> {
    const role = await this.requireView(projectId, userId);
    if (role === ProjectAccessRole.VIEWER) throw new ForbiddenException();
    return role;
  }

  async requireOwner(projectId: string, userId: string): Promise<"OWNER"> {
    const role = await this.requireView(projectId, userId);
    if (role !== ProjectAccessRole.OWNER) throw new ForbiddenException();
    return role;
  }
}
