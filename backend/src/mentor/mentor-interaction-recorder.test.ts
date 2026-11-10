import { describe, expect, it, vi } from "vitest";
import { PrismaMentorInteractionMemory, PrismaMentorInteractionRecorder } from "./mentor-interaction-recorder";

describe("PrismaMentorInteractionRecorder", () => {
  it("persiste la identidad y la respuesta completada", async () => {
    const create = vi.fn().mockResolvedValue({});
    const recorder = new PrismaMentorInteractionRecorder({ mentorInteraction: { create } } as never);
    const occurredAt = new Date("2026-11-09T00:00:00.000Z");
    await recorder.record({ projectId: "project", userId: "user", author: { email: "author@example.test" }, accessRole: "VIEWER", occurredAt, projectRevision: 2, question: "Pregunta", answer: "Respuesta", grounded: true });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "project", userId: "user", authorEmail: "author@example.test", accessRole: "VIEWER", occurredAt, projectRevision: 2, question: "Pregunta", answer: "Respuesta", grounded: true }) });
  });

  it("recupera solo el proyecto, acota y ordena antecedentes cronológicamente", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "2", question: "Nueva", answer: "B", projectRevision: 3 },
      { id: "1", question: "Vieja", answer: "A", projectRevision: 2 },
    ]);
    const memory = new PrismaMentorInteractionMemory({ mentorInteraction: { findMany } } as never);
    await expect(memory.recent("project-a", 3)).resolves.toEqual([
      { question: "Vieja", answer: "A", projectRevision: 2, isStale: true },
      { question: "Nueva", answer: "B", projectRevision: 3, isStale: false },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-a" }, take: 6 }));
  });

  it("limita seis antecedentes, texto y marca revisiones previas", async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: String(index), question: "q".repeat(1300), answer: "a".repeat(1300), projectRevision: index === 7 ? 4 : 3 }));
    const memory = new PrismaMentorInteractionMemory({ mentorInteraction: { findMany: vi.fn().mockResolvedValue(rows) } } as never);
    const result = await memory.recent("project", 4);
    expect(result).toHaveLength(2); // 2 * (1200 + 1200) fits the 6000-char budget.
    expect(result.every((entry) => entry.question.length === 1200 && entry.answer.length === 1200)).toBe(true);
    expect(result.some((entry) => entry.isStale)).toBe(true);
  });
});
