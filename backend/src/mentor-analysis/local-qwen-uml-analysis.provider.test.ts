import { describe, expect, expectTypeOf, it } from "vitest";
import { LocalQwenUmlAnalysisProvider } from "./local-qwen-uml-analysis.provider";
import {
  UML_ANALYSIS_AI_PROVIDER,
  UmlAnalysisAiError,
  type UmlAnalysisAiProvider,
  type UmlAnalysisAiRequest,
  type UmlAnalysisTextGenerator,
} from "./uml-analysis-ai.contracts";

type GeneratorRequest = Parameters<UmlAnalysisTextGenerator["generateText"]>[0];

// Records every request and answers with a fixed output (or failure).
class FakeTextGenerator implements UmlAnalysisTextGenerator {
  readonly requests: GeneratorRequest[] = [];
  constructor(private readonly answer: () => Promise<unknown>) {}

  async generateText(request: GeneratorRequest): Promise<string> {
    this.requests.push(request);
    return this.answer() as Promise<string>;
  }
}

const answering = (value: unknown) => new FakeTextGenerator(async () => value);
const failing = (error: unknown) => new FakeTextGenerator(async () => { throw error; });

const request: UmlAnalysisAiRequest = {
  systemPrompt: "Eres el Mentor IA de ShareGrams.\nResponde en español.",
  userPrompt: "FOCO\nRelación (Asociación): Cliente — realiza — Pedido\n\nHECHOS UML\nCliente [1] — [0..*] Pedido.\nPor cada Cliente: 0..* Pedido.",
};

async function errorOf(promise: Promise<unknown>): Promise<UmlAnalysisAiError> {
  const error = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(UmlAnalysisAiError);
  return error as UmlAnalysisAiError;
}

describe("LocalQwenUmlAnalysisProvider", () => {
  it("T-01: entrega al generador exactamente el systemPrompt y el userPrompt recibidos", async () => {
    const generator = answering("Explicación.");
    await new LocalQwenUmlAnalysisProvider(generator).explain(request);

    expect(generator.requests).toEqual([{ systemPrompt: request.systemPrompt, userPrompt: request.userPrompt }]);
    expect(Object.keys(generator.requests[0]!).sort()).toEqual(["systemPrompt", "userPrompt"]);
  });

  it("T-02: devuelve { text } con la respuesta del generador", async () => {
    const result = await new LocalQwenUmlAnalysisProvider(answering("Resumen:\nCada Cliente realiza 0..* Pedido.")).explain(request);

    expect(result).toEqual({ text: "Resumen:\nCada Cliente realiza 0..* Pedido." });
  });

  it("T-03: no modifica el objeto request", async () => {
    const frozen = Object.freeze({ ...request });
    const before = structuredClone(frozen);

    await new LocalQwenUmlAnalysisProvider(answering("Explicación.")).explain(frozen);

    expect(frozen).toEqual(before);
  });

  it("T-04: llama a generateText exactamente una vez", async () => {
    const generator = answering("Explicación.");
    await new LocalQwenUmlAnalysisProvider(generator).explain(request);

    expect(generator.requests).toHaveLength(1);
  });

  it("T-05: una cadena vacía produce INVALID_OUTPUT", async () => {
    const error = await errorOf(new LocalQwenUmlAnalysisProvider(answering("")).explain(request));

    expect(error.code).toBe("INVALID_OUTPUT");
    expect(error.message).toBe("El modelo local no produjo una explicación utilizable.");
  });

  it("T-06: una respuesta con solo espacios o una salida no textual también produce INVALID_OUTPUT", async () => {
    for (const output of ["   \n\t  ", undefined, null, 42, { text: "x" }]) {
      expect((await errorOf(new LocalQwenUmlAnalysisProvider(answering(output)).explain(request))).code).toBe("INVALID_OUTPUT");
    }
  });

  it("T-07: un fallo del generador se propaga como GENERATION_FAILED, sin reintentos y sin exponer el detalle", async () => {
    const original = new Error("detalle interno: ruta C:/modelos/qwen.gguf");
    const generator = failing(original);

    const error = await errorOf(new LocalQwenUmlAnalysisProvider(generator).explain(request));

    expect(generator.requests).toHaveLength(1);
    expect(error.code).toBe("GENERATION_FAILED");
    expect(error.message).toBe("El modelo local no pudo generar la explicación.");
    expect(error.message).not.toContain("detalle interno");
    // The original failure is kept for server-side diagnosis, not hidden.
    expect(error.cause).toBe(original);
  });

  it("T-07b: un UmlAnalysisAiError del generador se propaga tal cual", async () => {
    const original = new UmlAnalysisAiError("INVALID_OUTPUT");
    expect(await errorOf(new LocalQwenUmlAnalysisProvider(failing(original)).explain(request))).toBe(original);
  });

  it("T-08: conserva tildes, multiplicidades, flechas y nombres técnicos", async () => {
    const text = "Implementación relacional: FK pedido.cliente_id → cliente.id; nullable: no. Multiplicidad 0..* y relación «realiza» — Observación: añadir índice único.";
    const generator = answering(`  ${text}\n`);

    const result = await new LocalQwenUmlAnalysisProvider(generator).explain(request);

    expect(result.text).toBe(text);
    expect(generator.requests[0]!.userPrompt).toBe(request.userPrompt);
  });

  it("T-09: no añade prefijos, sufijos, instrucciones ni JSON al prompt", async () => {
    const generator = answering("Explicación.");
    await new LocalQwenUmlAnalysisProvider(generator).explain(request);
    const sent = generator.requests[0]!;

    expect(sent.systemPrompt).toBe(request.systemPrompt);
    expect(sent.userPrompt).toBe(request.userPrompt);
    expect(sent.systemPrompt.length + sent.userPrompt.length).toBe(request.systemPrompt.length + request.userPrompt.length);
  });

  it("T-10: con el mismo generador y la misma entrada produce la misma salida", async () => {
    const provider = new LocalQwenUmlAnalysisProvider(answering("Explicación determinista."));

    expect(await provider.explain(request)).toEqual(await provider.explain(request));
  });

  it("los contratos son pequeños, serializables y propios de CU-2P-04", () => {
    expect(UML_ANALYSIS_AI_PROVIDER.description).toBe("UML_ANALYSIS_AI_PROVIDER");
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
    expectTypeOf<LocalQwenUmlAnalysisProvider>().toMatchTypeOf<UmlAnalysisAiProvider>();
  });

  it("es estructuralmente compatible con un generateText({ systemPrompt, userPrompt }): Promise<string>", async () => {
    // The shape the shared local model of CU-2P-01 exposes, written here from the audited signature: any object with
    // it satisfies the port without an adapter (checked by the compiler) and works at runtime.
    type SharedLocalTextModelShape = { generateText(request: Readonly<{ systemPrompt: string; userPrompt: string }>): Promise<string> };
    expectTypeOf<SharedLocalTextModelShape>().toMatchTypeOf<UmlAnalysisTextGenerator>();

    const shared: SharedLocalTextModelShape = { generateText: async ({ userPrompt }) => `Recibido ${userPrompt.length} caracteres.` };
    const port: UmlAnalysisTextGenerator = shared;
    expect(await new LocalQwenUmlAnalysisProvider(port).explain(request)).toEqual({ text: `Recibido ${request.userPrompt.length} caracteres.` });
  });
});
