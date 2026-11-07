import { describe, expect, it } from "vitest";
import { buildImportFragment, createProjectDocument, normalizePrimitiveTypeName, previewImportFragment, UmlCommandBus, type ProjectDocument, type UmlImportProposal } from "./index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sequence = (start = 100) => { let next = start; return () => id(next++); };

function documentWith(...names: string[]): ProjectDocument {
  const bus = new UmlCommandBus(createProjectDocument({ now: new Date("2026-11-06T10:00:00.000Z"), uuidFactory: () => id(1) }));
  names.forEach((name, index) => bus.execute({ type: "CreateClass", classId: id(10 + index), name, layout: { x: index * 240, y: 0, width: 180, height: 120 } }));
  return bus.document;
}

const proposal = (): UmlImportProposal => ({
  source: "xmi",
  classes: [
    { key: "c-cliente", name: "Cliente", attributes: [{ key: "a-nombre", name: "nombre", type: "String" }, { key: "a-edad", name: "edad", type: "EAJava_int", visibility: "public" }, { key: "a-estado", name: "estado", type: "EstadoCliente" }] },
    { key: "c-pedido", name: "Pedido", attributes: [{ key: "a-cliente", name: "cliente", type: "cliente" }, { key: "a-raro", name: "raro", type: "Quaternion" }] },
  ],
  enumerations: [{ key: "e-estado", name: "EstadoCliente", literals: ["ACTIVO", "INACTIVO"] }],
  relationships: [
    { key: "r-1", type: "Association", source: "c-cliente", target: "c-pedido", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    { key: "r-2", type: "Generalization", source: "c-pedido", target: "Existente", sourceMultiplicity: { lower: 1, upper: 1 } },
    { key: "r-3", type: "Association", source: "c-cliente", target: "Fantasma" },
  ],
  diagnostics: [],
});

describe("normalizePrimitiveTypeName", () => {
  it("normaliza sinónimos y tipos de Enterprise Architect", () => {
    expect(["String", "EAnone_String", "varchar"].map(normalizePrimitiveTypeName)).toEqual(["string", "string", "string"]);
    expect(["int", "EAJava_long", "Integer"].map(normalizePrimitiveTypeName)).toEqual(["integer", "integer", "integer"]);
    expect(["double", "BigDecimal", "float"].map(normalizePrimitiveTypeName)).toEqual(["number", "number", "number"]);
    expect(["bool", "LocalDate", "LocalDateTime"].map(normalizePrimitiveTypeName)).toEqual(["boolean", "date", "datetime"]);
    expect(normalizePrimitiveTypeName("Cliente")).toBeUndefined();
  });
});

describe("buildImportFragment", () => {
  it("asigna ids, normaliza tipos y resuelve referencias por nombre", () => {
    const { fragment, idsByKey } = buildImportFragment(proposal(), documentWith("Existente"), { uuidFactory: sequence() });
    const [cliente, pedido] = fragment.classes;
    expect(cliente!.attributes.map((attribute) => attribute.type)).toEqual([
      { kind: "primitive", name: "string" },
      { kind: "primitive", name: "integer" },
      { kind: "reference", referenceType: "enumeration", elementId: idsByKey.get("e-estado") },
    ]);
    expect(cliente!.attributes[1]!.visibility).toBe("public");
    expect(cliente!.attributes[0]!.visibility).toBe("private");
    expect(pedido!.attributes[0]!.type).toEqual({ kind: "reference", referenceType: "class", elementId: idsByKey.get("c-cliente") });
  });

  it("usa string con advertencia para tipos desconocidos y omite relaciones sin extremo", () => {
    const { fragment, diagnostics } = buildImportFragment(proposal(), documentWith("Existente"), { uuidFactory: sequence() });
    expect(fragment.classes[1]!.attributes[1]!.type).toEqual({ kind: "primitive", name: "string" });
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "IMPORT_UNKNOWN_TYPE", key: "a-raro" }));
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "IMPORT_MISSING_RELATIONSHIP_END", key: "r-3" }));
    expect(fragment.relationships).toHaveLength(2);
  });

  it("conecta relaciones con clases existentes del documento y quita multiplicidades de la generalización", () => {
    const { fragment, idsByKey } = buildImportFragment(proposal(), documentWith("Existente"), { uuidFactory: sequence() });
    expect(fragment.relationships[1]).toEqual({ id: expect.any(String), type: "Generalization", sourceId: idsByKey.get("c-pedido"), targetId: id(10) });
  });

  it("es determinista y coloca los elementos a la derecha del diagrama sin solaparse", () => {
    const document = documentWith("Existente", "Otra");
    const first = buildImportFragment(proposal(), document, { uuidFactory: sequence() });
    const second = buildImportFragment(proposal(), document, { uuidFactory: sequence() });
    expect(first).toEqual(second);
    const xs = first.fragment.layout.map((entry) => entry.x);
    expect(Math.min(...xs)).toBeGreaterThan(240 + 180);
    expect(new Set(first.fragment.layout.map((entry) => `${entry.x},${entry.y}`)).size).toBe(first.fragment.layout.length);
  });

  it("excluir una clase excluye sus relaciones y convierte en string las referencias a ella", () => {
    const { fragment, diagnostics } = buildImportFragment(proposal(), documentWith("Existente"), { uuidFactory: sequence(), excludedKeys: new Set(["c-cliente"]) });
    expect(fragment.classes.map((entry) => entry.name)).toEqual(["Pedido"]);
    expect(fragment.relationships.map((entry) => entry.type)).toEqual(["Generalization"]);
    expect(fragment.classes[0]!.attributes[0]!.type).toEqual({ kind: "primitive", name: "string" });
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "IMPORT_UNKNOWN_TYPE", key: "a-cliente" }));
  });
});

describe("previewImportFragment", () => {
  it("valida sobre una copia y reporta nombres duplicados sin tocar el documento", () => {
    const document = documentWith("Cliente");
    const snapshot = structuredClone(document);
    const { fragment } = buildImportFragment(proposal(), document, { uuidFactory: sequence() });

    const preview = previewImportFragment(document, fragment);

    expect(preview.valid).toBe(false);
    expect(preview.diagnostics.map((entry) => entry.code)).toContain("UML_DUPLICATE_NAME");
    expect(document).toEqual(snapshot);
  });

  it("acepta un fragmento válido", () => {
    const document = documentWith("Existente");
    const { fragment } = buildImportFragment(proposal(), document, { uuidFactory: sequence() });
    expect(previewImportFragment(document, fragment).valid).toBe(true);
  });
});
