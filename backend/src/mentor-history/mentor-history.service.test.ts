import { NotFoundException } from "@nestjs/common";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { encodeHistoryCursor } from "./mentor-history-cursor";
import * as queryModule from "./mentor-history-query";
import type { MentorHistoryPage, MentorHistoryQuery, MentorHistoryReader } from "./mentor-history.contracts";
import { MentorHistoryService, type MentorHistoryProjectAccess } from "./mentor-history.service";

// The real parser, wrapped so its call can be placed in the observable sequence of each test.
vi.mock("./mentor-history-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mentor-history-query")>();
  return { ...actual, parseMentorHistoryQuery: vi.fn(actual.parseMentorHistoryQuery) };
});

const PROJECT = "d7035000-0000-4000-8000-0000000000aa";
const USER = "d7035000-0000-4000-8000-0000000000bb";
const PAGE: MentorHistoryPage = {
  items: [{ id: "d7035000-0000-4000-8000-000000000001", author: { email: "autor@example.test" }, question: "¿Qué es una FK?", answer: "Una clave foránea.", occurredAt: "2026-11-10T10:00:00.000Z" }],
  nextCursor: null,
};

// Fakes for both edges; every call appends to one shared sequence.
function setup(options: { access?: () => Promise<unknown>; page?: (projectId: string, query: MentorHistoryQuery) => Promise<MentorHistoryPage> } = {}) {
  const sequence: string[] = [];
  const access = { requireView: vi.fn(async (projectId: string, userId: string) => { sequence.push("requireView"); void projectId; void userId; return options.access ? options.access() : "VIEWER"; }) };
  const reader = { page: vi.fn(async (projectId: string, query: MentorHistoryQuery) => { sequence.push("reader"); return options.page ? options.page(projectId, query) : PAGE; }) };
  const parse = vi.mocked(queryModule.parseMentorHistoryQuery);
  parse.mockReset();
  parse.mockImplementation((raw) => { sequence.push("parse"); return actualParse(raw); });
  const service = new MentorHistoryService(access satisfies MentorHistoryProjectAccess, reader satisfies MentorHistoryReader);
  return { service, access, reader, parse, sequence };
}

let actualParse: typeof queryModule.parseMentorHistoryQuery;
beforeAll(async () => {
  ({ parseMentorHistoryQuery: actualParse } = await vi.importActual<typeof import("./mentor-history-query")>("./mentor-history-query"));
});

describe("MentorHistoryService.list", () => {
  it("con acceso: autoriza con projectId/userId, normaliza la consulta, lee del puerto y devuelve la página sin alterarla", async () => {
    const { service, access, reader } = setup();
    const result = await service.list(PROJECT, USER, {});

    expect(access.requireView).toHaveBeenCalledExactlyOnceWith(PROJECT, USER);
    expect(reader.page).toHaveBeenCalledExactlyOnceWith(PROJECT, { limit: 20 });
    expect(result).toEqual({ ok: true, page: PAGE });
    // Same object: author.email and every other field are passed through, nothing is re-read or rebuilt.
    expect(result.ok && result.page).toBe(PAGE);
  });

  it("delega limit, cursor y búsqueda ya normalizados por parseMentorHistoryQuery (sin recortar ni escapar de nuevo)", async () => {
    const { service, reader } = setup();
    const cursor = { occurredAt: new Date("2026-11-10T10:00:00.123Z"), id: "d7035000-0000-4000-8000-000000000009" };
    await service.list(PROJECT, USER, { limit: "5", cursor: encodeHistoryCursor(cursor), q: "  100%_x  " });

    expect(reader.page).toHaveBeenCalledExactlyOnceWith(PROJECT, { limit: 5, cursor, search: "100%_x" });
  });

  it("historial vacío: éxito con la página vacía tal cual, sin mensajes especiales", async () => {
    const empty: MentorHistoryPage = { items: [], nextCursor: null };
    const { service } = setup({ page: async () => empty });

    await expect(service.list(PROJECT, USER, {})).resolves.toEqual({ ok: true, page: { items: [], nextCursor: null } });
  });

  it("el resultado no depende del rol concedido: el servicio no contiene lógica de roles", async () => {
    for (const role of ["OWNER", "EDITOR", "VIEWER"]) {
      const { service, reader } = setup({ access: async () => role });
      await expect(service.list(PROJECT, USER, {})).resolves.toEqual({ ok: true, page: PAGE });
      expect(reader.page).toHaveBeenCalledExactlyOnceWith(PROJECT, { limit: 20 });
    }
  });

  describe("consulta inválida", () => {
    it.each([
      ["INVALID_LIMIT", { limit: "51" }, { code: "INVALID_LIMIT" }],
      ["INVALID_CURSOR", { cursor: "no-es-un-cursor" }, { code: "INVALID_CURSOR", reason: "MALFORMED_CURSOR" }],
      ["INVALID_SEARCH", { q: "   " }, { code: "INVALID_SEARCH" }],
      ["UNKNOWN_PARAMETER", { userId: USER }, { code: "UNKNOWN_PARAMETER" }],
    ])("%s: devuelve el error tipado del parser después de autorizar y el reader no se llama", async (_code, raw, expected) => {
      const { service, access, reader, sequence } = setup();
      const result = await service.list(PROJECT, USER, raw);

      expect(result).toEqual({ ok: false, error: expect.objectContaining(expected) });
      expect(result.ok ? undefined : result.error.message).toEqual(expect.any(String));
      expect(access.requireView).toHaveBeenCalledExactlyOnceWith(PROJECT, USER);
      expect(reader.page).not.toHaveBeenCalled();
      expect(sequence).toEqual(["requireView", "parse"]);
    });
  });

  describe("sin autorización", () => {
    it("usuario sin acceso: propaga la misma NotFoundException de requireView; ni parser ni reader se ejecutan", async () => {
      const denied = new NotFoundException();
      const { service, reader, parse, sequence } = setup({ access: () => Promise.reject(denied) });

      await expect(service.list(PROJECT, USER, {})).rejects.toBe(denied);
      expect(parse).not.toHaveBeenCalled();
      expect(reader.page).not.toHaveBeenCalled();
      expect(sequence).toEqual(["requireView"]);
    });

    it("proyecto inexistente: misma política (404 de requireView, sin distinguirlo) y sin lectura", async () => {
      const missing = new NotFoundException();
      const { service, reader } = setup({ access: () => Promise.reject(missing) });

      await expect(service.list("d7035000-0000-4000-8000-00000000dead", USER, { limit: "5" })).rejects.toBe(missing);
      expect(reader.page).not.toHaveBeenCalled();
    });

    it("sin acceso y con una consulta malformada responde el 404, no el error de consulta", async () => {
      const denied = new NotFoundException();
      const { service, reader } = setup({ access: () => Promise.reject(denied) });

      await expect(service.list(PROJECT, USER, { limit: "abc", cursor: "x", extra: "1" })).rejects.toBe(denied);
      expect(reader.page).not.toHaveBeenCalled();
    });
  });

  it("un fallo del reader se propaga tal cual: nunca se convierte en una página vacía", async () => {
    const failure = new Error("Can't reach database server");
    const { service } = setup({ page: () => Promise.reject(failure) });

    await expect(service.list(PROJECT, USER, {})).rejects.toBe(failure);
  });

  describe("orden", () => {
    it("requireView → parse → reader, exactamente una vez cada uno", async () => {
      const { service, sequence } = setup();
      await service.list(PROJECT, USER, { limit: "3" });

      expect(sequence).toEqual(["requireView", "parse", "reader"]);
    });

    it("mientras requireView no se resuelve, no se parsea ni se lee nada", async () => {
      let grant!: (role: string) => void;
      const pending = new Promise<string>((resolve) => { grant = resolve; });
      const { service, reader, parse, sequence } = setup({ access: () => pending });

      const result = service.list(PROJECT, USER, {});
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(sequence).toEqual(["requireView"]);
      expect(parse).not.toHaveBeenCalled();
      expect(reader.page).not.toHaveBeenCalled();

      grant("VIEWER");
      await expect(result).resolves.toEqual({ ok: true, page: PAGE });
      expect(sequence).toEqual(["requireView", "parse", "reader"]);
    });
  });
});
