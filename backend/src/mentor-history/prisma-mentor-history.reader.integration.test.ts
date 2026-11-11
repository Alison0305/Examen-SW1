import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { decodeHistoryCursor, encodeHistoryCursor } from "./mentor-history-cursor";
import type { MentorHistoryPage, MentorHistoryQuery } from "./mentor-history.contracts";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07, fase 2: the reader against the real development PostgreSQL. Fixtures use their own fixed ids (prefix
// d7…) and are removed by id only: deleting the fixture projects cascades to their interactions, then the fixture
// users go. Nothing else in the database is read or deleted. No local model is involved.

const uuid = (group: string, tail: string) => `d7${group}-0000-4000-8000-${tail.padStart(12, "0")}`;
const USER_A = uuid("000a01", "a01"), USER_B = uuid("000b01", "b01");
const PROJECT = { A: uuid("0000a0", "a0"), B: uuid("0000b0", "b0"), WALK: uuid("0000c0", "c0"), SEARCH: uuid("0000d0", "d0"), EMPTY: uuid("0000e0", "e0"), ONE: uuid("0000f0", "f0") } as const;
const EMAIL = { A: "cu07-history-a@example.test", B: "cu07-history-b@example.test" } as const;
const at = (time: string) => new Date(`2026-11-10T${time}.000Z`);

type Fixture = Readonly<{ id: string; projectId: string; userId: string; authorEmail: string; occurredAt: Date; question: string; answer: string }>;
const row = (projectId: string, id: string, time: string, question: string, answer = "Respuesta", user: "A" | "B" = "A"): Fixture =>
  ({ id, projectId, userId: user === "A" ? USER_A : USER_B, authorEmail: EMAIL[user], occurredAt: at(time), question, answer });

// Walk: 7 rows, three of them tied at 10:00 and two at 10:10, with ids that differ only in the last group and cross
// the digit/letter boundary, so the uuid ordering of PostgreSQL is exercised, not just the first character.
const WALK = [
  row(PROJECT.WALK, uuid("00c0de", "009"), "10:00:00", "W1"),
  row(PROJECT.WALK, uuid("00c0de", "00a"), "10:00:00", "W2"),
  row(PROJECT.WALK, uuid("00c0de", "0f0"), "10:00:00", "W3"),
  row(PROJECT.WALK, uuid("00c0de", "100"), "10:05:00", "W4"),
  row(PROJECT.WALK, uuid("00c0de", "0ff"), "10:10:00", "W5"),
  row(PROJECT.WALK, uuid("00c0de", "a00"), "10:10:00", "W6"),
  row(PROJECT.WALK, uuid("00c0de", "001"), "10:20:00", "W7"),
];

const ISOLATION = [
  row(PROJECT.A, uuid("00a0de", "1"), "12:00:00", "Pregunta A1"),
  row(PROJECT.A, uuid("00a0de", "2"), "12:01:00", "Pregunta A2"),
  row(PROJECT.A, uuid("00a0de", "3"), "12:02:00", "SECRET-A dato privado del proyecto A"),
  row(PROJECT.B, uuid("00b0de", "1"), "11:00:00", "Pregunta B1", "Respuesta", "B"),
  row(PROJECT.B, uuid("00b0de", "2"), "13:00:00", "Pregunta B2", "Respuesta", "B"),
];

const SEARCH = [
  row(PROJECT.SEARCH, uuid("00d0de", "01"), "09:00:00", "¿Cómo modelo una relación uno a muchos?", "Con multiplicidad 0..* en el extremo muchos."),
  row(PROJECT.SEARCH, uuid("00d0de", "02"), "09:01:00", "Ayuda", "Debes utilizar una clave foránea en la tabla hija."),
  row(PROJECT.SEARCH, uuid("00d0de", "03"), "09:02:00", "RELACIÓN UML", "Una asociación entre clases."),
  // % and _ discriminators: if they were wildcards, "100%" would also match 04b and "cliente_id" would match 06b.
  row(PROJECT.SEARCH, uuid("00d0de", "04"), "09:03:00", "¿Cobertura al 100%?", "Sí."),
  row(PROJECT.SEARCH, uuid("00d0de", "4b"), "09:04:00", "¿100 por ciento?", "Más de 1000 casos."),
  row(PROJECT.SEARCH, uuid("00d0de", "06"), "09:05:00", "¿Dónde va cliente_id?", "En pedido."),
  row(PROJECT.SEARCH, uuid("00d0de", "6b"), "09:06:00", "¿Qué es clienteXid?", "Nada."),
  // Backslash discriminator: an unescaped "\t" would be read as an escaped "t" and match "C:temp".
  row(PROJECT.SEARCH, uuid("00d0de", "07"), "09:07:00", "Ruta C:\\temp", "Ruta de Windows."),
  row(PROJECT.SEARCH, uuid("00d0de", "7b"), "09:08:00", "Ruta C:temp", "Sin barra."),
  // Five matches of "patrón" (two in the answer only, one tied in time) interleaved with non-matching rows.
  row(PROJECT.SEARCH, uuid("00d0de", "11"), "09:10:00", "Patrón repositorio 1"),
  row(PROJECT.SEARCH, uuid("00d0de", "12"), "09:11:00", "Ruido 1"),
  row(PROJECT.SEARCH, uuid("00d0de", "13"), "09:12:00", "Pregunta", "Aplica el PATRÓN fábrica"),
  row(PROJECT.SEARCH, uuid("00d0de", "14"), "09:12:00", "Patrón estrategia 2"),
  row(PROJECT.SEARCH, uuid("00d0de", "15"), "09:13:00", "Ruido 2"),
  row(PROJECT.SEARCH, uuid("00d0de", "16"), "09:14:00", "Otra", "Usa un patrón observador"),
  row(PROJECT.SEARCH, uuid("00d0de", "17"), "09:15:00", "patrón adaptador 3"),
];

const ONE = [row(PROJECT.ONE, uuid("00f0de", "1"), "08:00:00", "Única pregunta", "Única respuesta", "B")];

const newestFirst = (rows: readonly Fixture[]) => [...rows].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime() || (right.id < left.id ? -1 : right.id > left.id ? 1 : 0));
const ids = (page: MentorHistoryPage) => page.items.map((item) => item.id);

describe("PrismaMentorHistoryReader con PostgreSQL", () => {
  let prisma: PrismaService;
  let reader: PrismaMentorHistoryReader;

  // Records the findMany arguments and still runs the real query: spying on the Prisma delegate (a lazy proxy) breaks it.
  function recordingReader() {
    const calls: Prisma.MentorInteractionFindManyArgs[] = [];
    const client = { mentorInteraction: { findMany: (args: Prisma.MentorInteractionFindManyArgs) => { calls.push(args); return prisma.mentorInteraction.findMany(args); } } };
    return { recorder: new PrismaMentorHistoryReader(client as unknown as PrismaService), calls };
  }

  async function removeFixtures(): Promise<void> {
    await prisma.project.deleteMany({ where: { id: { in: Object.values(PROJECT) } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  }

  // Follows nextCursor until the end; fails instead of looping if the cursor never ends.
  async function walk(projectId: string, query: Omit<MentorHistoryQuery, "cursor">): Promise<MentorHistoryPage[]> {
    const pages: MentorHistoryPage[] = [];
    let next: string | null = null;
    do {
      const cursor = next === null ? undefined : decodeHistoryCursor(next);
      if (cursor && !cursor.ok) throw new Error(cursor.reason);
      pages.push(await reader.page(projectId, { ...query, ...(cursor ? { cursor: cursor.cursor } : {}) }));
      next = pages[pages.length - 1]!.nextCursor;
    } while (next !== null && pages.length < 20);
    expect(next).toBeNull();
    return pages;
  }

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    prisma = new PrismaService();
    await prisma.$connect();
    reader = new PrismaMentorHistoryReader(prisma);
    await removeFixtures();
    await prisma.user.createMany({ data: [{ id: USER_A, email: EMAIL.A, passwordHash: "test-hash-not-a-real-password" }, { id: USER_B, email: EMAIL.B, passwordHash: "test-hash-not-a-real-password" }] });
    await prisma.project.createMany({ data: Object.entries(PROJECT).map(([key, id]) => ({ id, ownerId: key === "B" ? USER_B : USER_A, name: `CU-2P-07 historial ${key}`, document: {} })) });
    await prisma.mentorInteraction.createMany({ data: [...WALK, ...ISOLATION, ...SEARCH, ...ONE].map((fixture) => ({ ...fixture, accessRole: "OWNER", projectRevision: 1, grounded: true })) });
  });

  afterAll(async () => {
    if (!prisma) return;
    await removeFixtures();
    await prisma.$disconnect();
  });

  describe("listado y orden", () => {
    it("un proyecto sin interacciones devuelve una página vacía, no un error", async () => {
      await expect(reader.page(PROJECT.EMPTY, { limit: 20 })).resolves.toEqual({ items: [], nextCursor: null });
    });

    it("una fila: DTO público exacto y sin siguiente página", async () => {
      await expect(reader.page(PROJECT.ONE, { limit: 20 })).resolves.toEqual({
        items: [{ id: ONE[0]!.id, author: { email: EMAIL.B }, question: "Única pregunta", answer: "Única respuesta", occurredAt: "2026-11-10T08:00:00.000Z" }],
        nextCursor: null,
      });
    });

    it("devuelve más reciente primero y desempata por id descendente", async () => {
      const page = await reader.page(PROJECT.WALK, { limit: 20 });

      expect(ids(page)).toEqual(newestFirst(WALK).map((fixture) => fixture.id));
      expect(page.items.map((item) => item.question)).toEqual(["W7", "W6", "W5", "W4", "W3", "W2", "W1"]);
    });

    it("el orden uuid de PostgreSQL coincide con el orden de la representación canónica y lt funciona sobre uuid", async () => {
      const database = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id::text AS id FROM "MentorInteraction" WHERE "projectId" = ${PROJECT.WALK}::uuid ORDER BY id DESC`;
      const canonical = WALK.map((fixture) => fixture.id).sort().reverse();
      expect(database.map((entry) => entry.id)).toEqual(canonical);

      const pivot = uuid("00c0de", "0f0");
      const below = await prisma.mentorInteraction.findMany({ where: { projectId: PROJECT.WALK, id: { lt: pivot } }, select: { id: true }, orderBy: { id: "desc" } });
      expect(below.map((entry) => entry.id)).toEqual(canonical.filter((id) => id < pivot));
    });

    it("pide limit + 1 filas y entrega limit, con el cursor en el último entregado", async () => {
      const { recorder, calls } = recordingReader();
      const exact = await recorder.page(PROJECT.WALK, { limit: 7 });
      const short = await recorder.page(PROJECT.WALK, { limit: 6 });

      expect(exact.items).toHaveLength(7);
      expect(exact.nextCursor).toBeNull();
      expect(short.items).toHaveLength(6);
      expect(decodeHistoryCursor(short.nextCursor)).toEqual({ ok: true, cursor: { occurredAt: at("10:00:00"), id: short.items[5]!.id } });
      expect(calls.map((args) => args.take)).toEqual([8, 7]);
    });

    it("la consulta selecciona solo los campos del record, filtra por proyecto y ordena como el índice", async () => {
      const { recorder, calls } = recordingReader();
      const page = await recorder.page(PROJECT.SEARCH, { limit: 3, cursor: { occurredAt: at("09:14:00"), id: uuid("00d0de", "16") }, search: "patrón" });
      const args = calls[0]!;

      expect(Object.keys(args.select!).sort()).toEqual(["answer", "authorEmail", "id", "occurredAt", "question"]);
      expect(args.where!.projectId).toBe(PROJECT.SEARCH);
      expect(args.orderBy).toEqual([{ occurredAt: "desc" }, { id: "desc" }]);
      expect(page.items.length).toBeGreaterThan(0);
      for (const item of page.items) expect(Object.keys(item).sort()).toEqual(["answer", "author", "id", "occurredAt", "question"]);
    });
  });

  describe("paginación keyset", () => {
    it("recorre 7 filas en páginas de 2: 4 páginas, 7 ids únicos, sin huecos y en orden global, con fechas empatadas", async () => {
      const pages = await walk(PROJECT.WALK, { limit: 2 });
      const seen = pages.flatMap(ids);

      expect(pages.map((page) => page.items.length)).toEqual([2, 2, 2, 1]);
      expect(seen).toEqual(newestFirst(WALK).map((fixture) => fixture.id));
      expect(new Set(seen).size).toBe(7);
    });

    it("las tres filas empatadas a las 10:00 cruzan una frontera de página sin repetirse ni saltarse", async () => {
      const pages = await walk(PROJECT.WALK, { limit: 3 });
      const tied = WALK.filter((fixture) => fixture.occurredAt.getTime() === at("10:00:00").getTime()).map((fixture) => fixture.id).sort().reverse();

      expect(pages.map((page) => page.items.length)).toEqual([3, 3, 1]);
      expect(pages.flatMap(ids).slice(-3)).toEqual(tied);
    });
  });

  describe("búsqueda", () => {
    it("encuentra un término presente solo en la pregunta", async () => {
      const page = await reader.page(PROJECT.SEARCH, { limit: 20, search: "uno a muchos" });
      expect(ids(page)).toEqual([uuid("00d0de", "01")]);
    });

    it("encuentra un término presente solo en la respuesta", async () => {
      const page = await reader.page(PROJECT.SEARCH, { limit: 20, search: "clave foránea" });
      expect(ids(page)).toEqual([uuid("00d0de", "02")]);
    });

    it("no distingue mayúsculas, también con letras acentuadas", async () => {
      expect(ids(await reader.page(PROJECT.SEARCH, { limit: 20, search: "relación uml" }))).toEqual([uuid("00d0de", "03")]);
      expect(ids(await reader.page(PROJECT.SEARCH, { limit: 20, search: "CLAVE FORÁNEA" }))).toEqual([uuid("00d0de", "02")]);
    });

    it("% se busca literalmente, no como comodín", async () => {
      expect(ids(await reader.page(PROJECT.SEARCH, { limit: 20, search: "100%" }))).toEqual([uuid("00d0de", "04")]);
      expect(ids(await reader.page(PROJECT.SEARCH, { limit: 20, search: "%" }))).toEqual([uuid("00d0de", "04")]);
    });

    it("_ se busca literalmente, no como comodín de un carácter", async () => {
      expect(ids(await reader.page(PROJECT.SEARCH, { limit: 20, search: "cliente_id" }))).toEqual([uuid("00d0de", "06")]);
    });

    it("la barra invertida se busca literalmente", async () => {
      expect(ids(await reader.page(PROJECT.SEARCH, { limit: 20, search: "C:\\temp" }))).toEqual([uuid("00d0de", "07")]);
    });

    it("búsqueda paginada: conserva filtro, proyecto y orden, sin duplicados", async () => {
      const pages = await walk(PROJECT.SEARCH, { limit: 2, search: "patrón" });
      const expected = newestFirst(SEARCH.filter((fixture) => /patrón/i.test(`${fixture.question} ${fixture.answer}`))).map((fixture) => fixture.id);

      expect(expected).toHaveLength(5);
      expect(pages.map((page) => page.items.length)).toEqual([2, 2, 1]);
      expect(pages.flatMap(ids)).toEqual(expected);
      for (const item of pages.flatMap((page) => page.items)) expect(`${item.question} ${item.answer}`.toLowerCase()).toContain("patrón");
    });
  });

  describe("aislamiento entre proyectos", () => {
    it("cada proyecto devuelve solo sus interacciones", async () => {
      expect(ids(await reader.page(PROJECT.A, { limit: 50 })).sort()).toEqual(ISOLATION.filter((fixture) => fixture.projectId === PROJECT.A).map((fixture) => fixture.id).sort());
      expect(ids(await reader.page(PROJECT.B, { limit: 50 })).sort()).toEqual(ISOLATION.filter((fixture) => fixture.projectId === PROJECT.B).map((fixture) => fixture.id).sort());
    });

    it("buscar SECRET-A en B devuelve vacío; en A lo encuentra", async () => {
      await expect(reader.page(PROJECT.B, { limit: 50, search: "SECRET-A" })).resolves.toEqual({ items: [], nextCursor: null });
      expect(ids(await reader.page(PROJECT.A, { limit: 50, search: "SECRET-A" }))).toEqual([uuid("00a0de", "3")]);
    });

    it("un cursor obtenido en A, usado en B, solo actúa como posición dentro de B", async () => {
      const first = await reader.page(PROJECT.A, { limit: 1 });
      expect(ids(first)).toEqual([uuid("00a0de", "3")]);
      const fromA = decodeHistoryCursor(first.nextCursor);
      if (!fromA.ok) throw new Error(fromA.reason);

      // The A cursor points at 12:02: in B only the older B1 (11:00) remains; B2 (13:00) is newer and no A row appears.
      const inB = await reader.page(PROJECT.B, { limit: 50, cursor: fromA.cursor });
      expect(ids(inB)).toEqual([uuid("00b0de", "1")]);
      expect(inB.items.every((item) => item.question.startsWith("Pregunta B"))).toBe(true);
    });
  });

  describe("cursor y búsqueda distinta", () => {
    it("el cursor no está ligado al filtro: con otra búsqueda continúa desde la misma posición dentro del proyecto", async () => {
      const first = await reader.page(PROJECT.SEARCH, { limit: 2, search: "patrón" });
      const position = decodeHistoryCursor(first.nextCursor);
      if (!position.ok) throw new Error(position.reason);

      // Reused with q=relación it returns the "relación" rows older than that position (all of them here), only from
      // this project: semantically odd navigation, not a leak.
      const other = await reader.page(PROJECT.SEARCH, { limit: 20, cursor: position.cursor, search: "relación" });
      expect(ids(other)).toEqual([uuid("00d0de", "03"), uuid("00d0de", "01")]);
      for (const item of other.items) expect(new Date(item.occurredAt).getTime()).toBeLessThan(position.cursor.occurredAt.getTime());
    });
  });

  describe("sin modelo local", () => {
    it("lee el historial con ASSISTANT_MODEL_PATH ausente", async () => {
      const saved = process.env.ASSISTANT_MODEL_PATH;
      delete process.env.ASSISTANT_MODEL_PATH;
      try {
        const page = await reader.page(PROJECT.WALK, { limit: 2, cursor: { occurredAt: at("10:10:00"), id: uuid("00c0de", "0ff") } });
        expect(ids(page)).toEqual([uuid("00c0de", "100"), uuid("00c0de", "0f0")]);
        expect(page.nextCursor).toBe(encodeHistoryCursor({ occurredAt: at("10:00:00"), id: uuid("00c0de", "0f0") }));
      } finally {
        if (saved !== undefined) process.env.ASSISTANT_MODEL_PATH = saved;
      }
    });
  });
});
