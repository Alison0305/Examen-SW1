import { encodeHistoryCursor } from "./mentor-history-cursor";
import type { MentorHistoryItem, MentorHistoryPage, MentorHistoryRecord } from "./mentor-history.contracts";

// CU-2P-07: persistence record → public DTO. The item is built field by field, so a row carrying more columns
// (userId, accessRole, projectRevision, grounded…) can never leak them.

export function toMentorHistoryItem(record: MentorHistoryRecord): MentorHistoryItem {
  return {
    id: record.id,
    author: { email: record.authorEmail },
    question: record.question,
    answer: record.answer,
    occurredAt: record.occurredAt.toISOString(),
  };
}

/**
 * Builds a page from rows already ordered `occurredAt DESC, id DESC` and read with `take: limit + 1`: the extra row
 * only signals that another page exists, and the cursor points at the last item actually delivered.
 */
export function toMentorHistoryPage(records: readonly MentorHistoryRecord[], limit: number): MentorHistoryPage {
  const delivered = records.slice(0, limit);
  const last = delivered[delivered.length - 1];
  return {
    items: delivered.map(toMentorHistoryItem),
    nextCursor: records.length > limit && last ? encodeHistoryCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
  };
}
