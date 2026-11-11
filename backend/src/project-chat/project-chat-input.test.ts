import { describe, expect, it } from "vitest";
import { encodeProjectChatCursor, parseMentorMention, parseProjectChatBody, parseProjectChatListQuery } from "./project-chat-input";

const ID = "00000000-0000-4000-8000-0000000000c1";

describe("parseMentorMention", () => {
  it("reconoce @mentor como palabra completa, sin distinguir mayúsculas, y extrae la pregunta", () => {
    expect(parseMentorMention("@mentor ¿cómo relaciono Cliente y Pedido?")).toEqual({ mentionsMentor: true, question: "¿cómo relaciono Cliente y Pedido?" });
    expect(parseMentorMention("Hola @Mentor, ¿qué falta en Cliente?")).toEqual({ mentionsMentor: true, question: "Hola , ¿qué falta en Cliente?" });
    expect(parseMentorMention("revisa esto @MENTOR")).toEqual({ mentionsMentor: true, question: "revisa esto" });
    expect(parseMentorMention("@mentor\n\n  explica   Pedido ")).toEqual({ mentionsMentor: true, question: "explica Pedido" });
  });

  it("no confunde otras palabras ni direcciones de correo con una mención", () => {
    for (const body of ["hablemos con los mentores", "@mentores ayuda", "escribe a ana@mentor.com", "mentor, ¿estás?", "@mentor_bot hola", "@@mentor hola"]) {
      expect(parseMentorMention(body)).toEqual({ mentionsMentor: false, question: "" });
    }
  });

  it("una mención sin texto deja la pregunta vacía", () => {
    expect(parseMentorMention("@mentor")).toEqual({ mentionsMentor: true, question: "" });
    expect(parseMentorMention("  @mentor   @mentor ")).toEqual({ mentionsMentor: true, question: "" });
  });
});

describe("parseProjectChatBody", () => {
  it("acepta exactamente { body } con 1..2000 caracteres tras recortar", () => {
    expect(parseProjectChatBody({ body: "  hola equipo  " })).toEqual({ ok: true, body: "hola equipo" });
    expect(parseProjectChatBody({ body: "a".repeat(2000) })).toEqual({ ok: true, body: "a".repeat(2000) });
  });

  it("rechaza cuerpos nulos, vacíos, largos, de otro tipo o con propiedades extra", () => {
    for (const raw of [null, undefined, "hola", 1, [], {}, { body: "" }, { body: "   " }, { body: "a".repeat(2001) }, { body: 3 }, { body: "hola", authorUserId: ID }, { body: "hola", kind: "MENTOR" }, { mensaje: "hola" }]) {
      expect(parseProjectChatBody(raw)).toMatchObject({ ok: false, error: { code: "INVALID_BODY" } });
    }
  });
});

describe("parseProjectChatListQuery", () => {
  it("usa limit 30 por defecto y acepta 1..50", () => {
    expect(parseProjectChatListQuery({})).toEqual({ ok: true, query: { limit: 30 } });
    expect(parseProjectChatListQuery({ limit: "1" })).toEqual({ ok: true, query: { limit: 1 } });
    expect(parseProjectChatListQuery({ limit: "50" })).toEqual({ ok: true, query: { limit: 50 } });
  });

  it("rechaza limit inválido, parámetros desconocidos y repetidos", () => {
    for (const limit of ["0", "51", "abc", "1.5", " 5", ["5", "6"]]) expect(parseProjectChatListQuery({ limit })).toMatchObject({ ok: false, error: { code: "INVALID_LIMIT" } });
    expect(parseProjectChatListQuery({ q: "hola" })).toMatchObject({ ok: false, error: { code: "UNKNOWN_PARAMETER" } });
    expect(parseProjectChatListQuery(null)).toMatchObject({ ok: false, error: { code: "UNKNOWN_PARAMETER" } });
  });

  it("decodifica el cursor que produce encodeProjectChatCursor y rechaza cursores manipulados", () => {
    const createdAt = new Date("2026-11-11T12:00:00.000Z");
    const cursor = encodeProjectChatCursor({ createdAt, id: ID });
    expect(parseProjectChatListQuery({ cursor })).toEqual({ ok: true, query: { limit: 30, cursor: { createdAt, id: ID } } });

    const forged = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    for (const bad of ["no válido", "abc", forged({ v: 2, t: createdAt.toISOString(), i: ID }), forged({ v: 1, t: "ayer", i: ID }), forged({ v: 1, t: createdAt.toISOString(), i: "x" }), forged({ v: 1, t: createdAt.toISOString(), i: ID, extra: 1 }), ["a", "b"]]) {
      expect(parseProjectChatListQuery({ cursor: bad })).toMatchObject({ ok: false, error: { code: "INVALID_CURSOR" } });
    }
  });
});
