import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, primitiveType } from "@examen-sw1/uml-core";
import { MentorContextBuilder } from "./mentor-context.builder";
import type { MentorAiProvider, MentorInteractionRecorder } from "./mentor.contracts";
import { MentorService } from "./mentor.service";

function project(name: string, revision: number, className?: string) {
  const document = createProjectDocument({ id: `${name}-document`, now: new Date("2026-11-07T00:00:00.000Z") });
  if (className) document.uml.classes.push({ id: `${name}-class`, name: className, visibility: "public", attributes: [{ id: `${name}-attribute`, name: "nombre", visibility: "public", type: primitiveType("string") }], operations: [] });
  return { id: `${name}-id`, name, revision, document };
}

function serviceFor(projects: Record<string, ReturnType<typeof project> | null>, provider: MentorAiProvider, recorder: MentorInteractionRecorder = { record: vi.fn().mockResolvedValue(undefined) }) {
  const access = { requireView: vi.fn().mockResolvedValue("VIEWER") };
  const persistence = { findProject: vi.fn(async (id: string) => projects[id] ?? null) };
  return { service: new MentorService(access as never, persistence as never, new MentorContextBuilder(), provider, recorder), access, persistence, recorder };
}

describe("MentorService", () => {
  it("usa un contexto distinto y aislado para preguntas equivalentes por projectId", async () => {
    const provider = { ask: vi.fn().mockResolvedValue("Respuesta contextual") };
    const a = project("A", 2, "Cliente");
    const b = project("B", 7, "Factura");
    const { service } = serviceFor({ "a-id": a, "b-id": b }, provider);

    await service.query("a-id", "user-a", "Describe el modelo");
    await service.query("b-id", "user-a", "Describe el modelo");

    expect(provider.ask).toHaveBeenNthCalledWith(1, expect.objectContaining({ projectName: "A", classes: [{ name: "Cliente", attributes: [{ name: "nombre", type: "string", multiplicity: undefined }] }] }), "Describe el modelo");
    expect(provider.ask).toHaveBeenNthCalledWith(2, expect.objectContaining({ projectName: "B", classes: [{ name: "Factura", attributes: [{ name: "nombre", type: "string", multiplicity: undefined }] }] }), "Describe el modelo");
  });

  it("autoriza antes de cargar el proyecto", async () => {
    const provider = { ask: vi.fn() };
    const { service, access, persistence } = serviceFor({ "a-id": project("A", 1, "Cliente") }, provider);
    access.requireView.mockRejectedValueOnce(new NotFoundException());

    await expect(service.query("a-id", "outsider", "Describe el modelo")).rejects.toBeInstanceOf(NotFoundException);
    expect(persistence.findProject).not.toHaveBeenCalled();
    expect(provider.ask).not.toHaveBeenCalled();
  });

  it("devuelve insuficiencia de contexto sin llamar al proveedor", async () => {
    const provider = { ask: vi.fn() };
    const { service } = serviceFor({ "empty-id": project("Vacío", 3) }, provider);

    await expect(service.query("empty-id", "user-a", "¿Qué clase existe?")).resolves.toEqual({ answer: "El proyecto no contiene clases suficientes para responder esta consulta.", grounded: false, projectRevision: 3, diagnostic: "INSUFFICIENT_CONTEXT" });
    expect(provider.ask).not.toHaveBeenCalled();
  });

  it("informa una clase inexistente detectada de forma explícita", async () => {
    const provider = { ask: vi.fn() };
    const { service } = serviceFor({ "a-id": project("A", 2, "Cliente") }, provider);

    await expect(service.query("a-id", "user-a", "Describe la clase Factura")).resolves.toEqual({ answer: "No se encontró la clase Factura en el modelo UML vigente del proyecto.", grounded: false, projectRevision: 2, diagnostic: "ELEMENT_NOT_FOUND" });
    expect(provider.ask).not.toHaveBeenCalled();
  });

  it("valida preguntas vacías y registra la interacción completada", async () => {
    const provider = { ask: vi.fn().mockResolvedValue("Cliente tiene nombre.") };
    const recorder = { record: vi.fn().mockResolvedValue(undefined) };
    const { service } = serviceFor({ "a-id": project("A", 2, "Cliente") }, provider, recorder);

    await expect(service.query("a-id", "user-a", "   ")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.query("a-id", "user-a", "  Describe Cliente  ")).resolves.toEqual({ answer: "Cliente tiene nombre.", grounded: true, projectRevision: 2 });
    expect(recorder.record).toHaveBeenCalledWith({ projectId: "a-id", userId: "user-a", projectRevision: 2, question: "Describe Cliente", answer: "Cliente tiene nombre.", grounded: true });
  });

  it("propaga un fallo del proveedor como error controlado", async () => {
    const provider = { ask: vi.fn().mockRejectedValue(new Error("detalle interno del proveedor")) };
    const { service } = serviceFor({ "a-id": project("A", 2, "Cliente") }, provider);

    await expect(service.query("a-id", "user-a", "Describe Cliente")).rejects.toThrow("El Mentor IA no está disponible en este momento.");
  });
});
