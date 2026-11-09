import { createProjectDocument, type CanonicalUmlModel, type Multiplicity, type UmlAttribute, type UmlClass, type UmlRelationship } from "@examen-sw1/uml-core";
import { afterAll, describe, expect, it } from "vitest";
import { getAssistantConfig } from "../assistant/assistant.config";
import { QueuedLocalTextModel } from "../assistant/local-text-model";
import { NodeLlamaCppEngine } from "../assistant/node-llama-cpp-engine";
import { LocalQwenUmlAnalysisProvider } from "./local-qwen-uml-analysis.provider";
import { createUmlAnalysisAiProvider } from "./mentor-analysis.module";
import type { UmlAnalysisAiRequest, UmlAnalysisTextGenerator } from "./uml-analysis-ai.contracts";
import type { UmlAnalysisFocus } from "./uml-analysis-fragment";
import { UmlAnalysisService, type UmlAnalysisResponse } from "./uml-analysis.service";

// CU-2P-04, fase 4.7: real Qwen3 over the CU-2P-04 prompts. Same runtime as the assistant's real suite
// (NodeLlamaCppEngine + QueuedLocalTextModel from getAssistantConfig); skipped when ASSISTANT_MODEL_PATH is not set.
// The model is generative, so the checks are semantic invariants (real names present, inverted or invented facts
// absent, length bounds), never an exact text. No other LLM judges the answers.

const config = getAssistantConfig();
const describeQwenIntegration = config.modelPath ? describe : describe.skip;
const MODEL_LOAD_TIMEOUT_MS = 180_000;
const loadNodeLlamaCpp = () => import("node-llama-cpp");
// One generation may wait for the model load plus its own timeout.
const CASE_TIMEOUT_MS = MODEL_LOAD_TIMEOUT_MS + config.timeoutMs;
const TARGET_WORDS = 120;
const TOLERATED_WORDS = 160;

// ---------------------------------------------------------------------------------------------
// Models

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M = (lower: number, upper: number | "unbounded"): Multiplicity => ({ lower, upper });
const ONE = M(1, 1);
const ZERO_ONE = M(0, 1);
const MANY = M(0, "unbounded");
const attribute = (n: number, name: string, type: "string" | "integer" | "number" = "string", extra: Partial<UmlAttribute> = {}): UmlAttribute => ({ id: id(n), name, visibility: "private", type: { kind: "primitive", name: type }, ...extra });
const klass = (n: number, name: string, attributes: UmlAttribute[]): UmlClass => ({ id: id(n), name, visibility: "public", attributes, operations: [] });
const entity = (n: number, name: string, more: UmlAttribute[] = []): UmlClass => klass(n, name, [attribute(n * 100, "id", "integer"), ...more]);
const association = (n: number, sourceId: number, targetId: number, sourceMultiplicity?: Multiplicity, targetMultiplicity?: Multiplicity, extra: Partial<UmlRelationship> = {}): UmlRelationship => ({
  id: id(n), type: "Association", sourceId: id(sourceId), targetId: id(targetId),
  ...(sourceMultiplicity ? { sourceMultiplicity } : {}), ...(targetMultiplicity ? { targetMultiplicity } : {}), ...extra,
});
const model = (classes: UmlClass[], relationships: UmlRelationship[]): CanonicalUmlModel => ({ classes, enumerations: [], packages: [], relationships });

const CLIENTE = 1, PEDIDO = 2, USUARIO = 3, PERFIL = 4, ESTUDIANTE = 5, MATERIA = 6, PRODUCTO = 7, DETALLE = 8, CLIENTE_VIP = 9;
const cliente = () => entity(CLIENTE, "Cliente", [attribute(101, "nombre")]);
const pedido = () => entity(PEDIDO, "Pedido", [attribute(201, "total", "number")]);
const clientePedido = (targetMultiplicity: Multiplicity = MANY) => model([cliente(), pedido()], [association(40, CLIENTE, PEDIDO, ONE, targetMultiplicity, { name: "realiza" })]);

// ---------------------------------------------------------------------------------------------
// Text checks

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const NEGATION_BEFORE = /\b(no|sin|nunca|ni|tampoco)\b[^.;:]{0,25}$/;
const NEGATION_INSIDE = /\b(no|sin|nunca|ni|tampoco)\b/;

// Occurrences of `pattern` that are not negated, either just before ("no admite NULL") or inside the match
// ("el esquema no garantiza al menos uno"): a negated statement is not an affirmation.
function affirmations(text: string, pattern: RegExp): string[] {
  const normalized = normalize(text);
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return [...normalized.matchAll(global)]
    .filter((match) => !NEGATION_BEFORE.test(normalized.slice(Math.max(0, match.index - 40), match.index)) && !NEGATION_INSIDE.test(match[0]))
    .map((match) => match[0]);
}

const mentions = (text: string, pattern: RegExp) => pattern.test(normalize(text));

// ---------------------------------------------------------------------------------------------
// Pipeline: the real service and provider over the shared runtime; only project access and persistence are doubles.

type Metric = Readonly<{ caso: string; ms: number; promptChars: number; respuestaChars: number; palabras: number; recorte: boolean; sobre120: boolean }>;

describeQwenIntegration("CU-2P-04 con Qwen3 real local", () => {
  const engine = new NodeLlamaCppEngine({ modelPath: config.modelPath!, gpu: config.gpu, contextSize: config.contextSize, maxTokens: config.maxTokens }, loadNodeLlamaCpp);
  const sharedModel = new QueuedLocalTextModel(engine, { timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });
  const sent: UmlAnalysisAiRequest[] = [];
  // Records what reaches the model; the generation itself is the shared queue's.
  const recording: UmlAnalysisTextGenerator = {
    generateText: (request) => {
      sent.push(request);
      return sharedModel.generateText(request);
    },
  };
  const metrics: Metric[] = [];

  afterAll(async () => {
    if (metrics.length > 0) console.table(metrics);
    await sharedModel.dispose();
  });

  async function analyze(caso: string, uml: CanonicalUmlModel, focus: UmlAnalysisFocus): Promise<Readonly<{ response: UmlAnalysisResponse; text: string; request: UmlAnalysisAiRequest }>> {
    const document = { ...createProjectDocument({ id: id(900), now: new Date("2026-11-09T00:00:00.000Z") }), uml };
    const service = new UmlAnalysisService(
      { requireView: async () => "VIEWER" },
      { findProject: async () => ({ revision: 1, document }) },
      new LocalQwenUmlAnalysisProvider(recording),
    );
    const before = sent.length;
    const started = performance.now();
    const response = await service.analyze("11111111-1111-4111-8111-111111111111", "real-qwen", focus);
    const ms = Math.round(performance.now() - started);
    expect(sent.length - before, `${caso}: el modelo debe recibir exactamente una petición`).toBe(1);
    const request = sent[sent.length - 1]!;
    const text = response.explanation?.text ?? "";
    metrics.push({ caso, ms, promptChars: request.systemPrompt.length + request.userPrompt.length, respuestaChars: text.length, palabras: words(text), recorte: response.explanation?.contextTruncation.truncated ?? false, sobre120: words(text) > TARGET_WORDS });
    expectWellFormed(caso, text, request);
    return { response, text, request };
  }

  // Shared invariants of any answer: non-empty Spanish text, brief, no JSON, no reasoning, no prompt echo.
  function expectWellFormed(caso: string, text: string, request: UmlAnalysisAiRequest): void {
    const context = `${caso}\n--- respuesta ---\n${text}`;
    expect(text.trim().length, context).toBeGreaterThan(0);
    expect(words(text), context).toBeLessThanOrEqual(TOLERATED_WORDS);
    expect(mentions(text, /\b(el|la|los|las|de|cada|una?|que)\b/), context).toBe(true);
    expect(/^\s*[[{]/.test(text), context).toBe(false);
    expect(/<\/?think>/i.test(text), context).toBe(false);
    for (const echoed of ["HECHOS RELACIONALES", "HECHOS UML", "Eres el Mentor IA", request.systemPrompt.split("\n")[2]!]) expect(text.includes(echoed), context).toBe(false);
  }

  const expectAbsent = (caso: string, text: string, patterns: readonly RegExp[]) => {
    for (const pattern of patterns) expect(affirmations(text, pattern), `${caso}: afirma ${pattern}\n--- respuesta ---\n${text}`).toEqual([]);
  };
  const expectPresent = (caso: string, text: string, pattern: RegExp) => expect(mentions(text, pattern), `${caso}: falta ${pattern}\n--- respuesta ---\n${text}`).toBe(true);

  // Facts of Cliente 1 — 0..* Pedido that hold in both orientations.
  function expectClientePedidoFacts(caso: string, text: string): void {
    expectPresent(caso, text, /\bcliente/);
    expectPresent(caso, text, /\bpedido/);
    expectPresent(caso, text, /cliente_id/);
    expectAbsent(caso, text, [
      // An FK column in cliente (pedido_id) would be on the wrong table or an invented inverse FK.
      /pedido_id/,
      // Nullable FK.
      /(acepta|admite|permite|puede (ser|tener|contener))\s+(valores?\s+)?null/,
      /nullable:?\s+si\b/,
      // Inverted multiplicities inside one clause: many Clientes per Pedido, or exactly one Pedido per Cliente.
      /(cada|un|una) pedido[^.,;]{0,40}(0\.\.\*|varios clientes|muchos clientes|multiples clientes)/,
      /(cada|un) cliente[^.,;]{0,40}(exactamente un|un unico|un solo|solo un) pedido/,
      // Attributes that do not exist (specific names only, to avoid false positives on common words).
      /\b(telefono|direccion|correo|email|fecha_pedido)\b/,
    ]);
  }

  it("1:N Cliente 1 — 0..* Pedido respeta extremos, FK y nulabilidad en 3 repeticiones", async () => {
    for (let run = 1; run <= 3; run += 1) {
      const { text, request } = await analyze(`1:N (repetición ${run})`, clientePedido(), { kind: "relationship", id: id(40) });
      expect(request.userPrompt).toContain("Por cada Cliente: 0..* Pedido.");
      expect(request.userPrompt).toContain("Por cada Pedido: 1 Cliente.");
      expect(request.userPrompt).toContain("FK pedido.cliente_id → cliente.id; nullable: no;");
      expectClientePedidoFacts(`1:N (repetición ${run})`, text);
    }
  }, 3 * CASE_TIMEOUT_MS);

  it("con Pedido como source y Cliente como target la explicación no se invierte", async () => {
    const inverted = model([cliente(), pedido()], [association(40, PEDIDO, CLIENTE, MANY, ONE, { name: "realiza" })]);
    const { text, request } = await analyze("1:N invertida", inverted, { kind: "relationship", id: id(40) });

    expect(request.userPrompt).toContain("Pedido [0..*] — [1] Cliente.");
    expect(request.userPrompt).toContain("FK pedido.cliente_id → cliente.id");
    expectClientePedidoFacts("1:N invertida", text);
  }, CASE_TIMEOUT_MS);

  it("1:1 Usuario 1 — 0..1 Perfil con foreignKeyOwner explícito", async () => {
    const input = model([entity(USUARIO, "Usuario", [attribute(301, "nombre")]), entity(PERFIL, "Perfil", [attribute(401, "biografia")])], [association(41, USUARIO, PERFIL, ONE, ZERO_ONE, { foreignKeyOwner: "TARGET" })]);
    const { text, request } = await analyze("1:1", input, { kind: "relationship", id: id(41) });

    expect(request.userPrompt).toContain("FK perfil.usuario_id → usuario.id; nullable: no; única: sí");
    expectPresent("1:1", text, /usuario_id/);
    expectPresent("1:1", text, /(0\.\.1|opcional|como maximo un|a lo sumo un|cero o un|puede no tener|no siempre)/);
    expectAbsent("1:1", text, [/perfil_id/]);
  }, CASE_TIMEOUT_MS);

  it("N:M Estudiante 0..* — 0..* Materia describe la tabla intermedia sin inventar una PK compuesta", async () => {
    const input = model([entity(ESTUDIANTE, "Estudiante"), entity(MATERIA, "Materia")], [association(42, ESTUDIANTE, MATERIA, MANY, MANY, { name: "cursa" })]);
    const { text, request } = await analyze("N:M", input, { kind: "relationship", id: id(42) });

    expect(request.userPrompt).toContain("tabla intermedia estudiante_materia_cursa");
    expectPresent("N:M", text, /(tabla intermedia|estudiante_materia_cursa|tabla de union|tabla de enlace)/);
    expectPresent("N:M", text, /estudiante_id/);
    expectPresent("N:M", text, /materia_id/);
    expectAbsent("N:M", text, [/(clave primaria|pk) compuesta/]);
  }, CASE_TIMEOUT_MS);

  it("N:M con clase asociativa DetallePedido usa su tabla y no inventa otra", async () => {
    const detalle = klass(DETALLE, "DetallePedido", [attribute(801, "cantidad", "integer"), attribute(802, "precioUnitario", "number")]);
    const input = model([pedido(), entity(PRODUCTO, "Producto"), detalle], [association(43, PEDIDO, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) })]);
    const { text, request } = await analyze("N:M asociativa", input, { kind: "relationship", id: id(43) });

    expect(request.userPrompt).toContain("tabla de la clase asociativa detalle_pedido");
    expectPresent("N:M asociativa", text, /(detallepedido|detalle_pedido)/);
    expectAbsent("N:M asociativa", text, [/pedido_producto/, /\b(subtotal|descuento|impuesto)\b/]);
  }, CASE_TIMEOUT_MS);

  it("Generalization ClienteVip → Cliente: hija, padre y JOINED sin invertir la flecha", async () => {
    const input = model([cliente(), entity(CLIENTE_VIP, "ClienteVip", [attribute(901, "descuento", "number")])], [{ id: id(44), type: "Generalization", sourceId: id(CLIENTE_VIP), targetId: id(CLIENTE) }]);
    const { text } = await analyze("Generalization", input, { kind: "relationship", id: id(44) });

    expectPresent("Generalization", text, /joined/);
    expectPresent("Generalization", text, /(clientevip[^.]{0,60}(hija|hereda|subclase|especializ)|cliente[^.]{0,40}(padre|superclase|base))/);
    expectAbsent("Generalization", text, [/\bcliente\b[^.]{0,20}(hereda de|es (una )?(subclase|hija) de) clientevip/, /clientevip[^.]{0,20}es (la )?(clase )?(padre|superclase)/]);
  }, CASE_TIMEOUT_MS);

  it("relacional no derivable: la relación existe, la FK no se inventa y se nombra la falta de identificador", async () => {
    const input = model([klass(CLIENTE, "Cliente", [attribute(101, "nombre")]), klass(PEDIDO, "Pedido", [attribute(201, "total", "number")])], [association(40, CLIENTE, PEDIDO, ONE, MANY)]);
    const { text, response, request } = await analyze("no derivable", input, { kind: "relationship", id: id(40) });

    expect(response.analysis!.summary.relationalDerivable).toBe(false);
    expect(request.userPrompt).toContain("REL_RELATIONSHIP_REQUIRES_PRIMARY_KEY");
    expectPresent("no derivable", text, /(no (es )?derivable|no (se )?puede|no es posible|no se genera|no se pudo|incomplet)/);
    expectPresent("no derivable", text, /(identificador|clave primaria|\bpk\b|primary key|rel_relationship_requires_primary_key|rel_no_primary_key)/);
    expectAbsent("no derivable", text, [/\w+_id\b/]);
  }, CASE_TIMEOUT_MS);

  it("multiplicidad no especificada: se declara sin especificar y no se asume 1", async () => {
    const { text } = await analyze("sin multiplicidad", model([cliente(), pedido()], [association(40, CLIENTE, PEDIDO)]), { kind: "relationship", id: id(40) });

    expectPresent("sin multiplicidad", text, /(sin especificar|no (esta |estan )?especificad|no (se )?(define|indica|especifica)|no tiene multiplicidad|no declara)/);
    expectAbsent("sin multiplicidad", text, [/por cada (cliente|pedido)[^.]{0,20}\b(1|un|una|exactamente)\b/]);
  }, CASE_TIMEOUT_MS);

  it("1..*: distingue la semántica UML de lo que garantiza el esquema", async () => {
    const { text, request } = await analyze("1..*", clientePedido(M(1, "unbounded")), { kind: "relationship", id: id(40) });

    expect(request.userPrompt).toContain("no lo garantiza");
    expectPresent("1..*", text, /(1\.\.\*|al menos un|como minimo un)/);
    expectPresent("1..*", text, /(no (lo )?garantiza|no se garantiza|no (esta |queda )?garantizad|no asegura|no impone|no obliga)/);
    expectAbsent("1..*", text, [/(esquema|sql|base de datos|tabla)[^.]{0,20}(garantiza|asegura)[^.]{0,20}(al menos|como minimo)/]);
  }, CASE_TIMEOUT_MS);

  it("2..5: reconoce mínimo 2, máximo 5 y que el esquema no garantiza esos límites", async () => {
    const { text } = await analyze("2..5", clientePedido(M(2, 5)), { kind: "relationship", id: id(40) });

    expectPresent("2..5", text, /(2\.\.5|minimo (de )?(2|dos)|al menos (2|dos))/);
    expectPresent("2..5", text, /(2\.\.5|maximo (de )?(5|cinco)|como maximo (5|cinco)|hasta (5|cinco))/);
    expectPresent("2..5", text, /(no (lo |los )?garantiza|no se garantiza|no (estan? |quedan? )?garantizad|no asegura|no impone|no controla)/);
  }, CASE_TIMEOUT_MS);

  it("característica no soportada: un atributo multivaluado se declara no representado y no se inventa navegabilidad", async () => {
    const input = model([entity(CLIENTE, "Cliente", [attribute(101, "nombre"), attribute(102, "telefonos", "string", { multiplicity: MANY })]), pedido()], [association(40, CLIENTE, PEDIDO, ONE, MANY)]);
    const { text, request } = await analyze("no soportado", input, { kind: "class", id: id(CLIENTE) });

    expect(request.userPrompt).toContain("no hay estructura relacional de colección");
    expectPresent("no soportado", text, /telefonos/);
    expectPresent("no soportado", text, /(no (hay|existe|se (genera|crea|representa))|solo (una|1) columna|escalar|no (es |esta )?soportad|no se puede representar|limitacion)/);
    expectAbsent("no soportado", text, [/(es |son )navegable/, /navegabilidad (desde|hacia|de) /]);
  }, CASE_TIMEOUT_MS);

  it("no inventa atributos: Cliente con nombre y correo", async () => {
    const input = model([entity(CLIENTE, "Cliente", [attribute(101, "nombre"), attribute(102, "correo")])], []);
    const { text } = await analyze("no inventa atributos", input, { kind: "class", id: id(CLIENTE) });

    expectPresent("no inventa atributos", text, /\bcliente\b/);
    expectAbsent("no inventa atributos", text, [/\b(telefono|direccion|edad|password|contrasena|apellidos?|fecha_nacimiento|dni)\b/]);
  }, CASE_TIMEOUT_MS);

  it("contexto recortado: explica el foco y no menciona elementos omitidos", async () => {
    const classes = Array.from({ length: 24 }, (_, c) => entity(100 + c, `Entidad${c}`, Array.from({ length: 5 }, (_, a) => attribute(20_000 + c * 10 + a, `campoE${c}A${a}`))));
    const relationships = Array.from({ length: 26 }, (_, r) => association(3000 + r, 100 + (r % 24), 100 + ((r * 5 + 1) % 24), ONE, MANY, { name: `vinculo${r}` }));
    const { text, response, request } = await analyze("contexto recortado", model(classes, relationships), { kind: "model" });

    expect(response.explanation!.contextTruncation.truncated).toBe(true);
    expect(request.userPrompt).toContain("CONTEXTO RECORTADO");
    // Names that exist in the model but were left out of the prompt must not appear in the answer.
    const omitted = [...relationships.map((entry) => entry.name!), ...classes.flatMap((entry) => entry.attributes.map((item) => item.name))].filter((name) => !request.userPrompt.includes(name));
    expect(omitted.length).toBeGreaterThan(0);
    for (const name of omitted) expect(text.includes(name), `contexto recortado: menciona ${name}, omitido del prompt\n--- respuesta ---\n${text}`).toBe(false);
  }, CASE_TIMEOUT_MS);

  it("CONTEXT_TOO_LARGE no llega al modelo", async () => {
    const huge = model([entity(CLIENTE, "Cliente", Array.from({ length: 400 }, (_, i) => attribute(10_000 + i, `atributoNumero${i}`)))], []);
    const before = sent.length;
    const service = new UmlAnalysisService({ requireView: async () => "VIEWER" }, { findProject: async () => ({ revision: 1, document: { ...createProjectDocument({ id: id(900) }), uml: huge } }) }, new LocalQwenUmlAnalysisProvider(recording));

    await expect(service.analyze("11111111-1111-4111-8111-111111111111", "real-qwen", { kind: "class", id: id(CLIENTE) })).resolves.toMatchObject({ explanation: null, diagnostic: "CONTEXT_TOO_LARGE" });
    expect(sent.length).toBe(before);
  });

  it("el wiring real del módulo usa el modelo compartido sin crear otro", async () => {
    const started = performance.now();
    const result = await createUmlAnalysisAiProvider(sharedModel).explain({ systemPrompt: "Responde en español con una sola frase.", userPrompt: "Di qué es una clase UML." });
    metrics.push({ caso: "wiring del módulo", ms: Math.round(performance.now() - started), promptChars: 64, respuestaChars: result.text.length, palabras: words(result.text), recorte: false, sobre120: words(result.text) > TARGET_WORDS });
    expect(result.text.trim().length).toBeGreaterThan(0);
  }, CASE_TIMEOUT_MS);
});
