import { createEmptyCanonicalUmlModel, validateCanonicalUmlModel, type CanonicalUmlModel } from "@examen-sw1/uml-core";
import { describe, expect, it } from "vitest";
import { buildUmlAnalysisFragment, formatMultiplicityText, type UmlAnalysisFocus, type UmlAnalysisFragment } from "./uml-analysis-fragment";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  cliente: id(1), venta: id(2), producto: id(3), detalleVenta: id(4), clienteVip: id(5), metodoPago: id(6), direccion: id(7), proveedor: id(8),
  estadoCliente: id(20), paquete: id(30),
  clienteVenta: id(40), ventaProducto: id(41), herencia: id(42), ventaMetodo: id(43), clienteDireccion: id(44),
};

// Store model compatible with CanonicalUmlModel: 1:N, N:M with association class, generalization,
// unspecified multiplicities, composition with foreignKeyOwner, an enumeration, an operation and a package.
function storeModel(): CanonicalUmlModel {
  return {
    classes: [
      { id: ids.cliente, name: "Cliente", visibility: "public", attributes: [
        { id: id(101), name: "nombre", visibility: "private", type: { kind: "primitive", name: "string" } },
        { id: id(102), name: "correoAlternativo", visibility: "private", type: { kind: "primitive", name: "string" }, multiplicity: { lower: 0, upper: 1 } },
        { id: id(103), name: "estado", visibility: "private", type: { kind: "reference", referenceType: "enumeration", elementId: ids.estadoCliente } },
      ], operations: [] },
      { id: ids.venta, name: "Venta", visibility: "public", attributes: [
        { id: id(111), name: "fecha", visibility: "private", type: { kind: "primitive", name: "date" } },
        { id: id(112), name: "total", visibility: "private", type: { kind: "primitive", name: "number" } },
      ], operations: [
        { id: id(113), name: "calcularTotal", visibility: "public", parameters: [{ id: id(114), name: "descuento", type: { kind: "primitive", name: "number" } }], returnType: { kind: "primitive", name: "number" } },
      ] },
      { id: ids.producto, name: "Producto", visibility: "public", attributes: [{ id: id(121), name: "precio", visibility: "private", type: { kind: "primitive", name: "number" } }], operations: [] },
      { id: ids.detalleVenta, name: "DetalleVenta", visibility: "public", attributes: [{ id: id(131), name: "cantidad", visibility: "private", type: { kind: "primitive", name: "integer" } }], operations: [] },
      { id: ids.clienteVip, name: "ClienteVip", visibility: "public", attributes: [{ id: id(141), name: "descuento", visibility: "private", type: { kind: "primitive", name: "number" } }], operations: [] },
      { id: ids.metodoPago, name: "MetodoDePago", visibility: "public", attributes: [{ id: id(151), name: "titular", visibility: "private", type: { kind: "reference", referenceType: "class", elementId: ids.cliente } }], operations: [] },
      { id: ids.direccion, name: "Direccion", visibility: "public", attributes: [{ id: id(161), name: "calle", visibility: "private", type: { kind: "primitive", name: "string" } }], operations: [] },
      { id: ids.proveedor, name: "Proveedor", visibility: "public", packageId: ids.paquete, attributes: [], operations: [] },
    ],
    enumerations: [{ id: ids.estadoCliente, name: "EstadoCliente", visibility: "public", literals: ["ACTIVO", "SUSPENDIDO"] }],
    packages: [{ id: ids.paquete, name: "compras" }],
    relationships: [
      { id: ids.clienteVenta, type: "Association", name: "realiza", sourceId: ids.cliente, targetId: ids.venta, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
      { id: ids.ventaProducto, type: "Association", sourceId: ids.venta, targetId: ids.producto, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 1, upper: "unbounded" }, associationClassId: ids.detalleVenta },
      { id: ids.herencia, type: "Generalization", sourceId: ids.clienteVip, targetId: ids.cliente },
      { id: ids.ventaMetodo, type: "Association", sourceId: ids.venta, targetId: ids.metodoPago },
      { id: ids.clienteDireccion, type: "Composition", sourceId: ids.cliente, targetId: ids.direccion, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 1, upper: 1 }, foreignKeyOwner: "TARGET" },
    ],
  };
}

function build(model: CanonicalUmlModel, focus: UmlAnalysisFocus): UmlAnalysisFragment {
  const result = buildUmlAnalysisFragment(model, focus);
  if (!result.ok) throw new Error(`Se esperaba un fragmento: ${result.error.code}`);
  return result.fragment;
}

const names = (items: ReadonlyArray<{ name?: string }>) => items.map((item) => item.name);

describe("buildUmlAnalysisFragment", () => {
  it("el modelo de prueba es un CanonicalUmlModel válido para el validador del proyecto", () => {
    expect(validateCanonicalUmlModel(storeModel()).diagnostics).toEqual([]);
  });

  it("T-01: extrae una clase con sus atributos, tipos, multiplicidades y relaciones directas", () => {
    const fragment = build(storeModel(), { kind: "class", id: ids.cliente });

    expect(fragment.classes).toHaveLength(1);
    const [cliente] = fragment.classes;
    expect(cliente).toMatchObject({ id: ids.cliente, name: "Cliente", visibility: "public", operations: [] });
    expect(cliente!.attributes).toEqual([
      { id: id(101), name: "nombre", visibility: "private", type: { kind: "primitive", name: "string" }, multiplicity: { specified: false } },
      { id: id(102), name: "correoAlternativo", visibility: "private", type: { kind: "primitive", name: "string" }, multiplicity: { specified: true, lower: 0, upper: 1, text: "0..1" } },
      { id: id(103), name: "estado", visibility: "private", type: { kind: "enumeration", id: ids.estadoCliente, name: "EstadoCliente" }, multiplicity: { specified: false } },
    ]);
    // Direct relationships only: Venta, ClienteVip and Direccion are related; Producto and Proveedor are not.
    expect(fragment.relationships.map((entry) => entry.id).sort()).toEqual([ids.clienteVenta, ids.herencia, ids.clienteDireccion].sort());
    expect(names(fragment.relatedClasses).sort()).toEqual(["ClienteVip", "Direccion", "Venta"]);
    expect(names(fragment.relatedClasses)).not.toContain("Producto");
    expect(names(fragment.relatedClasses)).not.toContain("Proveedor");
  });

  it("T-02: extrae una asociación 1:N sin confundir sus extremos", () => {
    const fragment = build(storeModel(), { kind: "relationship", id: ids.clienteVenta });

    expect(fragment.relationships).toEqual([{
      id: ids.clienteVenta,
      type: "Association",
      name: "realiza",
      source: { elementId: ids.cliente, elementKind: "class", elementName: "Cliente", semanticRole: "end", multiplicity: { specified: true, lower: 1, upper: 1, text: "1" } },
      target: { elementId: ids.venta, elementKind: "class", elementName: "Venta", semanticRole: "end", multiplicity: { specified: true, lower: 0, upper: "unbounded", text: "0..*" } },
      selfReference: false,
    }]);
    // Both end classes in full, so their real attributes are available to explain the relationship.
    expect(names(fragment.classes)).toEqual(["Cliente", "Venta"]);
    expect(fragment.conventions.some((rule) => rule.startsWith("sourceMultiplicity es la multiplicidad escrita junto a la clase source"))).toBe(true);
  });

  it("T-02b: la misma asociación modelada con los extremos al revés conserva su semántica por extremo", () => {
    const model = storeModel();
    model.relationships[0] = { id: ids.clienteVenta, type: "Association", sourceId: ids.venta, targetId: ids.cliente, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 1, upper: 1 } };
    const [relationship] = build(model, { kind: "relationship", id: ids.clienteVenta }).relationships;

    expect(relationship!.source).toMatchObject({ elementName: "Venta", multiplicity: { text: "0..*" } });
    expect(relationship!.target).toMatchObject({ elementName: "Cliente", multiplicity: { text: "1" } });
  });

  it("T-03: extrae el modelo completo sin layout, sin recortes y con sus paquetes", () => {
    const model = storeModel();
    const fragment = build(model, { kind: "model" });

    expect(names(fragment.classes)).toEqual(model.classes.map((entry) => entry.name));
    expect(fragment.relationships).toHaveLength(model.relationships.length);
    expect(names(fragment.enumerations)).toEqual(["EstadoCliente"]);
    expect(fragment.packages).toEqual([{ id: ids.paquete, name: "compras" }]);
    expect(fragment.relatedClasses).toEqual([]);
    expect(fragment.truncated).toBe(false);
    expect(fragment.integrityIssues).toEqual([]);
    expect(JSON.stringify(fragment)).not.toMatch(/"x"|"y"|layout/);
  });

  it("T-04: informa una clase inexistente con un resultado tipado", () => {
    expect(buildUmlAnalysisFragment(storeModel(), { kind: "class", id: id(999) })).toEqual({
      ok: false,
      error: { code: "CLASS_NOT_FOUND", message: "La clase indicada no existe en el modelo vigente.", elementId: id(999) },
    });
    // A relationship id is not a class.
    expect(buildUmlAnalysisFragment(storeModel(), { kind: "class", id: ids.clienteVenta })).toMatchObject({ ok: false, error: { code: "CLASS_NOT_FOUND" } });
  });

  it("T-05: informa una asociación inexistente", () => {
    expect(buildUmlAnalysisFragment(storeModel(), { kind: "relationship", id: id(998) })).toMatchObject({ ok: false, error: { code: "RELATIONSHIP_NOT_FOUND", elementId: id(998) } });
  });

  it("T-06: informa un modelo vacío para cualquier enfoque", () => {
    const empty = createEmptyCanonicalUmlModel();
    for (const focus of [{ kind: "model" }, { kind: "class", id: ids.cliente }, { kind: "relationship", id: ids.clienteVenta }] as const) {
      expect(buildUmlAnalysisFragment(empty, focus)).toMatchObject({ ok: false, error: { code: "EMPTY_MODEL" } });
    }
  });

  it("T-07: conserva como no especificada una multiplicidad ausente, sin asumir 1", () => {
    const [relationship] = build(storeModel(), { kind: "relationship", id: ids.ventaMetodo }).relationships;

    expect(relationship!.source.multiplicity).toEqual({ specified: false });
    expect(relationship!.target.multiplicity).toEqual({ specified: false });
    expect(JSON.stringify(relationship)).not.toContain('"lower":1');
  });

  it("T-08: identifica hija y padre en una generalización", () => {
    const [relationship] = build(storeModel(), { kind: "relationship", id: ids.herencia }).relationships;

    expect(relationship).toMatchObject({
      type: "Generalization",
      source: { elementName: "ClienteVip", semanticRole: "child", multiplicity: { specified: false } },
      target: { elementName: "Cliente", semanticRole: "parent", multiplicity: { specified: false } },
    });
  });

  it("T-09: resuelve las referencias a enumeraciones e incluye sus literales", () => {
    const fragment = build(storeModel(), { kind: "class", id: ids.cliente });

    expect(fragment.enumerations).toEqual([{ id: ids.estadoCliente, name: "EstadoCliente", visibility: "public", literals: ["ACTIVO", "SUSPENDIDO"] }]);
  });

  it("T-10: no modifica el modelo original con ningún enfoque", () => {
    const model = storeModel();
    const before = structuredClone(model);
    for (const focus of [{ kind: "model" }, { kind: "class", id: ids.cliente }, { kind: "class", id: ids.venta }, { kind: "relationship", id: ids.ventaProducto }] as const) {
      const fragment = build(model, focus);
      // The result is detached from the input: changing it does not reach the model.
      (fragment.classes[0]!.attributes as unknown[]).length = 0;
    }
    expect(model).toEqual(before);
  });

  it("T-11: conserva nombres compuestos y resuelve referencias entre clases", () => {
    const fragment = build(storeModel(), { kind: "class", id: ids.metodoPago });

    expect(fragment.classes[0]).toMatchObject({ name: "MetodoDePago" });
    expect(fragment.classes[0]!.attributes[0]!.type).toEqual({ kind: "class", id: ids.cliente, name: "Cliente" });
    // Cliente is needed to resolve the attribute type, so it appears as a related class (name only).
    expect(fragment.relatedClasses).toEqual(expect.arrayContaining([{ id: ids.cliente, name: "Cliente" }, { id: ids.venta, name: "Venta" }]));
    expect(fragment.integrityIssues).toEqual([]);
  });

  it("T-12: conserva los elementos opcionales associationClassId y foreignKeyOwner", () => {
    const manyToMany = build(storeModel(), { kind: "relationship", id: ids.ventaProducto });
    expect(manyToMany.relationships[0]).toMatchObject({ associationClass: { id: ids.detalleVenta, name: "DetalleVenta", resolved: true } });
    expect(names(manyToMany.classes)).toEqual(["Venta", "Producto", "DetalleVenta"]);

    const composition = build(storeModel(), { kind: "relationship", id: ids.clienteDireccion }).relationships[0]!;
    expect(composition).toMatchObject({ type: "Composition", foreignKeyOwner: "TARGET", source: { elementName: "Cliente", semanticRole: "whole" }, target: { elementName: "Direccion", semanticRole: "part" } });
    expect(composition.associationClass).toBeUndefined();

    // The association class focus includes the N:M relationship it qualifies.
    expect(build(storeModel(), { kind: "class", id: ids.detalleVenta }).relationships.map((entry) => entry.id)).toEqual([ids.ventaProducto]);
  });

  it("T-13: señala una clase de asociación inexistente sin inventarla ni fallar", () => {
    const model = storeModel();
    const missingAssociationClass = id(779);
    const manyToMany = model.relationships.find((entry) => entry.associationClassId !== undefined)!;
    expect(manyToMany.id).toBe(ids.ventaProducto);
    manyToMany.associationClassId = missingAssociationClass;

    const result = buildUmlAnalysisFragment(model, { kind: "relationship", id: manyToMany.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [relationship] = result.fragment.relationships;
    expect(relationship!.associationClass).toEqual({ id: missingAssociationClass, resolved: false });
    expect(relationship!.associationClass).not.toHaveProperty("name");
    expect(result.fragment.integrityIssues).toEqual([{
      code: "UNRESOLVED_ASSOCIATION_CLASS",
      message: "La clase de asociación referenciada no existe en el modelo.",
      elementId: manyToMany.id,
      missingId: missingAssociationClass,
    }]);
    // Only the two real end classes are present: no class is made up for the missing association class.
    expect(names(result.fragment.classes)).toEqual(["Venta", "Producto"]);
    expect(result.fragment.relatedClasses).toEqual([]);
  });

  it("T-14: asigna los roles semánticos de cada tipo de relación sin alterar source ni target", () => {
    const model = storeModel();
    model.relationships.push({ id: id(47), type: "Aggregation", sourceId: ids.venta, targetId: ids.producto, sourceMultiplicity: { lower: 0, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    const roles = Object.fromEntries(build(model, { kind: "model" }).relationships.map((entry) => [entry.id, [entry.type, entry.source.elementName, entry.source.semanticRole, entry.target.elementName, entry.target.semanticRole]]));

    expect(roles[ids.clienteVenta]).toEqual(["Association", "Cliente", "end", "Venta", "end"]);
    expect(roles[id(47)]).toEqual(["Aggregation", "Venta", "whole", "Producto", "part"]);
    expect(roles[ids.clienteDireccion]).toEqual(["Composition", "Cliente", "whole", "Direccion", "part"]);
    expect(roles[ids.herencia]).toEqual(["Generalization", "ClienteVip", "child", "Cliente", "parent"]);
  });
});

describe("limitaciones, identificadores y referencias inconsistentes", () => {
  it("conserva las operaciones existentes y declara que el editor no las soporta", () => {
    const fragment = build(storeModel(), { kind: "class", id: ids.venta });

    expect(fragment.classes[0]!.operations).toEqual([{
      id: id(113), name: "calcularTotal", visibility: "public",
      parameters: [{ id: id(114), name: "descuento", type: { kind: "primitive", name: "number" } }],
      returnType: { kind: "primitive", name: "number" },
    }]);
    expect(fragment.limitations[0]).toEqual({ code: "OPERATIONS_NOT_EDITABLE", message: "El modelo contiene operaciones, pero el editor actual no permite crearlas ni editarlas.", elementIds: [ids.venta] });
  });

  it("declara siempre las características UML no soportadas, sin elementos asociados", () => {
    const codes = build(storeModel(), { kind: "class", id: ids.producto }).limitations.map((entry) => entry.code);

    expect(codes).toEqual(["INTERFACES_NOT_SUPPORTED", "REALIZATION_NOT_SUPPORTED", "DEPENDENCY_NOT_SUPPORTED", "ABSTRACT_CLASSES_NOT_SUPPORTED", "STEREOTYPES_NOT_SUPPORTED", "ROLE_NAMES_NOT_SUPPORTED", "NAVIGABILITY_NOT_SUPPORTED", "QUALIFIERS_NOT_SUPPORTED", "OCL_CONSTRAINTS_NOT_SUPPORTED", "DERIVED_OR_STATIC_ATTRIBUTES_NOT_SUPPORTED"]);
    expect(build(storeModel(), { kind: "model" }).limitations.map((entry) => entry.code)).toEqual(expect.arrayContaining(["OPERATIONS_NOT_EDITABLE", "PACKAGES_NOT_EDITABLE"]));
  });

  it("rechaza identificadores de enfoque que no son UUID", () => {
    for (const bad of ["", "cliente", "123", `${ids.cliente}x`]) {
      expect(buildUmlAnalysisFragment(storeModel(), { kind: "class", id: bad })).toMatchObject({ ok: false, error: { code: "INVALID_FOCUS_ID" } });
    }
  });

  it("no explica una relación cuyo extremo no existe y registra referencias rotas en los demás enfoques", () => {
    const model = storeModel();
    model.relationships.push({ id: id(45), type: "Association", sourceId: ids.cliente, targetId: id(777) });
    model.classes[0]!.attributes.push({ id: id(104), name: "categoria", visibility: "private", type: { kind: "reference", referenceType: "enumeration", elementId: id(778) } });

    expect(buildUmlAnalysisFragment(model, { kind: "relationship", id: id(45) })).toMatchObject({ ok: false, error: { code: "INCONSISTENT_REFERENCE", elementId: id(777) } });
    const fragment = build(model, { kind: "class", id: ids.cliente });
    expect(fragment.integrityIssues.map((entry) => [entry.code, entry.missingId])).toEqual([["UNRESOLVED_TYPE_REFERENCE", id(778)], ["UNRESOLVED_RELATIONSHIP_END", id(777)]]);
    expect(fragment.relationships.find((entry) => entry.id === id(45))!.target).toEqual({ elementId: id(777), elementKind: "unresolved", semanticRole: "end", multiplicity: { specified: false } });
  });

  it("marca las asociaciones recursivas y es determinista y serializable", () => {
    const model = storeModel();
    model.relationships.push({ id: id(46), type: "Association", name: "refiere", sourceId: ids.cliente, targetId: ids.cliente, sourceMultiplicity: { lower: 0, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    const fragment = build(model, { kind: "relationship", id: id(46) });

    expect(fragment.relationships[0]).toMatchObject({ selfReference: true, source: { elementName: "Cliente" }, target: { elementName: "Cliente" } });
    expect(names(fragment.classes)).toEqual(["Cliente"]);
    expect(build(model, { kind: "model" })).toEqual(build(model, { kind: "model" }));
    expect(JSON.parse(JSON.stringify(fragment))).toEqual(fragment);
  });

  it("formatea las multiplicidades en su forma textual UML", () => {
    expect([{ lower: 1, upper: 1 }, { lower: 0, upper: 1 }, { lower: 0, upper: "unbounded" }, { lower: 1, upper: "unbounded" }, { lower: 2, upper: 5 }, { lower: 3, upper: 3 }].map((value) => formatMultiplicityText(value as never))).toEqual(["1", "0..1", "0..*", "1..*", "2..5", "3"]);
  });
});
