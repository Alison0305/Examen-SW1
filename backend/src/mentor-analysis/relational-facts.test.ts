import { mapToRelationalModel, type RelationalModel } from "@examen-sw1/relational-core";
import { validateCanonicalUmlModel, type CanonicalUmlModel, type Multiplicity, type UmlAttribute, type UmlClass, type UmlRelationship } from "@examen-sw1/uml-core";
import { describe, expect, it } from "vitest";
import { buildRelationalFacts, type RelationalFacts, type RelationshipFact } from "./relational-facts";
import { buildUmlAnalysisFragment, type UmlAnalysisFocus, type UmlAnalysisFragment } from "./uml-analysis-fragment";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M = (lower: number, upper: number | "unbounded"): Multiplicity => ({ lower, upper });
const ONE = M(1, 1);
const ZERO_ONE = M(0, 1);
const MANY = M(0, "unbounded");

const attribute = (n: number, name: string, type: "string" | "integer" = "string", extra: Partial<UmlAttribute> = {}): UmlAttribute => ({ id: id(n), name, visibility: "private", type: { kind: "primitive", name: type }, ...extra });
const klass = (n: number, name: string, attributes: UmlAttribute[], extra: Partial<UmlClass> = {}): UmlClass => ({ id: id(n), name, visibility: "public", attributes, operations: [], ...extra });
// Classes with the conventional `id` identifier, so the mapper can create primary and foreign keys.
const entity = (n: number, name: string, more: UmlAttribute[] = []): UmlClass => klass(n, name, [attribute(n * 100, "id", "integer"), ...more]);
const association = (n: number, sourceId: number, targetId: number, sourceMultiplicity?: Multiplicity, targetMultiplicity?: Multiplicity, extra: Partial<UmlRelationship> = {}): UmlRelationship => ({
  id: id(n), type: "Association", sourceId: id(sourceId), targetId: id(targetId),
  ...(sourceMultiplicity ? { sourceMultiplicity } : {}), ...(targetMultiplicity ? { targetMultiplicity } : {}), ...extra,
});
const model = (classes: UmlClass[], relationships: UmlRelationship[]): CanonicalUmlModel => ({ classes, enumerations: [], packages: [], relationships });

const CLIENTE = 1, VENTA = 2, PRODUCTO = 3, DETALLE = 4, CLIENTE_VIP = 5, EMPLEADO = 6, PROVEEDOR = 7;
const cliente = () => entity(CLIENTE, "Cliente", [attribute(101, "nombre")]);
const venta = () => entity(VENTA, "Venta", [attribute(201, "total")]);
const producto = () => entity(PRODUCTO, "Producto");

type Built = { facts: RelationalFacts; relational: RelationalModel; fragment: UmlAnalysisFragment };

function analyze(input: CanonicalUmlModel, focus: UmlAnalysisFocus): Built {
  const result = buildUmlAnalysisFragment(input, focus);
  if (!result.ok) throw new Error(`Fragmento no disponible: ${result.error.code}`);
  // The caller maps the whole canonical model once; the facts builder only reads that result.
  const relational = mapToRelationalModel(input);
  return { facts: buildRelationalFacts(result.fragment, relational), relational, fragment: result.fragment };
}

const relationship = (facts: RelationalFacts, n: number): RelationshipFact => {
  const found = facts.relationships.find((entry) => entry.relationshipId === id(n));
  if (!found) throw new Error(`Sin hechos para la relación ${n}`);
  return found;
};
const codes = (items: ReadonlyArray<{ code: string }>) => items.map((item) => item.code);
const expectValid = (input: CanonicalUmlModel) => expect(validateCanonicalUmlModel(input).diagnostics).toEqual([]);

describe("buildRelationalFacts: 1:N", () => {
  const oneToMany = (sourceMultiplicity = ONE) => model([cliente(), venta()], [association(40, CLIENTE, VENTA, sourceMultiplicity, MANY, { name: "realiza" })]);

  it("T-01: Cliente 1 — 0..* Venta coloca una FK NOT NULL en la tabla del lado muchos", () => {
    const input = oneToMany();
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(40) }).facts, 40);

    expect(fact).toMatchObject({ status: "mapped", strategy: "foreign-key", mapperCardinality: "ONE_TO_MANY", mapperRelationRecords: 1, foreignKeyPlacement: "multiplicity", reasons: [], notEnforcedBySchema: [], conflicts: [] });
    expect(fact.foreignKeys).toEqual([{
      name: "fk_venta_cliente_id", ownerTable: "venta", ownerClassId: id(VENTA), column: "cliente_id",
      references: { table: "cliente", classId: id(CLIENTE), column: "id" }, nullable: false, unique: false, lifecycle: "NONE",
    }]);
  });

  it("T-02: con el extremo Cliente en 0..1 la FK admite NULL", () => {
    const fact = relationship(analyze(oneToMany(ZERO_ONE), { kind: "relationship", id: id(40) }).facts, 40);
    expect(fact.foreignKeys[0]).toMatchObject({ ownerTable: "venta", column: "cliente_id", nullable: true });
  });

  it("T-03: invertir source y target no cambia los hechos físicos, solo la cardinalidad del mapper", () => {
    const direct = relationship(analyze(oneToMany(), { kind: "relationship", id: id(40) }).facts, 40);
    const inverted = relationship(analyze(model([cliente(), venta()], [association(40, VENTA, CLIENTE, MANY, ONE, { name: "realiza" })]), { kind: "relationship", id: id(40) }).facts, 40);

    expect(inverted.foreignKeys).toEqual(direct.foreignKeys);
    expect(inverted.notEnforcedBySchema).toEqual(direct.notEnforcedBySchema);
    expect([direct.mapperCardinality, inverted.mapperCardinality]).toEqual(["ONE_TO_MANY", "MANY_TO_ONE"]);
  });
});

describe("buildRelationalFacts: 1:1", () => {
  it("T-04: con foreignKeyOwner TARGET la FK única va en la tabla target por decisión explícita", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, ONE, { foreignKeyOwner: "TARGET" })]);
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(40) }).facts, 40);

    expect(fact).toMatchObject({ status: "mapped", strategy: "foreign-key", mapperCardinality: "ONE_TO_ONE", foreignKeyPlacement: "explicit-owner" });
    expect(fact.foreignKeys).toEqual([expect.objectContaining({ ownerTable: "venta", column: "cliente_id", nullable: false, unique: true, uniqueConstraint: "uq_venta_cliente_id" })]);
    // A Venta has its Cliente guaranteed by the NOT NULL FK; nothing guarantees that every Cliente has a Venta.
    expect(fact.notEnforcedBySchema).toEqual([expect.objectContaining({ code: "MINIMUM_MULTIPLICITY_NOT_ENFORCED", message: expect.stringContaining("al menos 1 Venta por cada Cliente") })]);
  });

  it("T-05: sin foreignKeyOwner conserva el fallback SOURCE del mapper y lo declara", () => {
    const fact = relationship(analyze(model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, ZERO_ONE)]), { kind: "relationship", id: id(40) }).facts, 40);

    expect(fact).toMatchObject({ status: "mapped", foreignKeyPlacement: "fallback-source" });
    expect(fact.foreignKeys).toEqual([expect.objectContaining({ ownerTable: "cliente", column: "venta_id", nullable: true, unique: true, uniqueConstraint: "uq_cliente_venta_id" })]);
    expect(codes(fact.diagnostics)).toEqual(["REL_ONE_TO_ONE_OWNER_FALLBACK"]);
    // A single FK: no inverse FK is invented in the other table.
    expect(fact.foreignKeys).toHaveLength(1);
  });
});

describe("buildRelationalFacts: N:M", () => {
  it("T-06: sin clase asociativa describe la tabla intermedia sin inventar una PK compuesta", () => {
    const input = model([venta(), producto()], [association(41, VENTA, PRODUCTO, MANY, MANY, { name: "contiene" })]);
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(41) }).facts, 41);

    expect(fact).toMatchObject({ status: "mapped", strategy: "join-table", mapperCardinality: "MANY_TO_MANY", mapperRelationRecords: 1 });
    expect(fact.joinTable).toEqual({ name: "producto_venta_contiene", columns: ["producto_id", "venta_id"], uniqueOn: ["producto_id", "venta_id"] });
    expect(fact.joinTable).not.toHaveProperty("primaryKey");
    expect(fact.foreignKeys.map((foreignKey) => [foreignKey.ownerTable, foreignKey.ownerClassId, foreignKey.column, foreignKey.references.classId, foreignKey.nullable])).toEqual([
      ["producto_venta_contiene", undefined, "producto_id", id(PRODUCTO), false],
      ["producto_venta_contiene", undefined, "venta_id", id(VENTA), false],
    ]);
  });

  it("T-07: con clase asociativa agrupa sus dos FK en un único hecho association-class-table", () => {
    const input = model([venta(), producto(), klass(DETALLE, "DetalleVenta", [attribute(401, "cantidad")])], [association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) })]);
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(41) }).facts, 41);

    expect(fact).toMatchObject({ status: "mapped", strategy: "association-class-table", mapperCardinality: "MANY_TO_ONE", mapperRelationRecords: 2 });
    expect(fact.associationClassTable).toEqual({ associationClassId: id(DETALLE), table: "detalle_venta", primaryKey: "id", technicalPrimaryKey: true, uniqueOn: ["producto_id", "venta_id"] });
    expect(fact.foreignKeys.map((foreignKey) => [foreignKey.ownerTable, foreignKey.ownerClassId, foreignKey.column])).toEqual([["detalle_venta", id(DETALLE), "producto_id"], ["detalle_venta", id(DETALLE), "venta_id"]]);
    expect(fact.joinTable).toBeUndefined();
  });

  it("T-08: una clase asociativa inválida deja la relación no derivable con el diagnóstico real", () => {
    const detalle = klass(DETALLE, "DetalleVenta", [attribute(401, "cantidad")], { generationMetadata: { entity: false } });
    const { facts } = analyze(model([venta(), producto(), detalle], [association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) })]), { kind: "relationship", id: id(41) });
    const fact = relationship(facts, 41);

    expect(fact).toMatchObject({ status: "not-derivable", foreignKeys: [] });
    expect(fact.reasons).toEqual([expect.objectContaining({ origin: "relational-core", code: "REL_INVALID_ASSOCIATION_CLASS" })]);
    expect(facts.classes.find((entry) => entry.classId === id(DETALLE))).toMatchObject({ status: "not-derivable" });
    expect(fact.associationClassTable).toBeUndefined();
  });

  it("T-08b: si dos relaciones comparten la clase asociativa inválida no atribuye el diagnóstico a ninguna", () => {
    const detalle = klass(DETALLE, "DetalleVenta", [], { generationMetadata: { entity: false } });
    const input = model([venta(), producto(), detalle], [
      association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) }),
      association(42, PRODUCTO, VENTA, MANY, MANY, { associationClassId: id(DETALLE), name: "devuelve" }),
    ]);
    const { facts, relational } = analyze(input, { kind: "model" });

    expect(relational.diagnostics.filter((diagnostic) => diagnostic.code === "REL_INVALID_ASSOCIATION_CLASS")).toHaveLength(2);
    for (const n of [41, 42]) {
      expect(relationship(facts, n).diagnostics).toEqual([]);
      expect(relationship(facts, n).reasons).toEqual([expect.objectContaining({ origin: "relational-facts", code: "CAUSE_UNDETERMINED" })]);
    }
    // Still reported at the fragment level, attached to the association class that is in scope.
    expect(codes(facts.diagnostics).filter((code) => code === "REL_INVALID_ASSOCIATION_CLASS")).toHaveLength(2);
  });

  it("T-23: en el modelo completo la N:M con clase asociativa aparece una sola vez", () => {
    const input = model([cliente(), venta(), producto(), klass(DETALLE, "DetalleVenta", [])], [association(40, CLIENTE, VENTA, ONE, MANY), association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) })]);
    const { facts, relational } = analyze(input, { kind: "model" });

    expect(relational.relations.filter((relation) => relation.source.elementId === id(41))).toHaveLength(2);
    expect(facts.relationships.map((entry) => entry.relationshipId)).toEqual([id(40), id(41)]);
    expect(relationship(facts, 41).foreignKeys).toHaveLength(2);
  });
});

describe("buildRelationalFacts: agregación, composición y generalización", () => {
  it("T-09: agregación y composición usan la misma FK y solo difieren en lifecycle", () => {
    const input = model([cliente(), venta(), producto()], [
      { ...association(50, CLIENTE, VENTA, ONE, MANY), type: "Aggregation" },
      { ...association(51, CLIENTE, PRODUCTO, ONE, MANY), type: "Composition" },
    ]);
    expectValid(input);
    const { facts } = analyze(input, { kind: "model" });
    const aggregation = relationship(facts, 50);
    const composition = relationship(facts, 51);

    expect([aggregation.strategy, composition.strategy]).toEqual(["foreign-key", "foreign-key"]);
    expect([aggregation.foreignKeys[0]!.lifecycle, composition.foreignKeys[0]!.lifecycle]).toEqual(["NONE", "COMPOSITION"]);
    expect(composition.foreignKeys[0]).toMatchObject({ ownerTable: "producto", column: "cliente_id", nullable: false });
    expect(facts.limitations.filter((entry) => entry.code === "LIFECYCLE_IS_METADATA_ONLY")).toEqual([expect.objectContaining({ elementId: id(51) })]);
  });

  it("T-10: generalización JOINED con tabla hija, padre y FK de herencia", () => {
    const input = model([cliente(), entity(CLIENTE_VIP, "ClienteVip", [attribute(501, "descuento")])], [{ id: id(42), type: "Generalization", sourceId: id(CLIENTE_VIP), targetId: id(CLIENTE) }]);
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(42) }).facts, 42);

    expect(fact).toMatchObject({ status: "mapped", strategy: "joined-inheritance", mapperRelationRecords: 0, notEnforcedBySchema: [] });
    expect(fact.mapperCardinality).toBeUndefined();
    expect(fact.inheritance).toEqual({ childTable: "cliente_vip", childClassId: id(CLIENTE_VIP), parentTable: "cliente", parentClassId: id(CLIENTE), strategy: "JOINED" });
    expect(fact.foreignKeys).toEqual([expect.objectContaining({ name: "fk_cliente_vip_id", ownerTable: "cliente_vip", column: "id", references: { table: "cliente", classId: id(CLIENTE), column: "id" }, nullable: false })]);
  });

  it("T-11: una hija sin identificador hace la herencia no derivable sin inventar la FK", () => {
    const input = model([cliente(), klass(CLIENTE_VIP, "ClienteVip", [attribute(501, "descuento")])], [{ id: id(42), type: "Generalization", sourceId: id(CLIENTE_VIP), targetId: id(CLIENTE) }]);
    const { facts } = analyze(input, { kind: "relationship", id: id(42) });

    expect(relationship(facts, 42)).toMatchObject({ status: "not-derivable", foreignKeys: [] });
    expect(relationship(facts, 42).inheritance).toBeUndefined();
    expect(codes(relationship(facts, 42).reasons)).toEqual(["REL_INVALID_INHERITANCE"]);
    expect(facts.classes.find((entry) => entry.classId === id(CLIENTE_VIP))).toMatchObject({ status: "not-derivable", table: "cliente_vip" });
  });

  it("T-11b: si el mapper marca inheritsFrom pero no crea la FK de herencia, sigue sin ser derivable", () => {
    // Different identifier names: the mapper sets inheritsFrom on the child and stops with REL_JOINED_PRIMARY_KEY_MISMATCH.
    const child = klass(CLIENTE_VIP, "ClienteVip", [attribute(501, "codigo", "integer", { generationMetadata: { identifier: true } })]);
    const input = model([cliente(), child], [{ id: id(42), type: "Generalization", sourceId: id(CLIENTE_VIP), targetId: id(CLIENTE) }]);
    const { facts, relational } = analyze(input, { kind: "relationship", id: id(42) });

    expect(relational.tables.find((table) => table.name === "cliente_vip")).toMatchObject({ inheritsFrom: "cliente", inheritanceStrategy: "JOINED", foreignKeys: [] });
    expect(relationship(facts, 42)).toMatchObject({ status: "not-derivable", foreignKeys: [] });
    expect(relationship(facts, 42).inheritance).toBeUndefined();
    expect(codes(relationship(facts, 42).reasons)).toEqual(["REL_JOINED_PRIMARY_KEY_MISMATCH"]);
  });
});

describe("buildRelationalFacts: resultados no derivables y parciales", () => {
  it("T-12: sin identificadores no inventa FK aunque el mapper emita un registro de relación", () => {
    const input = model([klass(CLIENTE, "Cliente", [attribute(101, "nombre")]), klass(VENTA, "Venta", [attribute(201, "total")])], [association(40, CLIENTE, VENTA, ONE, MANY)]);
    const { facts, relational } = analyze(input, { kind: "model" });

    expect(relational.relations).toHaveLength(1);
    expect(relational.relations[0]!.foreignKey).toBeUndefined();
    expect(relationship(facts, 40)).toMatchObject({ status: "not-derivable", foreignKeys: [], mapperRelationRecords: 1 });
    expect(codes(relationship(facts, 40).reasons)).toEqual(["REL_RELATIONSHIP_REQUIRES_PRIMARY_KEY"]);
    expect(facts.classes.map((entry) => [entry.status, entry.primaryKey])).toEqual([["not-derivable", undefined], ["not-derivable", undefined]]);
    expect(facts).toMatchObject({ derivable: false, mapperSuccess: false });
  });

  it("T-13: una multiplicidad no especificada deja la relación no derivable", () => {
    const fact = relationship(analyze(model([cliente(), venta()], [association(40, CLIENTE, VENTA)]), { kind: "relationship", id: id(40) }).facts, 40);

    expect(fact).toMatchObject({ status: "not-derivable", foreignKeys: [], mapperRelationRecords: 0, notEnforcedBySchema: [] });
    expect(codes(fact.reasons)).toEqual(["REL_MISSING_MULTIPLICITY"]);
  });

  it("T-18: procesa resultados parciales con success=false sin descartar lo derivable", () => {
    // Venta has no identifier: the FK that references Cliente can be built, the one that references Venta cannot.
    const input = model([cliente(), klass(VENTA, "Venta", [attribute(201, "total")]), producto()], [association(40, CLIENTE, VENTA, ONE, MANY), association(43, VENTA, PRODUCTO, ONE, MANY)]);
    const { facts, relational } = analyze(input, { kind: "model" });

    expect(relational.success).toBe(false);
    expect(relationship(facts, 40)).toMatchObject({ status: "mapped", foreignKeys: [expect.objectContaining({ ownerTable: "venta", column: "cliente_id" })] });
    expect(relationship(facts, 43)).toMatchObject({ status: "not-derivable", foreignKeys: [] });
    expect(codes(relationship(facts, 43).reasons)).toEqual(["REL_RELATIONSHIP_REQUIRES_PRIMARY_KEY"]);
    expect(Object.fromEntries(facts.classes.map((entry) => [entry.classId, entry.status]))).toEqual({ [id(CLIENTE)]: "mapped", [id(VENTA)]: "not-derivable", [id(PRODUCTO)]: "mapped" });
    expect(facts.derivable).toBe(false);
  });

  it("T-22: una clase sin tabla no recibe una tabla inventada y declara que la causa no se puede determinar", () => {
    // entity:false excludes the class from the schema without any mapper diagnostic.
    const input = model([cliente(), { ...entity(PROVEEDOR, "Proveedor"), generationMetadata: { entity: false } }], []);
    const { facts } = analyze(input, { kind: "class", id: id(PROVEEDOR) });

    expect(facts.classes).toEqual([{
      classId: id(PROVEEDOR), status: "not-derivable",
      reasons: [{ origin: "relational-facts", code: "CAUSE_UNDETERMINED", message: expect.any(String) }],
      attributes: [{ attributeId: id(PROVEEDOR * 100), status: "not-derivable", reasons: [expect.objectContaining({ code: "CAUSE_UNDETERMINED" })] }],
    }]);
  });
});

describe("buildRelationalFacts: multiplicidades que el esquema no garantiza", () => {
  it("T-14: 1..* advierte que el mínimo no está garantizado", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, M(1, "unbounded"))]);
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(40) }).facts, 40);

    expect(fact.notEnforcedBySchema).toEqual([{ code: "MINIMUM_MULTIPLICITY_NOT_ENFORCED", message: "La multiplicidad 1..* junto a Venta exige al menos 1 Venta por cada Cliente; el esquema relacional no lo garantiza.", elementId: id(40) }]);
  });

  it("T-15: 2..5 advierte por separado el mínimo y el máximo", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, M(2, 5))]);
    expectValid(input);
    const { facts } = analyze(input, { kind: "relationship", id: id(40) });
    const fact = relationship(facts, 40);

    // The mapper treats 2..5 as "many": the FK still goes to venta.
    expect(fact.foreignKeys[0]).toMatchObject({ ownerTable: "venta", column: "cliente_id" });
    expect(codes(fact.notEnforcedBySchema)).toEqual(["MINIMUM_MULTIPLICITY_NOT_ENFORCED", "MAXIMUM_MULTIPLICITY_NOT_ENFORCED"]);
    expect(facts.limitations).toEqual(fact.notEnforcedBySchema);
    // These are limitations found by this module, never presented as mapper diagnostics.
    expect(codes(facts.diagnostics)).not.toContain("MINIMUM_MULTIPLICITY_NOT_ENFORCED");
  });

  it("T-25: atributos multivaluados y multiplicidad de atributo que no determina la nulabilidad", () => {
    const input = model([entity(CLIENTE, "Cliente", [attribute(101, "telefonos", "string", { multiplicity: M(0, "unbounded") }), attribute(102, "nombre", "string", { multiplicity: ONE }), attribute(103, "apodo", "string", { multiplicity: ZERO_ONE })])], []);
    expectValid(input);
    const { facts } = analyze(input, { kind: "class", id: id(CLIENTE) });

    expect(facts.limitations.map((entry) => [entry.code, entry.elementId])).toEqual([["MULTIVALUED_ATTRIBUTE_NOT_SUPPORTED", id(101)], ["ATTRIBUTE_MULTIPLICITY_NOT_USED_FOR_NULLABILITY", id(102)]]);
    expect(facts.classes[0]!.attributes!.find((entry) => entry.attributeId === id(102))).toMatchObject({ status: "mapped", column: "nombre", nullable: true });
  });

  it("T-26: un atributo de tipo clase no recibe una columna inventada y conserva el diagnóstico del mapper", () => {
    const input = model([entity(CLIENTE, "Cliente", [{ id: id(104), name: "referido", visibility: "private", type: { kind: "reference", referenceType: "class", elementId: id(VENTA) } }]), venta()], []);
    const { facts } = analyze(input, { kind: "class", id: id(CLIENTE) });

    expect(facts.classes.find((entry) => entry.classId === id(CLIENTE))!.attributes!.find((entry) => entry.attributeId === id(104))).toEqual({ attributeId: id(104), status: "not-derivable", reasons: [expect.objectContaining({ origin: "relational-core", code: "REL_UNSUPPORTED_TYPE" })] });
  });
});

describe("buildRelationalFacts: recursividad, conflictos, alcance e invariantes", () => {
  it("T-16: asociación recursiva con FK a la misma tabla y mínimos por extremo", () => {
    const input = model([entity(EMPLEADO, "Empleado")], [association(44, EMPLEADO, EMPLEADO, ONE, M(1, "unbounded"), { name: "dirige" })]);
    expectValid(input);
    const fact = relationship(analyze(input, { kind: "relationship", id: id(44) }).facts, 44);

    expect(fact.foreignKeys).toEqual([expect.objectContaining({ ownerTable: "empleado", ownerClassId: id(EMPLEADO), column: "empleado_id", references: { table: "empleado", classId: id(EMPLEADO), column: "id" }, nullable: false })]);
    // The source end (1) is guaranteed by the NOT NULL FK; the target end (1..*) is not.
    expect(fact.notEnforcedBySchema).toEqual([expect.objectContaining({ code: "MINIMUM_MULTIPLICITY_NOT_ENFORCED", message: expect.stringContaining("1..*") })]);
  });

  it("T-17: detecta columnas FK duplicadas aunque el mapper informe success=true", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, ONE, MANY, { name: "compra" }), association(43, CLIENTE, VENTA, ZERO_ONE, MANY, { name: "devuelve" })]);
    expectValid(input);
    const { facts, relational } = analyze(input, { kind: "relationship", id: id(40) });

    expect(relational.success).toBe(true);
    expect(facts.conflicts).toEqual([{
      code: "DUPLICATE_FOREIGN_KEY_COLUMN", message: expect.stringContaining("venta"), table: "venta", column: "cliente_id",
      relationshipIds: [id(40), id(43)], elementIds: [id(40), id(43)], foreignKeyNames: ["fk_venta_cliente_id"],
    }]);
    expect(relationship(facts, 40).conflicts).toEqual(["DUPLICATE_FOREIGN_KEY_COLUMN"]);
    // Each FK keeps its own nullability: columns are matched by source, not only by their (duplicated) name.
    expect(relationship(facts, 40).foreignKeys[0]!.nullable).toBe(false);
    expect(relationship(analyze(input, { kind: "relationship", id: id(43) }).facts, 43).foreignKeys[0]!.nullable).toBe(true);
    // The conflict is ours, not a mapper diagnostic.
    expect(codes(facts.diagnostics)).not.toContain("DUPLICATE_FOREIGN_KEY_COLUMN");
  });

  it("T-19: solo incluye diagnósticos de los elementos del fragmento", () => {
    // Proveedor has no identifier (REL_NO_PRIMARY_KEY), but it is unrelated to the focused association.
    const input = model([cliente(), venta(), klass(PROVEEDOR, "Proveedor", [attribute(701, "razonSocial")])], [association(40, CLIENTE, VENTA, ONE, MANY)]);
    const focused = analyze(input, { kind: "relationship", id: id(40) }).facts;
    const whole = analyze(input, { kind: "model" }).facts;

    expect(focused.diagnostics).toEqual([]);
    expect(focused.derivable).toBe(true);
    expect(whole.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.elementId])).toEqual(expect.arrayContaining([["REL_NO_PRIMARY_KEY", id(PROVEEDOR)]]));
    expect(whole.derivable).toBe(false);

    // Class focus: the class, its direct relationships and related classes, including the incoming FK from venta.
    const byClass = analyze(input, { kind: "class", id: id(CLIENTE) }).facts;
    expect(byClass.relationships.map((entry) => entry.relationshipId)).toEqual([id(40)]);
    expect(byClass.classes.map((entry) => entry.classId).sort()).toEqual([id(CLIENTE), id(VENTA)]);
    expect(byClass.relationships[0]!.foreignKeys[0]).toMatchObject({ ownerTable: "venta", references: { classId: id(CLIENTE) } });
  });

  it("T-20: excluye los diagnósticos REL_UML_* de la validación canónica", () => {
    const input = model([cliente(), venta()], [association(40, CLIENTE, VENTA, M(3, 1), MANY)]);
    const { facts, relational } = analyze(input, { kind: "relationship", id: id(40) });

    expect(codes(relational.diagnostics)).toContain("REL_UML_UML_INVALID_MULTIPLICITY");
    expect(codes(facts.diagnostics).some((code) => code.startsWith("REL_UML_"))).toBe(false);
    expect(codes(relationship(facts, 40).diagnostics).some((code) => code.startsWith("REL_UML_"))).toBe(false);
  });

  it("T-21: no modifica el modelo, el fragmento ni el RelationalModel", () => {
    const input = model([cliente(), venta(), producto(), klass(DETALLE, "DetalleVenta", [])], [association(40, CLIENTE, VENTA, ONE, MANY), association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) })]);
    const modelBefore = structuredClone(input);
    const fragmentResult = buildUmlAnalysisFragment(input, { kind: "model" });
    if (!fragmentResult.ok) throw new Error("fragmento");
    const relational = mapToRelationalModel(input);
    const fragmentBefore = structuredClone(fragmentResult.fragment);
    const relationalBefore = structuredClone(relational);

    buildRelationalFacts(fragmentResult.fragment, relational);

    expect(input).toEqual(modelBefore);
    expect(fragmentResult.fragment).toEqual(fragmentBefore);
    expect(relational).toEqual(relationalBefore);
  });

  it("T-24: es determinista y serializable a JSON", () => {
    const input = model([cliente(), venta(), producto(), klass(DETALLE, "DetalleVenta", [])], [association(40, CLIENTE, VENTA, ONE, M(1, "unbounded")), association(41, VENTA, PRODUCTO, MANY, MANY, { associationClassId: id(DETALLE) })]);
    const first = analyze(input, { kind: "model" }).facts;

    expect(analyze(input, { kind: "model" }).facts).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
