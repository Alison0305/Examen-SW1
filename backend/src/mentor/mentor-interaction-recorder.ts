import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { MentorInteractionMemory, MentorInteractionRecorder, MentorMemory } from "./mentor.contracts";

@Injectable()
export class PrismaMentorInteractionRecorder implements MentorInteractionRecorder {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(interaction: Parameters<MentorInteractionRecorder["record"]>[0]): Promise<void> {
    await this.prisma.mentorInteraction.create({ data: { projectId: interaction.projectId, userId: interaction.userId, authorEmail: interaction.author.email, accessRole: interaction.accessRole, occurredAt: interaction.occurredAt, projectRevision: interaction.projectRevision, question: interaction.question, answer: interaction.answer, grounded: interaction.grounded } });
  }
}

export const MENTOR_MEMORY_MAX_INTERACTIONS = 6;
export const MENTOR_MEMORY_MAX_ENTRY_CHARS = 1200;
export const MENTOR_MEMORY_MAX_CHARS = 6000;

@Injectable()
export class PrismaMentorInteractionMemory implements MentorInteractionMemory {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recent(projectId: string, currentRevision: number): Promise<MentorMemory> {
    const rows = await this.prisma.mentorInteraction.findMany({ where: { projectId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: MENTOR_MEMORY_MAX_INTERACTIONS });
    let used = 0;
    const selected = [] as MentorMemory[number][];
    for (const row of rows) {
      const question = row.question.slice(0, MENTOR_MEMORY_MAX_ENTRY_CHARS);
      const answer = row.answer.slice(0, MENTOR_MEMORY_MAX_ENTRY_CHARS);
      const size = question.length + answer.length;
      if (used + size > MENTOR_MEMORY_MAX_CHARS) continue;
      used += size;
      selected.push({ question, answer, projectRevision: row.projectRevision, isStale: row.projectRevision < currentRevision });
    }
    return selected.reverse();
  }
}
