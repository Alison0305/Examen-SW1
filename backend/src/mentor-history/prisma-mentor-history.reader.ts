import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { MentorHistoryPage, MentorHistoryQuery, MentorHistoryReader, MentorHistoryRecord } from "./mentor-history.contracts";
import { toMentorHistoryPage } from "./mentor-history-page";

// CU-2P-07, fase 2: PostgreSQL implementation of MENTOR_HISTORY_READER over the `MentorInteraction` table written by
// CU-2P-03. It reads; it never authorizes (the service calls requireView first), never maps errors to HTTP and never
// touches the local model.

// Only the columns of MentorHistoryRecord: userId, accessRole, projectRevision, grounded, createdAt and the relations
// are never read.
export const MENTOR_HISTORY_SELECT = { id: true, authorEmail: true, question: true, answer: true, occurredAt: true } as const satisfies Record<keyof MentorHistoryRecord, true>;

// Exactly the order of the index (projectId, occurredAt, id), read backwards.
export const MENTOR_HISTORY_ORDER_BY = [{ occurredAt: "desc" }, { id: "desc" }] as const satisfies Prisma.MentorInteractionOrderByWithRelationInput[];

/**
 * Prisma 6 `contains` is translated to `ILIKE '%' || value || '%'` WITHOUT escaping the value: measured against
 * PostgreSQL, "100%" also matched "100 por ciento" and "cliente_id" matched "clienteXid". The search is literal by
 * contract, so `\`, `%` and `_` are escaped with PostgreSQL's default LIKE escape character (backslash).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * `projectId = :projectId AND (keyset) AND (search)`. The project filter is the top-level condition and every OR is
 * nested inside AND, so neither the cursor nor the search can widen the result beyond the project.
 */
export function mentorHistoryWhere(projectId: string, query: MentorHistoryQuery): Prisma.MentorInteractionWhereInput {
  const conditions: Prisma.MentorInteractionWhereInput[] = [];
  if (query.cursor) {
    const { occurredAt, id } = query.cursor;
    // Strictly after the last delivered item in `occurredAt DESC, id DESC`.
    conditions.push({ OR: [{ occurredAt: { lt: occurredAt } }, { occurredAt: { equals: occurredAt }, id: { lt: id } }] });
  }
  if (query.search !== undefined) {
    const pattern = escapeLikePattern(query.search);
    conditions.push({ OR: [{ question: { contains: pattern, mode: "insensitive" } }, { answer: { contains: pattern, mode: "insensitive" } }] });
  }
  return conditions.length === 0 ? { projectId } : { projectId, AND: conditions };
}

@Injectable()
export class PrismaMentorHistoryReader implements MentorHistoryReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async page(projectId: string, query: MentorHistoryQuery): Promise<MentorHistoryPage> {
    const rows = await this.prisma.mentorInteraction.findMany({
      where: mentorHistoryWhere(projectId, query),
      orderBy: [...MENTOR_HISTORY_ORDER_BY],
      // The extra row only tells whether another page exists; toMentorHistoryPage never delivers it.
      take: query.limit + 1,
      select: MENTOR_HISTORY_SELECT,
    });
    return toMentorHistoryPage(rows, query.limit);
  }
}
