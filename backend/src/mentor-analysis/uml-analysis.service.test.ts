import { ForbiddenException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { createProjectDocument, type CanonicalUmlModel, type Multiplicity, type ProjectDocument, type UmlAttribute, type UmlClass, type UmlRelationship } from "@examen-sw1/uml-core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ProjectAccessService } from "../projects/project-access.service";
import { InvalidProjectDocumentError, type ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { UmlAnalysisAiError, type UmlAnalysisAiProvider, type UmlAnalysisAiRequest } from "./uml-analysis-ai.contracts";
import { buildUmlAnalysisContext } from "./uml-analysis-context";
import type { UmlAnalysisFocus } from "./uml-analysis-fragment";
import { buildUmlAnalysisPrompt } from "./uml-analysis-prompt";
import { UmlAnalysisService, type UmlAnalysisProjectAccess, type UmlAnalysisProjectReader, type UmlAnalysisResponse } from "./uml-analysis.service";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M = (lower: number, upper: number | "unbounded"): Multiplicity => ({ lower, upper });
const ONE = M(1, 1);
const MANY = M(0, "unbounded");

const attribute = (n: number, name: string, type: "string" | "integer" = "string"): UmlAttribute => ({ id: id(n), name, visibility: "private", type: { kind: "primitive", name: type } });
const klass = (n: number, name: string, attributes: UmlAttribute[]): UmlClass => ({ id: id(n), name, visibility: "public", attributes, operations: [] });
const entity = (n: number, name: string, more: UmlAttribute[] = []): UmlClass => klass(n, name, [attribute(n * 100, "id", "integer"), ...more]);
const association = (n: number, sourceId: number, targetId: number, sourceMultiplicity: Multiplicity, targetMultiplicity: Multiplicity, extra: Partial<UmlRelationship> = {}): UmlRelationship => ({ id: id(n), type: "Association", sourceId: id(sourceId), targetId: id(targetId), sourceMultiplicity, targetMultiplicity, ...extra });
const model = (classes: UmlClass[], relationships: UmlRelationship[]): CanonicalUmlModel => ({ classes, enumerations: [], packages: [], relationships });

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-viewer";
const REVISION = 7;
const CLIENTE = 1, PEDIDO = 2, PROVEEDOR = 7;
const clientePedido = (extra: Partial<UmlRelationship> = { name: "realiza" }) => model([entity(CLIENTE, "Cliente", [attribute(101, "nombre")]), entity(PEDIDO, "Pedido", [attribute(201, "total")])], [association(40, CLIENTE, PEDIDO, ONE, MANY, extra)]);

function documentOf(uml: CanonicalUmlModel): ProjectDocument {
  const document = createProjectDocument({ id: id(900), now: new Date("2026-11-09T00:00:00.000Z") });
  return { ...document, revision: REVISION, uml, layout: { elements: [{ elementId: id(CLIENTE), x: 120, y: 80 }] } };
}

type Options = Readonly<{ uml?: CanonicalUmlModel; role?: string; answer?: string; providerError?: unknown; accessError?: unknown; project?: null }>;

// Small doubles: access, persistence (with write methods that must never be called) and the AI provider.
function setup(options: Options = {}) {
  const calls: string[] = [];
  const document = documentOf(options.uml ?? clientePedido());
  const access = {
    requireView: vi.fn(async () => {
      calls.push("requireView");
      if (options.accessError) throw options.accessError;
      return options.role ?? "VIEWER";
    }),
  };
  const persistence = {
    findProject: vi.fn(async () => {
      calls.push("findProject");
      return options.project === null ? null : { id: PROJECT_ID, name: "CRM", revision: REVISION, document };
    }),
    updateEditableProject: vi.fn(),
    createProject: vi.fn(),
    renameOwnedProject: vi.fn(),
    deleteOwnedProject: vi.fn(),
  };
  const provider = {
    explain: vi.fn(async (request: UmlAnalysisAiRequest) => {
      calls.push("explain");
      void request;
      if (options.providerError) throw options.providerError;
      return { text: options.answer ?? "Resumen: Cliente realiza 0..* Pedido." };
    }),
  };
  const service = new UmlAnalysisService(access, persistence, provider);
  return { service, access, persistence, provider, calls, document };
}

const analyze = (options: Options, focus: UmlAnalysisFocus) => {
  const doubles = setup(options);
  return { ...doubles, result: doubles.service.analyze(PROJECT_ID, USER_ID, focus) };
};

describe("UmlAnalysisService: flujo completo", () => {
  it("T-01: una clase válida pasa por autorización, carga, contexto, prompt e IA", async () => {
    const { result, access, persistence, provider } = analyze({}, { kind: "class", id: id(CLIENTE) });
    const response = await result;

    expect(access.requireView).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    expect(persistence.findProject).toHaveBeenCalledWith(PROJECT_ID);
    expect(provider.explain).toHaveBeenCalledTimes(1);
    expect(provider.explain.mock.calls[0]![0].userPrompt).toContain("Clase: Cliente");
    expect(response).toMatchObject({ projectRevision: REVISION, focus: { kind: "class", id: id(CLIENTE), name: "Cliente" }, explanation: { text: "Resumen: Cliente realiza 0..* Pedido.", contextTruncation: { truncated: false } } });
    expect(response.diagnostic).toBeUndefined();
    expect(response.analysis!.facts.uml.classes[0]!.name).toBe("Cliente");
  });

  it("T-02: en una relación 1:N el proveedor recibe el prompt compacto y la respuesta separa hechos y explicación", async () => {
    const { result, provider } = analyze({}, { kind: "relationship", id: id(40) });
    const response = await result;
    const expected = buildUmlAnalysisPrompt((buildUmlAnalysisContext(clientePedido(), { kind: "relationship", id: id(40) }) as Extract<ReturnType<typeof buildUmlAnalysisContext>, { ok: true }>).context);
    if (expected.status !== "ready") throw new Error("prompt");

    expect(provider.explain).toHaveBeenCalledWith({ systemPrompt: expected.systemPrompt, userPrompt: expected.userPrompt });
    expect(Object.keys(response).sort()).toEqual(["analysis", "explanation", "focus", "projectRevision"]);
    expect(Object.keys(response.analysis!).sort()).toEqual(["conflicts", "diagnostics", "facts", "limitations", "summary"]);
    expect(response.analysis!.facts.relational.relationships[0]!.foreignKeys[0]).toMatchObject({ ownerTable: "pedido", column: "cliente_id", nullable: false });
    expect(response.explanation!.text).toBe("Resumen: Cliente realiza 0..* Pedido.");
    // Neither the prompt nor provider internals reach the response.
    const json = JSON.stringify(response);
    for (const leaked of ["systemPrompt", "userPrompt", "HECHOS UML", "Eres el Mentor IA"]) expect(json).not.toContain(leaked);
  });

  it("T-03: el foco de modelo analiza el modelo completo", async () => {
    const response = await analyze({}, { kind: "model" }).result;

    expect(response.focus).toEqual({ kind: "model" });
    expect(response.analysis!.facts.uml.classes).toHaveLength(2);
    expect(response.explanation).not.toBeNull();
  });
});

describe("UmlAnalysisService: errores deterministas sin IA", () => {
  const expectNoAi = (doubles: ReturnType<typeof analyze>) => expect(doubles.provider.explain).not.toHaveBeenCalled();

  it("T-04: un modelo vacío devuelve EMPTY_MODEL sin llamar a la IA", async () => {
    const doubles = analyze({ uml: model([], []) }, { kind: "model" });

    expect(await doubles.result).toEqual({ projectRevision: REVISION, focus: { kind: "model" }, analysis: null, explanation: null, diagnostic: "EMPTY_MODEL" });
    expectNoAi(doubles);
  });

  it("T-05: una clase eliminada devuelve ELEMENT_NOT_FOUND sin resolver por nombre", async () => {
    // Cliente was recreated with another id: the old id must not reach it by name.
    const recreated = model([{ ...entity(CLIENTE, "Cliente"), id: id(11) }], []);
    const doubles = analyze({ uml: recreated }, { kind: "class", id: id(CLIENTE) });

    expect(await doubles.result).toEqual({ projectRevision: REVISION, focus: { kind: "class", id: id(CLIENTE) }, analysis: null, explanation: null, diagnostic: "ELEMENT_NOT_FOUND" });
    expectNoAi(doubles);
  });

  it("T-06: una relación eliminada devuelve ELEMENT_NOT_FOUND", async () => {
    const doubles = analyze({}, { kind: "relationship", id: id(45) });

    expect(await doubles.result).toEqual({ projectRevision: REVISION, focus: { kind: "relationship", id: id(45) }, analysis: null, explanation: null, diagnostic: "ELEMENT_NOT_FOUND" });
    expectNoAi(doubles);
  });

  it("T-07: un ID inválido devuelve INVALID_FOCUS_ID", async () => {
    const doubles = analyze({}, { kind: "class", id: "no-es-un-uuid" });

    expect(await doubles.result).toMatchObject({ analysis: null, explanation: null, diagnostic: "INVALID_FOCUS_ID" });
    expectNoAi(doubles);
  });

  it("T-08: una referencia inconsistente devuelve INCONSISTENT_REFERENCE", async () => {
    // The double bypasses persistence validation to reproduce a relationship whose target no longer exists.
    const broken = model([entity(CLIENTE, "Cliente")], [association(40, CLIENTE, PEDIDO, ONE, MANY)]);
    const doubles = analyze({ uml: broken }, { kind: "relationship", id: id(40) });

    expect(await doubles.result).toMatchObject({ analysis: null, explanation: null, diagnostic: "INCONSISTENT_REFERENCE" });
    expectNoAi(doubles);
  });

  it("T-09: con CONTEXT_TOO_LARGE conserva el análisis determinista y no llama a la IA", async () => {
    const huge = model([entity(CLIENTE, "Cliente", Array.from({ length: 400 }, (_, i) => attribute(10_000 + i, `atributoNumero${i}`)))], []);
    const doubles = analyze({ uml: huge }, { kind: "class", id: id(CLIENTE) });
    const response = await doubles.result;

    expect(response).toMatchObject({ projectRevision: REVISION, focus: { kind: "class", id: id(CLIENTE), name: "Cliente" }, explanation: null, diagnostic: "CONTEXT_TOO_LARGE" });
    expect(response.analysis!.facts.uml.classes[0]!.attributes).toHaveLength(401);
    expectNoAi(doubles);
  });
});

describe("UmlAnalysisService: errores del proveedor y autorización", () => {
  it("T-10: un fallo del proveedor se convierte en 503 sin detalles internos", async () => {
    const cause = new Error("detalle interno: C:/modelos/qwen3.gguf");
    const error = await analyze({ providerError: new UmlAnalysisAiError("GENERATION_FAILED", { cause }) }, { kind: "relationship", id: id(40) }).result.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const exception = error as ServiceUnavailableException;
    expect(exception.getStatus()).toBe(503);
    expect(exception.getResponse()).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
    expect(JSON.stringify(exception.getResponse())).not.toMatch(/gguf|detalle interno|GENERATION_FAILED|stack/);
    // Kept only on the exception object, for server-side diagnosis.
    expect((exception.cause as UmlAnalysisAiError).cause).toBe(cause);
  });

  it("T-11: una salida inválida del proveedor sigue la misma política 503", async () => {
    const error = await analyze({ providerError: new UmlAnalysisAiError("INVALID_OUTPUT") }, { kind: "class", id: id(CLIENTE) }).result.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).message).toBe("El Mentor IA no está disponible en este momento.");
  });

  it("T-12: un usuario sin acceso falla en la autorización antes de cargar o analizar", async () => {
    const doubles = analyze({ accessError: new NotFoundException() }, { kind: "class", id: id(CLIENTE) });

    await expect(doubles.result).rejects.toBeInstanceOf(NotFoundException);
    expect(doubles.persistence.findProject).not.toHaveBeenCalled();
    expect(doubles.provider.explain).not.toHaveBeenCalled();
  });

  it("T-13: un VIEWER puede analizar", async () => {
    const response = await analyze({ role: "VIEWER" }, { kind: "class", id: id(CLIENTE) }).result;
    expect(response.explanation).not.toBeNull();
  });

  it("T-23: los errores de autorización, de proyecto inexistente o de documento inválido no se convierten en 503", async () => {
    await expect(analyze({ accessError: new ForbiddenException() }, { kind: "model" }).result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(analyze({ project: null }, { kind: "model" }).result).rejects.toBeInstanceOf(NotFoundException);

    const invalid = setup();
    invalid.persistence.findProject.mockRejectedValueOnce(new InvalidProjectDocumentError());
    await expect(invalid.service.analyze(PROJECT_ID, USER_ID, { kind: "model" })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(invalid.provider.explain).not.toHaveBeenCalled();
  });
});

describe("UmlAnalysisService: solo lectura y contrato", () => {
  it("T-14: devuelve exactamente la revisión cargada", async () => {
    for (const focus of [{ kind: "model" }, { kind: "class", id: id(99) }] as const) {
      expect((await analyze({}, focus).result).projectRevision).toBe(REVISION);
    }
  });

  it("T-15: no modifica el documento del proyecto", async () => {
    const doubles = setup();
    const before = structuredClone(doubles.document);

    await doubles.service.analyze(PROJECT_ID, USER_ID, { kind: "model" });
    await doubles.service.analyze(PROJECT_ID, USER_ID, { kind: "relationship", id: id(40) });

    expect(doubles.document).toEqual(before);
  });

  it("T-16: no invoca ningún método de guardado o actualización", async () => {
    const doubles = setup();
    await doubles.service.analyze(PROJECT_ID, USER_ID, { kind: "model" });

    for (const write of [doubles.persistence.updateEditableProject, doubles.persistence.createProject, doubles.persistence.renameOwnedProject, doubles.persistence.deleteOwnedProject]) expect(write).not.toHaveBeenCalled();
    // The dependency types expose no write method at all, and the real services satisfy them.
    expectTypeOf<UmlAnalysisProjectReader>().toEqualTypeOf<Readonly<{ findProject(id: string): Promise<Readonly<{ revision: number; document: ProjectDocument }> | null> }>>();
    expectTypeOf<ProjectsPersistenceService>().toMatchTypeOf<UmlAnalysisProjectReader>();
    expectTypeOf<ProjectAccessService>().toMatchTypeOf<UmlAnalysisProjectAccess>();
  });

  it("T-17: un relacional no derivable sigue siendo un análisis válido y la IA recibe sus diagnósticos", async () => {
    const withoutKey = model([klass(CLIENTE, "Cliente", [attribute(101, "nombre")])], []);
    const doubles = analyze({ uml: withoutKey }, { kind: "class", id: id(CLIENTE) });
    const response = await doubles.result;

    expect(response.diagnostic).toBeUndefined();
    expect(response.analysis!.summary.relationalDerivable).toBe(false);
    expect(response.explanation).not.toBeNull();
    expect(doubles.provider.explain.mock.calls[0]![0].userPrompt).toContain("REL_NO_PRIMARY_KEY");
  });

  it("T-18: contextTruncation se copia exactamente desde el prompt", async () => {
    const large = model(
      Array.from({ length: 30 }, (_, i) => entity(i + 10, `Clase${i}`, Array.from({ length: 6 }, (_, a) => attribute((i + 10) * 100 + a + 1, `campo${a}`)))),
      Array.from({ length: 32 }, (_, i) => association(5000 + i, (i % 30) + 10, ((i * 3 + 1) % 30) + 10, ONE, MANY, { name: `r${i}` })),
    );
    const expected = buildUmlAnalysisPrompt((buildUmlAnalysisContext(large, { kind: "model" }) as Extract<ReturnType<typeof buildUmlAnalysisContext>, { ok: true }>).context);
    if (expected.status !== "ready") throw new Error("prompt");

    const response = await analyze({ uml: large }, { kind: "model" }).result;

    expect(expected.contextTruncation.truncated).toBe(true);
    expect(response.explanation!.contextTruncation).toEqual(expected.contextTruncation);
  });

  it("T-19: el foco de clase lleva el nombre real de la clase", async () => {
    const renamed = model([entity(CLIENTE, "ClienteCorporativo"), entity(PROVEEDOR, "Proveedor")], []);
    expect((await analyze({ uml: renamed }, { kind: "class", id: id(CLIENTE) }).result).focus).toEqual({ kind: "class", id: id(CLIENTE), name: "ClienteCorporativo" });
  });

  it("T-20: una relación sin nombre recibe un nombre de presentación determinista que no se guarda en el modelo", async () => {
    const doubles = setup({ uml: clientePedido({}) });
    const response = await doubles.service.analyze(PROJECT_ID, USER_ID, { kind: "relationship", id: id(40) });

    expect(response.focus).toEqual({ kind: "relationship", id: id(40), name: "Cliente — Pedido" });
    expect(doubles.document.uml.relationships[0]).not.toHaveProperty("name");
    expect(response.analysis!.facts.uml.relationships[0]).not.toHaveProperty("name");

    const named = await analyze({}, { kind: "relationship", id: id(40) }).result;
    expect(named.focus.name).toBe("realiza");
    const inheritance = model([entity(CLIENTE, "Cliente"), entity(5, "ClienteVip")], [{ id: id(42), type: "Generalization", sourceId: id(5), targetId: id(CLIENTE) }]);
    expect((await analyze({ uml: inheritance }, { kind: "relationship", id: id(42) }).result).focus.name).toBe("ClienteVip → Cliente");
  });

  it("T-21: el proveedor se llama exactamente una vez", async () => {
    const doubles = analyze({}, { kind: "relationship", id: id(40) });
    await doubles.result;
    expect(doubles.provider.explain).toHaveBeenCalledTimes(1);
  });

  it("T-22: requireView ocurre antes que findProject y findProject antes que el proveedor", async () => {
    const doubles = analyze({}, { kind: "class", id: id(CLIENTE) });
    await doubles.result;
    expect(doubles.calls).toEqual(["requireView", "findProject", "explain"]);
  });

  it("T-24: es determinista con dobles idénticos", async () => {
    const first = await analyze({}, { kind: "model" }).result;
    const second = await analyze({}, { kind: "model" }).result;
    expect(second).toEqual(first);
  });

  it("T-25: la respuesta es serializable a JSON sin pérdida", async () => {
    const responses: UmlAnalysisResponse[] = [
      await analyze({}, { kind: "relationship", id: id(40) }).result,
      await analyze({ uml: model([], []) }, { kind: "model" }).result,
    ];
    for (const response of responses) expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });

  it("el proveedor solo recibe prompts: ni proyecto, ni usuario, ni modelo canónico", async () => {
    const doubles = analyze({}, { kind: "relationship", id: id(40) });
    await doubles.result;
    const request = doubles.provider.explain.mock.calls[0]![0];

    expect(Object.keys(request).sort()).toEqual(["systemPrompt", "userPrompt"]);
    expect(JSON.stringify(request)).not.toContain(PROJECT_ID);
    expect(JSON.stringify(request)).not.toContain(USER_ID);
    expectTypeOf<Parameters<UmlAnalysisAiProvider["explain"]>[0]>().toEqualTypeOf<UmlAnalysisAiRequest>();
  });
});
