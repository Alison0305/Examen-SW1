import { describe, expect, it } from "vitest";
import { encodeHistoryCursor } from "./mentor-history-cursor";
import { MENTOR_HISTORY_DEFAULT_LIMIT, MENTOR_HISTORY_MAX_LIMIT } from "./mentor-history.contracts";
import { parseMentorHistoryQuery, parseMentorProposalHistoryQuery } from "./mentor-history-query";
import { MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT, MENTOR_PROPOSAL_HISTORY_MAX_LIMIT } from "../mentor-proposals/mentor-proposal.contracts";

const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const AT = new Date("2026-11-10T10:30:00.123Z");
const errorCode = (raw: unknown) => {
  const result = parseMentorHistoryQuery(raw);
  return result.ok ? undefined : result.error.code;
};

describe("parseMentorHistoryQuery: limit", () => {
  it("sin parámetros usa limit 20 y no añade cursor ni búsqueda", () => {
    expect(parseMentorHistoryQuery({})).toEqual({ ok: true, query: { limit: MENTOR_HISTORY_DEFAULT_LIMIT } });
    expect(MENTOR_HISTORY_DEFAULT_LIMIT).toBe(20);
  });

  it("acepta los extremos 1 y 50", () => {
    expect(parseMentorHistoryQuery({ limit: "1" })).toEqual({ ok: true, query: { limit: 1 } });
    expect(parseMentorHistoryQuery({ limit: "50" })).toEqual({ ok: true, query: { limit: MENTOR_HISTORY_MAX_LIMIT } });
    expect(MENTOR_HISTORY_MAX_LIMIT).toBe(50);
  });

  it("rechaza valores fuera de rango o que no son enteros decimales", () => {
    for (const limit of ["0", "51", "500", "-1", "1.5", "1e1", " 5", "5 ", "", "abc", "0x10", ["10", "20"], 10]) {
      expect(errorCode({ limit }), String(limit)).toBe("INVALID_LIMIT");
    }
  });
});

describe("parseMentorHistoryQuery: búsqueda", () => {
  it("recorta espacios y conserva el texto", () => {
    expect(parseMentorHistoryQuery({ q: "  Cliente pedido  " })).toEqual({ ok: true, query: { limit: 20, search: "Cliente pedido" } });
  });

  it("acepta 200 caracteres y rechaza 201", () => {
    expect(parseMentorHistoryQuery({ q: "a".repeat(200) })).toEqual({ ok: true, query: { limit: 20, search: "a".repeat(200) } });
    expect(errorCode({ q: "a".repeat(201) })).toBe("INVALID_SEARCH");
  });

  it("cuenta la longitud después del recorte", () => {
    expect(parseMentorHistoryQuery({ q: `   ${"a".repeat(200)}   ` })).toMatchObject({ ok: true });
  });

  it("rechaza búsqueda vacía, solo espacios, repetida, no textual o con caracteres de control", () => {
    for (const q of ["", "   ", ["a", "b"], 5, "a\u0000b", "a\nb"]) expect(errorCode({ q }), JSON.stringify(q)).toBe("INVALID_SEARCH");
  });
});

describe("parseMentorHistoryQuery: cursor y parámetros", () => {
  it("decodifica un cursor válido", () => {
    const cursor = encodeHistoryCursor({ occurredAt: AT, id: ID });
    expect(parseMentorHistoryQuery({ cursor, limit: "10", q: "fk" })).toEqual({ ok: true, query: { limit: 10, cursor: { occurredAt: AT, id: ID }, search: "fk" } });
  });

  it("un cursor inválido es INVALID_CURSOR con el motivo concreto", () => {
    expect(parseMentorHistoryQuery({ cursor: "!!!" })).toEqual({ ok: false, error: { code: "INVALID_CURSOR", reason: "MALFORMED_CURSOR", message: expect.any(String) } });
    const badId = Buffer.from(JSON.stringify({ v: 1, t: AT.toISOString(), i: "x" })).toString("base64url");
    expect(parseMentorHistoryQuery({ cursor: badId })).toMatchObject({ ok: false, error: { code: "INVALID_CURSOR", reason: "INVALID_CURSOR_ID" } });
    expect(errorCode({ cursor: [encodeHistoryCursor({ occurredAt: AT, id: ID })] })).toBe("INVALID_CURSOR");
  });

  it("rechaza parámetros desconocidos, incluido un userId o projectId del cliente", () => {
    expect(parseMentorHistoryQuery({ userId: ID })).toEqual({ ok: false, error: { code: "UNKNOWN_PARAMETER", message: "Parámetros no admitidos: userId." } });
    expect(errorCode({ projectId: ID, limit: "5" })).toBe("UNKNOWN_PARAMETER");
    expect(errorCode({ offset: "20" })).toBe("UNKNOWN_PARAMETER");
  });

  it("rechaza entradas que no son un objeto de consulta", () => {
    for (const raw of [null, undefined, "limit=5", ["limit"]]) expect(errorCode(raw)).toBe("UNKNOWN_PARAMETER");
  });

  it("los códigos de error de contrato son distinguibles entre sí", () => {
    expect(new Set([errorCode({ cursor: "!" }), errorCode({ limit: "0" }), errorCode({ q: "" }), errorCode({ x: "1" })]).size).toBe(4);
  });

  it("es determinista y no modifica la entrada", () => {
    const input = Object.freeze({ limit: "7", q: " uml " });
    expect(parseMentorHistoryQuery(input)).toEqual(parseMentorHistoryQuery(input));
    expect(input).toEqual({ limit: "7", q: " uml " });
  });
});

// Task 8.1: query of GET /projects/:id/mentor/history/proposals. Only `limit`, with CU-2P-06's range and default.
describe("parseMentorProposalHistoryQuery", () => {
  const proposalErrorCode = (raw: unknown) => {
    const result = parseMentorProposalHistoryQuery(raw);
    return result.ok ? undefined : result.error.code;
  };

  it("usa el rango y el valor por defecto de CU-2P-06 (20 y 1..50), no una copia", () => {
    expect([MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT, MENTOR_PROPOSAL_HISTORY_MAX_LIMIT]).toEqual([20, 50]);
    expect(parseMentorProposalHistoryQuery({})).toEqual({ ok: true, limit: MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT });
  });

  it.each([["1", 1], ["20", 20], ["50", 50], ["007", 7]])("limit=%s → %i", (limit, expected) => {
    expect(parseMentorProposalHistoryQuery({ limit })).toEqual({ ok: true, limit: expected });
  });

  it.each([
    ["0", "0"], ["51", "51"], ["no numérico", "abc"], ["decimal", "1.5"], ["negativo", "-1"], ["vacío", ""], ["con espacios", " 5"], ["exponente", "1e1"], ["muy largo", "0001"],
    ["repetido", ["10", "20"]], ["número no textual", 5],
  ])("limit %s → INVALID_LIMIT", (_case, limit) => {
    expect(parseMentorProposalHistoryQuery({ limit })).toEqual({ ok: false, error: { code: "INVALID_LIMIT", message: "limit debe ser un entero entre 1 y 50." } });
  });

  it.each([["cursor", { cursor: "x" }], ["q", { q: "uml" }], ["userId", { userId: "x" }], ["status", { status: "APPLIED", limit: "5" }]])("%s no se admite (sin cursor ni búsqueda) → UNKNOWN_PARAMETER", (_name, raw) => {
    expect(proposalErrorCode(raw)).toBe("UNKNOWN_PARAMETER");
  });

  it("varios parámetros desconocidos se nombran ordenados", () => {
    expect(parseMentorProposalHistoryQuery({ q: "a", cursor: "b" })).toEqual({ ok: false, error: { code: "UNKNOWN_PARAMETER", message: "Parámetros no admitidos: cursor, q." } });
  });

  it.each([null, "limit=5", ["limit"], 5])("una query que no es un objeto (%j) → UNKNOWN_PARAMETER sin lanzar", (raw) => {
    expect(() => parseMentorProposalHistoryQuery(raw)).not.toThrow();
    expect(proposalErrorCode(raw)).toBe("UNKNOWN_PARAMETER");
  });

  it("el parser de interacciones no cambia: limit sigue aceptando cursor y q junto a limit", () => {
    expect(parseMentorHistoryQuery({ limit: "50" })).toEqual({ ok: true, query: { limit: 50 } });
    expect(parseMentorHistoryQuery({ limit: "51" })).toEqual({ ok: false, error: { code: "INVALID_LIMIT", message: "limit debe ser un entero entre 1 y 50." } });
    expect(parseMentorHistoryQuery({})).toEqual({ ok: true, query: { limit: MENTOR_HISTORY_DEFAULT_LIMIT } });
  });
});