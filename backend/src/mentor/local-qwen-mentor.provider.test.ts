import { describe, expect, it, vi } from "vitest";
import type { QueuedLocalTextModel } from "../assistant/local-text-model";
import { LocalQwenMentorProvider, RecoverableRecommendationOutputError } from "./local-qwen-mentor.provider";
import type { MentorProjectContext } from "./mentor.contracts";

describe("LocalQwenMentorProvider", () => {
  const completeRecommendation = { problem: "x", alternatives: ["a"], rationale: "Razón completa.", limitations: "l", confidence: 0.75, needsClarification: false, requiresUmlChange: false };
  it("envía al modelo las multiplicidades de asociación ya normalizadas", async () => {
    const generateText = vi.fn().mockResolvedValue("Respuesta fundamentada.");
    const provider = new LocalQwenMentorProvider({ generateText } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = {
      projectName: "Ventas",
      revision: 1,
      classes: [{ name: "Cliente", attributes: [] }, { name: "Pedido", attributes: [] }],
      enumerations: [],
      relationships: [{ type: "Association", source: "Cliente", target: "Pedido", sourceToTarget: "Por cada Cliente, existen 0..* instancias de Pedido relacionadas.", targetToSource: "Por cada Pedido, existen 1..1 instancias de Cliente relacionadas." }],
      elementNames: ["Cliente", "Pedido"],
    };

    await expect(provider.ask(context, "Describe la asociación")).resolves.toBe("Respuesta fundamentada.");
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining("nunca debes invertirlas"),
      userPrompt: expect.stringContaining("Por cada Cliente, existen 0..* instancias de Pedido relacionadas."),
    }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userPrompt: expect.stringContaining("Por cada Pedido, existen 1..1 instancias de Cliente relacionadas.") }));
    const request = generateText.mock.calls[0]?.[0];
    expect(`${request?.systemPrompt}\n${request?.userPrompt}`).not.toMatch(/user-a|alice@example\.test|OWNER/);
  });

  it("valida estrictamente la recomendación estructurada sin coerción", async () => {
    const generateStructured = vi.fn().mockResolvedValue(completeRecommendation);
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: ["Next.js y NestJS."], springExport: ["Spring Boot."] }, "¿Cómo separar frontend y backend?", [])).resolves.toMatchObject({ problem: "x", requiresUmlChange: false });
    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 384, schema: expect.objectContaining({ additionalProperties: false, required: expect.arrayContaining(["needsClarification"]), properties: expect.objectContaining({ confidence: { enum: [0, 0.25, 0.5, 0.75, 1] } }) }), systemPrompt: expect.stringContaining("CURRENT_ARCHITECTURE\nfrontend = Next.js\nbackend = NestJS\ndatabase = PostgreSQL\norm = Prisma") }));
    generateStructured.mockResolvedValueOnce({ problem: "x", alternatives: [], rationale: "r", limitations: "l", confidence: "alta", needsClarification: false, requiresUmlChange: false, extra: true });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
  });

  it("acepta envoltorios normales de Qwen solo cuando contienen un contrato válido", async () => {
    const generateStructured = vi.fn().mockResolvedValue('<think>razonamiento</think>\n```json\n{"problem":"x","alternatives":["a"],"rationale":"Razón completa.","limitations":"l","confidence":0.75,"needsClarification":false,"requiresUmlChange":false}\n```');
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ confidence: 0.75, requiresUmlChange: false });
    generateStructured.mockResolvedValueOnce('```json\n{"problem":"x"}\n```');
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
  });

  it("rechaza una salida truncada o un contrato con campo faltante", async () => {
    const generateStructured = vi.fn().mockResolvedValue('{"problem":"Separar capas","alternatives":["a"],"rationale":"r"');
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, needsClarification: undefined });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
  });

  it("rechaza alternativas serializadas como objetos JSON", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ ...completeRecommendation, alternatives: ['{"name":"Next.js","description":"UI"}'] });
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
  });

  it("deduplica alternativas equivalentes sin inventar ni reordenar opciones", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ ...completeRecommendation, alternatives: ["Mantener la asociación.", " mantener   la asociación. ", "Mantener las multiplicidades."] });
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ alternatives: ["Mantener la asociación.", "Mantener las multiplicidades."] });

    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, alternatives: ["Una opción.", "Una opción.", "Una opción."] });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ alternatives: ["Una opción."] });

    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, alternatives: ["Primera.", "Segunda.", "Tercera."] });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ alternatives: ["Primera.", "Segunda.", "Tercera."] });

    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, alternatives: ["Se recomienda agregar un nuevo atributo telefono a Producto.", "La propuesta sería añadir atributo teléfono a Producto."] });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ alternatives: ["Se recomienda agregar un nuevo atributo telefono a Producto."] });
  });

  it("requiere una razón completa y acotada", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ ...completeRecommendation, rationale: "La asociación conserva la multiplicidad 1..1 en el lado del" });
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, rationale: "La asociación conserva la multiplicidad 1..1 en el lado de Categoria." });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ rationale: "La asociación conserva la multiplicidad 1..1 en el lado de Categoria." });
  });

  it("rechaza inglés observado y lenguaje que simula una modificación aplicada", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ ...completeRecommendation, alternatives: ["We need to add a new attribute telefono."], rationale: "La recomendación mantiene el modelo actual." });
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, rationale: "Agregamos un nuevo atributo telefono al modelo UML." });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
  });

  it("mantiene el mismo dominio de confidence en grammar y contrato final", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ ...completeRecommendation, confidence: 0.75 });
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ confidence: 0.75 });
    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, confidence: 3 });
    await expect(provider.recommend(context, { architecture: [], springExport: [] }, "Pregunta", [])).rejects.toBeInstanceOf(RecoverableRecommendationOutputError);
  });

  it("rechaza stack no verificado como actual y permite alternativa futura explícita", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ ...completeRecommendation, alternatives: ["Usar React y Node.js como stack actual", "Adoptar microservicios"], rationale: "React y Node.js son la arquitectura actual." });
    const provider = new LocalQwenMentorProvider({ generateStructured } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = { projectName: "Ventas", revision: 1, classes: [{ name: "Producto", attributes: [] }], enumerations: [], relationships: [], elementNames: ["Producto"] };
    await expect(provider.recommend(context, { architecture: ["Next.js y NestJS."], springExport: [] }, "Pregunta", [])).rejects.toThrow("tecnología no verificada");
    generateStructured.mockResolvedValueOnce({ ...completeRecommendation, alternatives: ["Como alternativa futura, podrías evaluar microservicios si cambian los requisitos."], rationale: "El stack actual mantiene Next.js y NestJS." });
    await expect(provider.recommend(context, { architecture: ["Next.js y NestJS."], springExport: [] }, "Pregunta", [])).resolves.toMatchObject({ alternatives: [expect.stringContaining("alternativa futura")] });
  });
});
