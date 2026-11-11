import { describe, expect, it } from "vitest";
import { escapeLikePattern, MENTOR_HISTORY_ORDER_BY, MENTOR_HISTORY_SELECT, mentorHistoryWhere } from "./prisma-mentor-history.reader";

const PROJECT = "d7000000-0000-4000-8000-0000000000aa";
const CURSOR = { occurredAt: new Date("2026-11-10T10:00:00.000Z"), id: "d7000000-0000-4000-8000-000000000001" };

describe("consulta Prisma del historial (sin base de datos)", () => {
  it("sin cursor ni búsqueda filtra solo por proyecto", () => {
    expect(mentorHistoryWhere(PROJECT, { limit: 20 })).toEqual({ projectId: PROJECT });
  });

  it("el keyset es estrictamente posterior al cursor en occurredAt DESC, id DESC", () => {
    expect(mentorHistoryWhere(PROJECT, { limit: 20, cursor: CURSOR })).toEqual({
      projectId: PROJECT,
      AND: [{ OR: [{ occurredAt: { lt: CURSOR.occurredAt } }, { occurredAt: { equals: CURSOR.occurredAt }, id: { lt: CURSOR.id } }] }],
    });
  });

  it("la búsqueda es insensible a mayúsculas sobre pregunta o respuesta", () => {
    expect(mentorHistoryWhere(PROJECT, { limit: 20, search: "fk" })).toEqual({
      projectId: PROJECT,
      AND: [{ OR: [{ question: { contains: "fk", mode: "insensitive" } }, { answer: { contains: "fk", mode: "insensitive" } }] }],
    });
  });

  it("escapa los metacaracteres de LIKE para que la búsqueda sea literal", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("cliente_id")).toBe("cliente\\_id");
    expect(escapeLikePattern("C:\\ruta")).toBe("C:\\\\ruta");
    expect(escapeLikePattern("relación uml")).toBe("relación uml");
    expect(mentorHistoryWhere(PROJECT, { limit: 20, search: "50%_x" }).AND).toEqual([{ OR: [{ question: { contains: "50\\%\\_x", mode: "insensitive" } }, { answer: { contains: "50\\%\\_x", mode: "insensitive" } }] }]);
  });

  it("con cursor y búsqueda, projectId sigue en el nivel superior y cada OR queda dentro de AND", () => {
    const where = mentorHistoryWhere(PROJECT, { limit: 20, cursor: CURSOR, search: "fk" });

    expect(Object.keys(where).sort()).toEqual(["AND", "projectId"]);
    expect(where.projectId).toBe(PROJECT);
    expect(where).not.toHaveProperty("OR");
    expect(where.AND).toHaveLength(2);
  });

  it("selecciona solo los campos de MentorHistoryRecord y ordena como el índice", () => {
    expect(Object.keys(MENTOR_HISTORY_SELECT).sort()).toEqual(["answer", "authorEmail", "id", "occurredAt", "question"]);
    expect(MENTOR_HISTORY_ORDER_BY).toEqual([{ occurredAt: "desc" }, { id: "desc" }]);
  });
});
