import { describe, expect, it } from "vitest";
import { decodeHistoryCursor, encodeHistoryCursor } from "./mentor-history-cursor";

const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const AT = new Date("2026-11-10T10:30:00.123Z");
const raw = (payload: unknown) => Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload), "utf8").toString("base64url");

describe("cursor del historial", () => {
  it("encode/decode es un roundtrip exacto y determinista", () => {
    const cursor = encodeHistoryCursor({ occurredAt: AT, id: ID });

    expect(encodeHistoryCursor({ occurredAt: new Date(AT.getTime()), id: ID })).toBe(cursor);
    expect(decodeHistoryCursor(cursor)).toEqual({ ok: true, cursor: { occurredAt: AT, id: ID } });
  });

  it("es opaco: base64url sin la fecha ni el id en claro", () => {
    const cursor = encodeHistoryCursor({ occurredAt: AT, id: ID });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain(ID);
    expect(cursor).not.toContain("2026");
  });

  it("distingue posiciones distintas", () => {
    const other = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4c";
    expect(encodeHistoryCursor({ occurredAt: AT, id: other })).not.toBe(encodeHistoryCursor({ occurredAt: AT, id: ID }));
    expect(encodeHistoryCursor({ occurredAt: new Date(AT.getTime() + 1), id: ID })).not.toBe(encodeHistoryCursor({ occurredAt: AT, id: ID }));
  });

  it("rechaza valores con formato inválido como MALFORMED_CURSOR", () => {
    for (const value of [undefined, null, 42, ["a"], "", "no es base64!", "x".repeat(300), raw("no json"), raw([1, 2]), raw({ v: 1, t: AT.toISOString() }), raw({ v: 1, t: AT.toISOString(), i: ID, extra: true })]) {
      expect(decodeHistoryCursor(value)).toEqual({ ok: false, reason: "MALFORMED_CURSOR" });
    }
  });

  it("rechaza una codificación no canónica del mismo contenido", () => {
    const cursor = encodeHistoryCursor({ occurredAt: AT, id: ID });
    // Standard base64 padding/alphabet is not the format the server emits.
    expect(decodeHistoryCursor(`${cursor}==`)).toEqual({ ok: false, reason: "MALFORMED_CURSOR" });
  });

  it("rechaza una versión desconocida", () => {
    expect(decodeHistoryCursor(raw({ v: 2, t: AT.toISOString(), i: ID }))).toEqual({ ok: false, reason: "UNSUPPORTED_CURSOR_VERSION" });
  });

  it("rechaza fechas inválidas, imposibles o fuera del formato ISO con milisegundos", () => {
    for (const t of ["2026-02-30T10:00:00.000Z", "2026-11-10T25:00:00.000Z", "2026-11-10T10:30:00Z", "2026-11-10", "ayer", 1762770600123, null]) {
      expect(decodeHistoryCursor(raw({ v: 1, t, i: ID }))).toEqual({ ok: false, reason: "INVALID_CURSOR_DATE" });
    }
  });

  it("rechaza ids que no son UUID", () => {
    for (const i of ["123", "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4", "' OR 1=1 --", 7, null]) {
      expect(decodeHistoryCursor(raw({ v: 1, t: AT.toISOString(), i }))).toEqual({ ok: false, reason: "INVALID_CURSOR_ID" });
    }
  });

  it("encode rechaza posiciones inválidas, que solo pueden venir de un error de programación", () => {
    expect(() => encodeHistoryCursor({ occurredAt: new Date("x"), id: ID })).toThrow(TypeError);
    expect(() => encodeHistoryCursor({ occurredAt: AT, id: "no-uuid" })).toThrow(TypeError);
  });
});
