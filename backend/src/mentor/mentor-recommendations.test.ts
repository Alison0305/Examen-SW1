import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createProjectDocument, primitiveType } from "@examen-sw1/uml-core";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { MentorInteractionIdentity } from "../mentor-identity/mentor-interaction-identity.contracts";
import { MentorContextBuilder } from "./mentor-context.builder";
import type { MentorAiProvider, MentorRecommendationProvider } from "./mentor.contracts";
import { RecoverableRecommendationOutputError, RecoverableTechnicalReferenceError } from "./local-qwen-mentor.provider";
import { MentorService } from "./mentor.service";

const alice: AuthenticatedUser = { id: "user-a", email: "alice@example.test" };
const draft = { problem: "Separación de responsabilidades", alternatives: ["Mantener el límite actual"], rationale: "La arquitectura verificada separa frontend y API.", limitations: "No evalúa integraciones externas.", confidence: 0.8, needsClarification: false, requiresUmlChange: false };

function project(revision = 5, relationshipType: "Association" | "Aggregation" | "Composition" | "Generalization" = "Association") {
  const document = createProjectDocument({ id: "project-document", now: new Date("2026-11-09T00:00:00.000Z") });
  document.uml.classes.push(
    { id: "categoria", name: "Categoria", visibility: "public", attributes: [{ id: "categoria-nombre", name: "nombre", visibility: "public", type: primitiveType("string") }], operations: [] },
    { id: "producto", name: "Producto", visibility: "public", attributes: [{ id: "producto-nombre", name: "nombre", visibility: "public", type: primitiveType("string") }], operations: [] },
  );
  document.uml.relationships.push({ id: "categoria-producto", type: relationshipType, sourceId: "categoria", targetId: "producto", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
  return { id: "project-a", name: "Tienda", revision, document };
}

function setup(options: { memory?: unknown[]; provider?: Partial<MentorAiProvider & MentorRecommendationProvider>; project?: ReturnType<typeof project> } = {}) {
  const stored = options.project ?? project();
  const identity: MentorInteractionIdentity = { projectId: "project-a", userId: alice.id, author: { email: alice.email }, accessRole: "VIEWER", occurredAt: new Date("2026-11-09T00:00:00.000Z") };
  const identities = { resolve: vi.fn().mockResolvedValue(identity) };
  const projects = { findProject: vi.fn().mockResolvedValue(stored) };
  const recommend = (options.provider?.recommend as ReturnType<typeof vi.fn> | undefined) ?? vi.fn().mockResolvedValue(draft);
  const provider = { ask: vi.fn(), ...options.provider, recommend };
  const recorder = { record: vi.fn().mockResolvedValue(undefined) };
  const memory = { recent: vi.fn().mockResolvedValue(options.memory ?? []) };
  return { service: new MentorService(identities as never, projects as never, new MentorContextBuilder(), provider, recorder, memory), identities, projects, provider, recommend, recorder, memory, stored };
}

describe("MentorService recommendations", () => {
  it("admite arquitectura verificada sin entidad literal y limita el contexto enviado", async () => {
    const { service, recommend } = setup();
    await expect(service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).resolves.toMatchObject({ status: "READ_ONLY", needsClarification: false, requiresUmlChange: false, projectRevision: 5 });
    const [uml, technical, question, memory] = recommend.mock.calls[0]!;
    expect(question).toContain("frontend");
    expect(technical.architecture.join(" ")).toMatch(/Next\.js.*NestJS.*PostgreSQL.*Prisma.*Qwen/s);
    expect(technical.springExport.join(" ")).toContain("Spring Boot");
    expect(JSON.stringify([uml, technical, memory])).not.toMatch(/user-a|alice@example|VIEWER|password|secret|token/i);
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it("resuelve UML verificable y generación Spring directamente sin Qwen", async () => {
    const { service, recommend } = setup({ provider: { recommend: vi.fn().mockResolvedValue({ ...draft, requiresUmlChange: true }) } });
    await expect(service.recommend("project-a", alice, { question: "¿Conviene cambiar la relación Categoria y Producto?", focus: "Categoria" })).resolves.toMatchObject({ requiresUmlChange: false, status: "READ_ONLY" });
    expect(recommend).not.toHaveBeenCalled();
    await expect(service.recommend("project-a", alice, { question: "¿Cómo generar el backend Spring desde el UML?" })).resolves.toMatchObject({ requiresUmlChange: false, needsClarification: false, confidence: 1 });
    expect(recommend).not.toHaveBeenCalled();
  });

  it("resuelve variantes verificables de generación Spring en español sin inventar hechos ni mutar el proyecto", async () => {
    const { service, recommend, stored } = setup();
    const snapshot = structuredClone(stored);
    for (const question of [
      "¿Qué debo tener en cuenta para que este modelo genere correctamente el backend Spring Boot?",
      "¿Qué recomendaciones hay para exportar Spring Boot?",
      "¿Cómo verificar la compatibilidad del UML con el generador Spring?",
      "¿Cómo preparar el modelo para la generación Spring Boot?",
    ]) {
      await expect(service.recommend("project-a", alice, { question })).resolves.toMatchObject({
        status: "READ_ONLY",
        problem: expect.stringMatching(/UML canónico válido y exportable/),
        alternatives: [expect.stringMatching(/^Validar/), expect.stringContaining("modelo relacional"), expect.stringMatching(/^Revisar/)],
        rationale: expect.stringContaining("pipeline verificado"),
        limitations: expect.stringContaining("No evalúa"),
        confidence: 1,
        needsClarification: false,
        requiresUmlChange: false,
        projectRevision: 5,
      });
    }
    expect(recommend).not.toHaveBeenCalled();
    expect(JSON.stringify(stored)).not.toMatch(/React|Node\.js|microservicios|Django|Laravel/i);
    expect(stored).toEqual(snapshot);
  });

  it("devuelve aclaración sin Qwen para elemento, relación, componente o pagos no verificables", async () => {
    const { service, recommend, memory, recorder } = setup();
    for (const request of [
      { question: "Describe la clase Factura" },
      { question: "Evalúa la relación Categoria y Factura" },
      { question: "Diseña el servicio Payments" },
      { question: "¿Cómo integro pagos?" },
    ]) await expect(service.recommend("project-a", alice, request)).resolves.toMatchObject({ status: "READ_ONLY", needsClarification: true, alternatives: [] });
    expect(recommend).not.toHaveBeenCalled();
    expect(memory.recent).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it("reutiliza memoria del mismo proyecto, conserva isStale y aísla proyectos", async () => {
    const stale = { question: "¿Cómo separar frontend y backend?", answer: "Mantén Next.js separado de NestJS.", projectRevision: 3, isStale: true };
    const { service, recommend, memory } = setup({ memory: [stale] });
    await expect(service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).resolves.toMatchObject({ limitations: expect.stringContaining("podría estar desactualizada") });
    expect(recommend).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), [stale]);
    const other = setup({ project: { ...project(7), id: "project-b", name: "Otro" } });
    await other.service.recommend("project-b", alice, { question: "¿Cómo separar frontend y backend?" });
    expect(other.memory.recent).toHaveBeenCalledWith("project-b", 7);
    expect(memory.recent).toHaveBeenCalledWith("project-a", 5);
  });

  it("resuelve directamente una relación verificable, conserva la advertencia stale y no invoca Qwen", async () => {
    const stale = { question: "¿Cómo modelar Producto y Categoria?", answer: "La asociación Categoria-Producto usa 1..1 y 0..*.", projectRevision: 3, isStale: true };
    const { service, recommend } = setup({ memory: [stale] });
    await expect(service.recommend("project-a", alice, { question: "¿Qué recomendás para modelar correctamente la relación entre Producto y Categoria?" })).resolves.toMatchObject({
      alternatives: ["Mantener la asociación Categoria-Producto con las multiplicidades verificadas."],
      rationale: "La asociación define Producto 0..* por Categoria y Categoria 1..1 por Producto.",
      limitations: expect.stringContaining("podría estar desactualizada"),
      requiresUmlChange: false,
    });
    expect(recommend).not.toHaveBeenCalled();
  });

  it("recomienda en español un atributo ausente como cambio futuro sin invocar Qwen ni mutar UML", async () => {
    const { service, recommend, stored } = setup();
    const snapshot = structuredClone(stored);
    await expect(service.recommend("project-a", alice, { question: "¿Qué recomendás si quiero agregar un teléfono de contacto a Producto?" })).resolves.toMatchObject({
      problem: "El atributo teléfono de contacto no existe actualmente en la clase Producto.",
      alternatives: ["Se recomienda agregar teléfono de contacto a Producto como un cambio UML futuro."],
      rationale: "Este cambio implicaría agregar teléfono de contacto a Producto, sin modificar el modelo en esta recomendación.",
      requiresUmlChange: true,
      needsClarification: false,
      confidence: 1,
    });
    expect(recommend).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
  });

  it("preserva tipo y multiplicidades reales para relaciones canónicas sin inventar agregación o composición", async () => {
    for (const relationshipType of ["Aggregation", "Composition", "Generalization"] as const) {
      const { service, recommend } = setup({ project: project(5, relationshipType) });
      await expect(service.recommend("project-a", alice, { question: "¿Cómo modelar la relación entre Categoria y Producto?" })).resolves.toMatchObject({
        problem: expect.stringContaining(relationshipType),
        alternatives: [expect.stringContaining(relationshipType.toLocaleLowerCase("es"))],
        rationale: expect.stringContaining("Producto 0..* por Categoria"),
        requiresUmlChange: false,
      });
      expect(recommend).not.toHaveBeenCalled();
    }
  });

  it("mantiene el UML intacto cuando resuelve directamente una relación verificable", async () => {
    const stale = { question: "¿Cómo modelar Producto y Categoria?", answer: "Una revisión anterior sugirió otra multiplicidad.", projectRevision: 3, isStale: true };
    const recommend = vi.fn().mockRejectedValue(new RecoverableRecommendationOutputError());
    const { service, stored } = setup({ memory: [stale], provider: { recommend } });
    const snapshot = structuredClone(stored);
    await expect(service.recommend("project-a", alice, { question: "¿Qué recomendás para modelar correctamente la relación entre Producto y Categoria?" })).resolves.toMatchObject({
      problem: expect.stringContaining("Categoria y Producto"),
      alternatives: ["Mantener la asociación Categoria-Producto con las multiplicidades verificadas."],
      rationale: "La asociación define Producto 0..* por Categoria y Categoria 1..1 por Producto.",
      limitations: expect.stringContaining("podría estar desactualizada"),
      confidence: 1,
      needsClarification: false,
      requiresUmlChange: false,
    });
    expect(recommend).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
  });

  it("omite memoria UML irrelevante para arquitectura y conserva antecedentes UML pertinentes", async () => {
    const umlMemory = { question: "¿Cómo cambiar Categoria y Producto?", answer: "Revisar la asociación Categoria-Producto.", projectRevision: 5, isStale: false };
    const { service, recommend } = setup({ memory: [umlMemory] });
    await service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" });
    expect(recommend).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), []);

    await service.recommend("project-a", alice, { question: "¿Cómo organizar Categoria y Producto?" });
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it("autoriza antes de cargar memoria o proveedor y registra solo recomendaciones exitosas", async () => {
    const { service, identities, projects, memory, recommend, recorder } = setup();
    identities.resolve.mockRejectedValueOnce(new NotFoundException());
    await expect(service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).rejects.toBeInstanceOf(NotFoundException);
    expect(projects.findProject).not.toHaveBeenCalled();
    expect(memory.recent).not.toHaveBeenCalled();
    expect(recommend).not.toHaveBeenCalled();
    await service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" });
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-a", userId: "user-a", grounded: true, answer: expect.stringContaining("READ_ONLY") }));
  });

  it("no muta UML, layout o revisión ni usa un comando o persistencia de proyecto", async () => {
    const { service, stored, projects } = setup();
    const snapshot = structuredClone(stored);
    await service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" });
    expect(stored).toEqual(snapshot);
    expect(projects).toEqual(expect.objectContaining({ findProject: expect.any(Function) }));
    expect(Object.keys(projects)).toEqual(["findProject"]);
  });

  it("convierte salida inválida o proveedor ausente en el error controlado", async () => {
    const invalid = setup({ provider: { recommend: vi.fn().mockRejectedValue(new Error("invalid structured output")) } });
    await expect(invalid.service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(invalid.recommend).toHaveBeenCalledTimes(1);
    expect(invalid.recorder.record).not.toHaveBeenCalled();
    const absent = setup();
    absent.provider.recommend = undefined as never;
    await expect(absent.service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reintenta una sola vez tras una referencia técnica no verificada y acepta el segundo resultado", async () => {
    const recommend = vi.fn().mockRejectedValueOnce(new RecoverableTechnicalReferenceError()).mockResolvedValueOnce(draft);
    const { service } = setup({ provider: { recommend } });
    await expect(service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).resolves.toMatchObject({ status: "READ_ONLY", confidence: 0.8 });
    expect(recommend).toHaveBeenCalledTimes(2);
    expect(recommend.mock.calls[1]?.[4]).toContain("tecnologías no verificadas");
  });

  it("usa fallback verificado si ambos intentos violan únicamente el contexto técnico", async () => {
    const recommend = vi.fn().mockRejectedValue(new RecoverableTechnicalReferenceError());
    const { service, recorder } = setup({ provider: { recommend } });
    await expect(service.recommend("project-a", alice, { question: "¿Cómo separar frontend y backend?" })).resolves.toMatchObject({
      status: "READ_ONLY",
      confidence: 0.75,
      needsClarification: false,
      requiresUmlChange: false,
      alternatives: [expect.stringContaining("Next.js"), expect.stringContaining("PostgreSQL"), expect.stringContaining("Spring Boot")],
    });
    expect(recommend).toHaveBeenCalledTimes(2);
    expect(JSON.stringify((await recorder.record.mock.calls[0]?.[0]?.answer))).not.toMatch(/React|Node\.js|microservices/i);
  });

  it("no usa fallback fuera del dominio de arquitectura o cuando la guarda ya detectó contexto insuficiente", async () => {
    const unrelated = setup({ provider: { recommend: vi.fn().mockRejectedValue(new RecoverableTechnicalReferenceError()) } });
    await expect(unrelated.service.recommend("project-a", alice, { question: "¿Qué conviene para el modelo?" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(unrelated.recommend).toHaveBeenCalledTimes(2);

    const missing = setup({ provider: { recommend: vi.fn().mockRejectedValue(new RecoverableTechnicalReferenceError()) } });
    await expect(missing.service.recommend("project-a", alice, { question: "Describe la clase Factura" })).resolves.toMatchObject({ needsClarification: true });
    expect(missing.recommend).not.toHaveBeenCalled();
  });
});
