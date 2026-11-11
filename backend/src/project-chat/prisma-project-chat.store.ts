import { Inject, Injectable } from "@nestjs/common";
import type { ProjectChatMessage as ProjectChatMessageRow } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { NewProjectChatMessage, ProjectChatCursor, ProjectChatStore, StoredProjectChatMessage } from "./project-chat.contracts";

function toStored(row: ProjectChatMessageRow): StoredProjectChatMessage {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    authorUserId: row.authorUserId,
    authorEmail: row.authorEmail,
    body: row.body,
    mentionsMentor: row.mentionsMentor,
    replyToId: row.replyToId,
    proposalId: row.proposalId,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaProjectChatStore implements ProjectChatStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(message: NewProjectChatMessage): Promise<StoredProjectChatMessage> {
    const row = await this.prisma.projectChatMessage.create({
      data: {
        id: message.id,
        projectId: message.projectId,
        kind: message.kind,
        authorUserId: message.authorUserId,
        authorEmail: message.authorEmail,
        body: message.body,
        mentionsMentor: message.mentionsMentor,
        replyToId: message.replyToId,
        proposalId: message.proposalId,
        createdAt: message.createdAt,
      },
    });
    return toStored(row);
  }

  // Keyset on (createdAt DESC, id DESC): rows strictly older than the cursor, or same instant with a smaller id.
  async list(projectId: string, take: number, cursor?: ProjectChatCursor): Promise<readonly StoredProjectChatMessage[]> {
    const rows = await this.prisma.projectChatMessage.findMany({
      where: {
        projectId,
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return rows.map(toStored);
  }
}
