import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeHistoryCursor } from "./mentor-history-cursor";
import type { MentorHistoryCursor, MentorHistoryRecord } from "./mentor-history.contracts";
import { toMentorHistoryItem, toMentorHistoryPage } from "./mentor-history-page";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const record = (n: number, iso: string, extra: Record<string, unknown> = {}): MentorHistoryRecord => ({ id: id(n), authorEmail: `autor${n}@example.test`, question: `Pregunta ${n}`, answer: `Respuesta ${n}`, occurredAt: new Date(iso), ...extra }) as MentorHistoryRecord;

// In-memory keyset reference: the ordering and "strictly after the cursor" rule the Prisma reader must reproduce.
const newestFirst = (left: MentorHistoryRecord, right: MentorHistoryRecord) => right.occurredAt.getTime() - left.occurredAt.getTime() || (right.id < left.id ? -1 : right.id > left.id ? 1 : 0);
const after = (row: MentorHistoryRecord, cursor: MentorHistoryCursor) => row.occurredAt < cursor.occurredAt || (row.occurredAt.getTime() === cursor.occurredAt.getTime() && row.id < cursor.id);
function readPage(rows: readonly MentorHistoryRecord[], limit: number, cursor?: string) {
  const position = cursor === undefined ? undefined : decodeHistoryCursor(cursor);
  if (position && !position.ok) throw new Error(position.reason);
  const ordered = [...rows].sort(newestFirst).filter((row) => !position || after(row, position.cursor));
  return toMentorHistoryPage(ordered.slice(0, limit + 1), limit);
}

describe("DTO público del historial", () => {
  it("contiene solo id, autor, pregunta, respuesta y fecha ISO", () => {
    const item = toMentorHistoryItem(record(1, "2026-11-10T10:00:00.000Z"));

    expect(item).toEqual({ id: id(1), author: { email: "autor1@example.test" }, question: "Pregunta 1", answer: "Respuesta 1", occurredAt: "2026-11-10T10:00:00.000Z" });
    expect(Object.keys(item).sort()).toEqual(["answer", "author", "id", "occurredAt", "question"]);
    expect(Object.keys(item.author)).toEqual(["email"]);
  });

  it("no filtra campos internos aunque la fila de persistencia los traiga", () => {
    const leaky = record(1, "2026-11-10T10:00:00.000Z", { userId: id(99), projectId: id(98), accessRole: "OWNER", projectRevision: 7, grounded: true, createdAt: new Date(), systemPrompt: "S", userPrompt: "U" });
    const serialized = JSON.stringify(toMentorHistoryPage([leaky], 20));

    for (const field of ["userId", "projectId", "accessRole", "projectRevision", "grounded", "createdAt", "systemPrompt", "userPrompt", id(99), id(98)]) expect(serialized).not.toContain(field);
  });
});

describe("página del historial", () => {
  it("un historial vacío es una página válida", () => {
    expect(toMentorHistoryPage([], 20)).toEqual({ items: [], nextCursor: null });
  });

  it("sin fila extra no hay siguiente página", () => {
    expect(toMentorHistoryPage([record(1, "2026-11-10T10:00:00.000Z")], 20)).toEqual({ items: [expect.objectContaining({ id: id(1) })], nextCursor: null });
  });

  it("conserva el orden recibido (más reciente primero) y apunta el cursor al último entregado", () => {
    const rows = [record(3, "2026-11-10T10:30:00.000Z"), record(2, "2026-11-10T10:20:00.000Z"), record(1, "2026-11-10T10:00:00.000Z")];
    const page = toMentorHistoryPage(rows, 2);

    expect(page.items.map((item) => item.question)).toEqual(["Pregunta 3", "Pregunta 2"]);
    expect(decodeHistoryCursor(page.nextCursor)).toEqual({ ok: true, cursor: { occurredAt: new Date("2026-11-10T10:20:00.000Z"), id: id(2) } });
  });

  it("recorrer todas las páginas entrega cada interacción una sola vez, en orden, incluso con fechas empatadas", () => {
    const rows = [
      record(1, "2026-11-10T10:00:00.000Z"), record(2, "2026-11-10T10:00:00.000Z"), record(3, "2026-11-10T10:00:00.000Z"),
      record(4, "2026-11-10T10:05:00.000Z"), record(5, "2026-11-10T10:10:00.000Z"), record(6, "2026-11-10T10:10:00.000Z"), record(7, "2026-11-10T10:20:00.000Z"),
    ];
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = readPage(rows, 2, cursor);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(4);
    expect(seen).toEqual([7, 6, 5, 4, 3, 2, 1].map(id));
    expect(new Set(seen).size).toBe(rows.length);
  });
});

describe("independencia del módulo", () => {
  const PURE_FILES = ["mentor-history.contracts.ts", "mentor-history-cursor.ts", "mentor-history-query.ts", "mentor-history-page.ts", "mentor-history-recommendation.ts"];

  it("los contratos del historial no importan Qwen, el asistente ni infraestructura (Prisma, NestJS)", () => {
    for (const file of PURE_FILES) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source, file).not.toMatch(/from "(\.\.\/assistant|\.\.\/mentor-analysis|\.\.\/prisma|node-llama-cpp|@prisma\/client|@nestjs\/)/);
    }
  });

  it("ningún archivo del módulo (reader, servicio y módulo Nest incluidos) importa Qwen, el asistente ni el Mentor", () => {
    const files = readdirSync(__dirname).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(files).toEqual(expect.arrayContaining([...PURE_FILES, "prisma-mentor-history.reader.ts", "mentor-history.service.ts", "mentor-history.module.ts"]));
    for (const file of files) expect(readFileSync(join(__dirname, file), "utf8"), file).not.toMatch(/from "(\.\.\/assistant|\.\.\/mentor-analysis|\.\.\/mentor\/|\.\.\/vision|\.\.\/speech|node-llama-cpp|@huggingface)/);
  });
});
