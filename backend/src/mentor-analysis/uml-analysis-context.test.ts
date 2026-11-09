import { mapToRelationalModel, type RelationalModel } from "@examen-sw1/relational-core";
import { validateCanonicalUmlModel, type CanonicalUmlModel, type Multiplicity, type UmlAttribute, type UmlClass, type UmlRelationship } from "@examen-sw1/uml-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRelationalFacts } from "./relational-facts";
import { buildUmlAnalysisContext, type UmlAnalysisContext } from "./uml-analysis-context";
import { buildUmlAnalysisFragment, type UmlAnalysisFocus } from "./uml-analysis-fragment";

// The real engines, wrapped to count calls and to read the mapper result the context consumed.
vi.mock("@examen-sw1/relational-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@examen-sw1/relational-core")>();
  return { ...actual, mapToRelationalModel: vi.fn(actual.mapToRelationalModel) };
});
vi.mock("@examen-sw1/uml-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@examen-sw1/uml-core")>();
  return { ...actual, validateCanonicalUmlModel: vi.fn(actual.validateCanonicalUmlModel) };
});
vi.mock("./uml-analysis-fragment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./uml-analysis-fragment")>();
  return { ...actual, buildUmlAnalysisFragment: vi.fn(actual.buildUmlAnalysisFragment) };
});
vi.mock("./relational-facts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./relational-facts")>();
  return { ...actual, buildRelationalFacts: vi.fn(actual.buildRelationalFacts) };
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M = (lower: number, upper: number | "unbounded"): Multiplicity => ({ lower, upper });
const ONE = M(1, 1);
const MANY = M(0, "unbounded");

const attribute = (n: number, name: string, type: "string" | "integer" = "string", extra: Partial<UmlAttribute> = {}): UmlAttribute => ({ id: id(n), name, visibility: "private", type: { kind: "primitive", name: type }, ...extra });
const klass = (n: number, name: string, attributes: UmlAttribute[]): UmlClass => ({ id: id(n), name, visibility: "public", attributes, operations: [] });
const entity = (n: number, name: string, more: UmlAttribute[] = []): UmlClass => klass(n, name, [attribute(n * 100, "id", "integer"), ...more]);
const association = (n: number, sourceId: number, targetId: number, sourceMultiplicity?: Multiplicity, targetMultiplicity?: Multiplicity, extra: Partial<UmlRelationship> = {}): UmlRelationship => ({
  id: id(n), type: "Association", sourceId: id(sourceId), targetId: id(targetId),
  ...(sourceMultiplicity ? { sourceMultiplicity } : {}), ...(targetMultiplicity ? { targetMultiplicity } : {}), ...extra,
});
const generalization = (n: number, childId: number, parentId: number): UmlRelationship => ({ id: id(n), type: "Generalization", sourceId: id(childId), targetId: id(parentId) });
const model = (classes: UmlClass[], relationships: UmlRelationship[]): CanonicalUmlModel => ({ classes, enumerations: [], packages: [], relationships });

const CLIENTE = 1, VENTA = 2, PRODUCTO = 3, CLIENTE_VIP = 5, PROVEEDOR = 7;
const cliente = (more: UmlAttribute[] = []) => entity(CLIENTE, "Cliente", [attribute(101, "nombre"), ...more]);
const venta = (more: UmlAttribute[] = []) => entity(VENTA, "Venta", [attribute(201, "total"), ...more]);
const producto = () => entity(PRODUCTO, "Producto");
const clienteVenta = (targetMultiplicity: Multiplicity = MANY) => model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, targetMultiplicity, { name: "realiza" })]);

function analyze(input: CanonicalUmlModel, focus: UmlAnalysisFocus): UmlAnalysisContext {
  const result = buildUmlAnalysisContext(input, focus);
  if (!result.ok) throw new Error(`Contexto no disponible: ${result.error.code}`);
  return result.context;
}
const codes = (items: ReadonlyArray<{ code: string }>) => items.map((item) => item.code);
const relationshipFact = (context: UmlAnalysisContext, n: number) => context.facts.relational.relationships.find((entry) => entry.relationshipId === id(n))!;
const expectValid = (input: CanonicalUmlModel) => expect(validateCanonicalUmlModel(input).diagnostics).toEqual([]);

beforeEach(() => vi.clearAllMocks());

describe("buildUmlAnalysisContext: foco y hechos", () => {
  it("T-01: una clase válida reúne su fragmento, sin diagnósticos, con sus hechos relacionales", () => {
    const input = clienteVenta();
    expectValid(input);
    const context = analyze(input, { kind: "class", id: id(CLIENTE) });

    expect(context.focus).toEqual({ kind: "class", id: id(CLIENTE) });
    expect(context.facts.uml.classes.map((entry) => [entry.id, entry.attributes.map((item) => item.name)])).toEqual([[id(CLIENTE), ["id", "nombre"]]]);
    expect(context.facts.uml.relatedClasses).toEqual([{ id: id(VENTA), name: "Venta" }]);
    expect(context.diagnostics).toEqual({ uml: [], relational: [] });
    expect(context.facts.relational.classes.find((entry) => entry.classId === id(CLIENTE))).toMatchObject({ status: "mapped", table: "cliente", primaryKey: "id" });
    expect(relationshipFact(context, 40).foreignKeys).toEqual([expect.objectContaining({ ownerTable: "venta", column: "cliente_id", references: expect.objectContaining({ table: "cliente", classId: id(CLIENTE) }) })]);
    expect(context.conflicts).toEqual([]);
    expect(context.summary).toEqual({ hasUmlErrors: false, hasRelationalErrors: false, relationalDerivable: true });
    // Fragment limitations are kept once, split by kind, and not repeated inside the UML facts.
    expect(codes(context.limitations.unsupportedFeatures)).toEqual(expect.arrayContaining(["INTERFACES_NOT_SUPPORTED", "NAVIGABILITY_NOT_SUPPORTED", "ROLE_NAMES_NOT_SUPPORTED", "OCL_CONSTRAINTS_NOT_SUPPORTED", "ABSTRACT_CLASSES_NOT_SUPPORTED"]));
    expect(context.limitations.editor).toEqual([]);
    expect(context.facts.uml).not.toHaveProperty("limitations");
    expect(context.facts.relational).not.toHaveProperty("diagnostics");
  });

  it("T-02: una asociación 1:N conserva sus extremos sin invertirlos y la FK física en el lado muchos", () => {
    const context = analyze(clienteVenta(), { kind: "relationship", id: id(40) });
    const [relationship] = context.facts.uml.relationships;

    expect(relationship!.source).toMatchObject({ elementId: id(CLIENTE), elementName: "Cliente", multiplicity: { specified: true, text: "1" } });
    expect(relationship!.target).toMatchObject({ elementId: id(VENTA), elementName: "Venta", multiplicity: { specified: true, text: "0..*" } });
    expect(relationshipFact(context, 40)).toMatchObject({ status: "mapped", strategy: "foreign-key", mapperCardinality: "ONE_TO_MANY" });
    expect(relationshipFact(context, 40).foreignKeys).toEqual([expect.objectContaining({ ownerTable: "venta", ownerClassId: id(VENTA), column: "cliente_id", nullable: false, references: { table: "cliente", classId: id(CLIENTE), column: "id" } })]);
  });

  it("T-03: el modelo completo incluye todos los elementos y todos los diagnósticos", () => {
    // Proveedor has no identifier (relational) and relationship 43 has an invalid multiplicity (UML).
    const input = model([cliente(), venta(), klass(PROVEEDOR, "Proveedor", [attribute(701, "razonSocial")])], [association(40, CLIENTE, VENTA, ONE, MANY), association(43, CLIENTE, VENTA, M(3, 1), MANY, { name: "devuelve" })]);
    const context = analyze(input, { kind: "model" });

    expect(context.facts.uml.classes.map((entry) => entry.id)).toEqual([id(CLIENTE), id(VENTA), id(PROVEEDOR)]);
    expect(context.facts.uml.relationships.map((entry) => entry.id)).toEqual([id(40), id(43)]);
    expect(context.diagnostics.uml.map((diagnostic) => [diagnostic.code, diagnostic.elementId])).toEqual([["UML_INVALID_MULTIPLICITY", id(43)]]);
    expect(context.diagnostics.relational.map((diagnostic) => [diagnostic.code, diagnostic.elementId])).toEqual(expect.arrayContaining([["REL_NO_PRIMARY_KEY", id(PROVEEDOR)]]));
    expect(context.summary).toEqual({ hasUmlErrors: true, hasRelationalErrors: true, relationalDerivable: false });
  });
});

describe("buildUmlAnalysisContext: resultados controlados", () => {
  it("T-04: un modelo vacío devuelve EMPTY_MODEL sin ejecutar el mapper", () => {
    const result = buildUmlAnalysisContext(model([], []), { kind: "model" });

    expect(result).toEqual({ ok: false, error: { code: "EMPTY_MODEL", message: expect.any(String) } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(mapToRelationalModel).not.toHaveBeenCalled();
    expect(validateCanonicalUmlModel).not.toHaveBeenCalled();
  });

  it("T-05: una clase eliminada devuelve CLASS_NOT_FOUND aunque otra clase tenga el mismo nombre", () => {
    // Cliente was deleted and recreated with a new id: the old focus must not resolve to the new class by name.
    const input = model([{ ...cliente(), id: id(11) }, venta()], []);
    const result = buildUmlAnalysisContext(input, { kind: "class", id: id(CLIENTE) });

    expect(result).toEqual({ ok: false, error: { code: "CLASS_NOT_FOUND", message: expect.any(String), elementId: id(CLIENTE) } });
    expect(mapToRelationalModel).not.toHaveBeenCalled();
  });

  it("T-06: una relación eliminada devuelve RELATIONSHIP_NOT_FOUND aunque otra relación tenga el mismo nombre y extremos", () => {
    const input = model([cliente(), venta()], [association(45, CLIENTE, VENTA, ONE, MANY, { name: "realiza" })]);
    const result = buildUmlAnalysisContext(input, { kind: "relationship", id: id(40) });

    expect(result).toEqual({ ok: false, error: { code: "RELATIONSHIP_NOT_FOUND", message: expect.any(String), elementId: id(40) } });
    expect(mapToRelationalModel).not.toHaveBeenCalled();
  });

  it("T-07: UML válido con relacional no derivable conserva el análisis UML", () => {
    const input = model([klass(CLIENTE, "Cliente", [attribute(101, "nombre")])], []);
    expectValid(input);
    const result = buildUmlAnalysisContext(input, { kind: "class", id: id(CLIENTE) });

    expect(result.ok).toBe(true);
    const context = (result as Extract<typeof result, { ok: true }>).context;
    expect(context.facts.uml.classes[0]).toMatchObject({ id: id(CLIENTE), name: "Cliente", attributes: [expect.objectContaining({ name: "nombre" })] });
    expect(context.diagnostics.uml).toEqual([]);
    expect(codes(context.diagnostics.relational)).toEqual(expect.arrayContaining(["REL_NO_PRIMARY_KEY"]));
    expect(context.facts.relational.classes[0]).toMatchObject({ status: "not-derivable", table: "cliente" });
    expect(context.facts.relational.mapperSuccess).toBe(false);
    expect(context.summary).toEqual({ hasUmlErrors: false, hasRelationalErrors: true, relationalDerivable: false });
  });

  it("T-08: una multiplicidad faltante conserva el diagnóstico relacional y la multiplicidad no especificada", () => {
    const context = analyze(model([cliente(), venta()], [association(40, CLIENTE, VENTA)]), { kind: "relationship", id: id(40) });

    expect(context.facts.uml.relationships[0]!.source.multiplicity).toEqual({ specified: false });
    expect(codes(context.diagnostics.relational)).toEqual(["REL_MISSING_MULTIPLICITY"]);
    expect(relationshipFact(context, 40)).toMatchObject({ status: "not-derivable", foreignKeys: [] });
    expect(context.summary.relationalDerivable).toBe(false);
  });
});

describe("buildUmlAnalysisContext: limitaciones del esquema", () => {
  it("T-09: 1..* conserva la limitación de mínimo no garantizado", () => {
    const context = analyze(clienteVenta(M(1, "unbounded")), { kind: "relationship", id: id(40) });

    expect(context.limitations.schema).toEqual([expect.objectContaining({ code: "MINIMUM_MULTIPLICITY_NOT_ENFORCED", elementId: id(40) })]);
    expect(codes(context.diagnostics.relational)).not.toContain("MINIMUM_MULTIPLICITY_NOT_ENFORCED");
  });

  it("T-10: 2..5 conserva el mínimo y el máximo no garantizados", () => {
    const context = analyze(clienteVenta(M(2, 5)), { kind: "relationship", id: id(40) });

    expect(codes(context.limitations.schema)).toEqual(["MINIMUM_MULTIPLICITY_NOT_ENFORCED", "MAXIMUM_MULTIPLICITY_NOT_ENFORCED"]);
  });
});

describe("buildUmlAnalysisContext: generalización", () => {
  it("T-11: una generalización JOINED conserva hija como source, padre como target y la FK de herencia", () => {
    const input = model([cliente(), entity(CLIENTE_VIP, "ClienteVip", [attribute(501, "descuento")])], [generalization(42, CLIENTE_VIP, CLIENTE)]);
    expectValid(input);
    const context = analyze(input, { kind: "relationship", id: id(42) });

    expect(context.facts.uml.relationships[0]).toMatchObject({ type: "Generalization", source: { elementId: id(CLIENTE_VIP), semanticRole: "child" }, target: { elementId: id(CLIENTE), semanticRole: "parent" } });
    expect(relationshipFact(context, 42)).toMatchObject({ status: "mapped", strategy: "joined-inheritance", mapperRelationRecords: 0, inheritance: { childTable: "cliente_vip", parentTable: "cliente", strategy: "JOINED" } });
    expect(relationshipFact(context, 42).mapperCardinality).toBeUndefined();
    expect(context.summary).toEqual({ hasUmlErrors: false, hasRelationalErrors: false, relationalDerivable: true });
  });

  it("T-12: una generalización con claves incompatibles conserva el contexto UML y los diagnósticos reales", () => {
    const child = klass(CLIENTE_VIP, "ClienteVip", [attribute(501, "codigo", "integer", { generationMetadata: { identifier: true } })]);
    const input = model([cliente(), child], [generalization(42, CLIENTE_VIP, CLIENTE)]);
    expectValid(input);
    const context = analyze(input, { kind: "relationship", id: id(42) });

    expect(context.facts.uml.relationships[0]).toMatchObject({ source: { semanticRole: "child" }, target: { semanticRole: "parent" } });
    expect(context.facts.uml.classes.map((entry) => entry.id)).toEqual([id(CLIENTE_VIP), id(CLIENTE)]);
    expect(codes(context.diagnostics.relational)).toEqual(["REL_JOINED_PRIMARY_KEY_MISMATCH"]);
    expect(relationshipFact(context, 42)).toMatchObject({ status: "not-derivable", foreignKeys: [] });
    expect(context.diagnostics.uml).toEqual([]);
  });
});

describe("buildUmlAnalysisContext: conflictos y diagnósticos", () => {
  it("T-13: conserva el conflicto de FK duplicadas como detección propia, fuera de los diagnósticos", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, MANY, { name: "compra" }), association(43, CLIENTE, VENTA, M(0, 1), MANY, { name: "devuelve" })]);
    const context = analyze(input, { kind: "relationship", id: id(40) });

    expect(context.conflicts).toEqual([expect.objectContaining({ code: "DUPLICATE_FOREIGN_KEY_COLUMN", table: "venta", column: "cliente_id", relationshipIds: [id(40), id(43)] })]);
    expect(relationshipFact(context, 40).conflicts).toEqual(["DUPLICATE_FOREIGN_KEY_COLUMN"]);
    expect(codes(context.diagnostics.relational)).not.toContain("DUPLICATE_FOREIGN_KEY_COLUMN");
    expect(context.summary.hasRelationalErrors).toBe(false);
  });

  it("T-14: un problema UML aparece una sola vez, desde el validador canónico", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, M(3, 1), MANY)]);
    const context = analyze(input, { kind: "relationship", id: id(40) });

    expect(codes(vi.mocked(mapToRelationalModel).mock.results[0]!.value.diagnostics)).toContain("REL_UML_UML_INVALID_MULTIPLICITY");
    expect(context.diagnostics.uml.map((diagnostic) => [diagnostic.code, diagnostic.elementId])).toEqual([["UML_INVALID_MULTIPLICITY", id(40)]]);
    expect(JSON.stringify(context)).not.toContain("REL_UML_");
  });

  it("T-15: el foco de clase excluye los diagnósticos de otras clases", () => {
    // Own attribute without name and invalid FK owner on its relationship: in scope.
    // Venta's attribute without name and Proveedor without identifier: out of scope.
    const input = model(
      [cliente([attribute(102, "")]), venta([attribute(202, "")]), klass(PROVEEDOR, "Proveedor", [attribute(701, "razonSocial")])],
      [association(40, CLIENTE, VENTA, ONE, MANY, { foreignKeyOwner: "BOTH" as "SOURCE" })],
    );
    const context = analyze(input, { kind: "class", id: id(CLIENTE) });

    expect(context.diagnostics.uml.map((diagnostic) => [diagnostic.code, diagnostic.elementId])).toEqual([["UML_REQUIRED_NAME", id(102)], ["UML_INVALID_FOREIGN_KEY_OWNER", id(40)]]);
    const relationalIds = context.diagnostics.relational.map((diagnostic) => diagnostic.elementId);
    expect(relationalIds).toContain(id(102));
    expect(relationalIds).not.toContain(id(202));
    expect(relationalIds).not.toContain(id(PROVEEDOR));
  });

  it("T-16: el foco de relación excluye otras relaciones y los problemas de sus extremos que no la afectan", () => {
    const input = model(
      [cliente([attribute(102, "")]), venta(), producto()],
      [association(40, CLIENTE, VENTA, ONE, MANY), association(43, CLIENTE, PRODUCTO, ONE, MANY, { foreignKeyOwner: "BOTH" as "SOURCE" })],
    );
    const context = analyze(input, { kind: "relationship", id: id(40) });

    expect(context.diagnostics.uml).toEqual([]);
    expect(context.facts.uml.relationships.map((entry) => entry.id)).toEqual([id(40)]);
    expect(context.diagnostics.relational.map((diagnostic) => diagnostic.elementId)).not.toContain(id(43));

    // An end whose id is duplicated cannot be identified unambiguously: that end diagnostic is kept.
    const duplicated = model([cliente(), venta([attribute(202, "codigo", "string")].map((entry) => ({ ...entry, id: id(CLIENTE) })))], [association(40, CLIENTE, VENTA, ONE, MANY)]);
    expect(analyze(duplicated, { kind: "relationship", id: id(40) }).diagnostics.uml.map((diagnostic) => [diagnostic.code, diagnostic.elementId])).toEqual([["UML_DUPLICATE_ID", id(CLIENTE)]]);
  });

  it("T-16b: una generalización conserva el ciclo de herencia de sus extremos", () => {
    const input = model([cliente(), entity(CLIENTE_VIP, "ClienteVip")], [generalization(42, CLIENTE_VIP, CLIENTE), generalization(46, CLIENTE, CLIENTE_VIP)]);
    const context = analyze(input, { kind: "relationship", id: id(42) });

    expect(codes(context.diagnostics.uml)).toEqual(["UML_INHERITANCE_CYCLE"]);
    expect([id(CLIENTE), id(CLIENTE_VIP)]).toContain(context.diagnostics.uml[0]!.elementId);
  });

  it("T-17: el foco de modelo incluye todos los diagnósticos UML y relacionales", () => {
    const input = model(
      [cliente([attribute(102, "")]), venta([attribute(202, "")]), klass(PROVEEDOR, "Proveedor", [attribute(701, "razonSocial")])],
      [association(40, CLIENTE, VENTA, ONE, MANY, { foreignKeyOwner: "BOTH" as "SOURCE" })],
    );
    const context = analyze(input, { kind: "model" });
    const relational: RelationalModel = vi.mocked(mapToRelationalModel).mock.results[0]!.value;

    expect(context.diagnostics.uml).toEqual(vi.mocked(validateCanonicalUmlModel).mock.results[0]!.value.diagnostics);
    expect(context.diagnostics.relational).toEqual(relational.diagnostics.filter((diagnostic) => !diagnostic.code.startsWith("REL_UML_")));
    expect(context.facts.uml.classes).toHaveLength(3);
  });
});

describe("buildUmlAnalysisContext: invariantes", () => {
  const richModel = () => model(
    [cliente(), venta(), producto(), klass(4, "DetalleVenta", [attribute(401, "cantidad")])],
    [association(40, CLIENTE, VENTA, ONE, M(1, "unbounded")), association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(4) })],
  );

  it("T-18: ejecuta cada motor una sola vez y no modifica el modelo, el fragmento ni el resultado del mapper", () => {
    const input = richModel();
    const before = structuredClone(input);

    buildUmlAnalysisContext(input, { kind: "model" });

    for (const engine of [buildUmlAnalysisFragment, mapToRelationalModel, buildRelationalFacts]) expect(engine).toHaveBeenCalledTimes(1);
    // mapToRelationalModel validates the model internally (that is where REL_UML_* comes from), so the total is two:
    // one call from the context and one inside the mapper, which this layer cannot avoid without changing relational-core.
    expect(validateCanonicalUmlModel).toHaveBeenCalledTimes(2);
    vi.mocked(validateCanonicalUmlModel).mockClear();
    mapToRelationalModel(before);
    expect(validateCanonicalUmlModel).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    buildUmlAnalysisContext(input, { kind: "model" });
    expect(input).toEqual(before);
    const fragmentResult = vi.mocked(buildUmlAnalysisFragment).mock.results[0]!.value;
    expect(fragmentResult).toEqual(buildUmlAnalysisFragment(before, { kind: "model" }));
    const relational = vi.mocked(mapToRelationalModel).mock.results[0]!.value;
    expect(relational).toEqual(mapToRelationalModel(before));
    expect(vi.mocked(buildRelationalFacts).mock.calls[0]).toEqual([(fragmentResult as Extract<typeof fragmentResult, { ok: true }>).fragment, relational]);
  });

  it("T-19: es determinista", () => {
    expect(buildUmlAnalysisContext(richModel(), { kind: "model" })).toEqual(buildUmlAnalysisContext(richModel(), { kind: "model" }));
    expect(buildUmlAnalysisContext(richModel(), { kind: "class", id: id(VENTA) })).toEqual(buildUmlAnalysisContext(richModel(), { kind: "class", id: id(VENTA) }));
  });

  it("T-20: el resultado es serializable a JSON sin pérdida", () => {
    const result = buildUmlAnalysisContext(richModel(), { kind: "model" });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
