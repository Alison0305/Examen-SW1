import { describe, expect, it } from "vitest";
import {
  UML_FRAGMENT_MAX_ELEMENTS,
  UmlCommandBus,
  classReferenceType,
  createProjectDocument,
  primitiveType,
  type ProjectDocument,
  type UmlFragment,
} from "../index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { document: id(1), existing: id(2), cliente: id(3), pedido: id(4), estado: id(5), relation: id(6), attribute: id(7), ref: id(8), external: id(9) };

function documentWithClass(): ProjectDocument {
  const bus = new UmlCommandBus(createProjectDocument({ now: new Date("2026-11-06T10:00:00.000Z"), uuidFactory: () => ids.document }));
  const result = bus.execute({ type: "CreateClass", classId: ids.existing, name: "Existente", layout: { x: 0, y: 0, width: 180, height: 120 } });
  if (!result.success) throw new Error("setup");
  return result.document;
}

function fragment(): UmlFragment {
  return {
    classes: [
      { id: ids.cliente, name: "Cliente", visibility: "public", attributes: [{ id: ids.attribute, name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] },
      { id: ids.pedido, name: "Pedido", visibility: "public", attributes: [{ id: ids.ref, name: "cliente", visibility: "private", type: classReferenceType(ids.cliente) }], operations: [] },
    ],
    enumerations: [{ id: ids.estado, name: "EstadoPedido", visibility: "public", literals: ["NUEVO", "ENVIADO"] }],
    relationships: [{ id: ids.relation, type: "Association", sourceId: ids.cliente, targetId: ids.pedido, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }],
    layout: [{ elementId: ids.cliente, x: 400, y: 0, width: 180, height: 120 }, { elementId: ids.pedido, x: 640, y: 0, width: 180, height: 120 }, { elementId: ids.estado, x: 880, y: 0, width: 180, height: 120 }],
  };
}

describe("ImportUmlFragment", () => {
  it("agrega todos los elementos y su layout en una sola entrada de historial", () => {
    const bus = new UmlCommandBus(documentWithClass());
    const before = bus.getHistoryState().undoCount;
    const result = bus.execute({ type: "ImportUmlFragment", fragment: fragment() });

    expect(result.success).toBe(true);
    expect(bus.document.uml.classes.map((entry) => entry.name)).toEqual(["Existente", "Cliente", "Pedido"]);
    expect(bus.document.uml.enumerations.map((entry) => entry.name)).toEqual(["EstadoPedido"]);
    expect(bus.document.uml.relationships).toHaveLength(1);
    expect(bus.document.layout.elements.map((entry) => entry.elementId)).toEqual([ids.existing, ids.cliente, ids.pedido, ids.estado]);
    expect(bus.getHistoryState().undoCount).toBe(before + 1);
  });

  it("Undo restaura el documento previo en un solo paso", () => {
    const initial = documentWithClass();
    const bus = new UmlCommandBus(initial);
    bus.execute({ type: "ImportUmlFragment", fragment: fragment() });
    bus.undo();
    expect(bus.document.uml).toEqual(initial.uml);
    expect(bus.document.layout).toEqual(initial.layout);
  });

  it("rechaza todo el fragmento si choca con el documento y no lo modifica", () => {
    const initial = documentWithClass();
    const bus = new UmlCommandBus(initial);
    const colliding = fragment();
    colliding.classes[0] = { ...colliding.classes[0]!, id: ids.existing };
    colliding.layout[0] = { ...colliding.layout[0]!, elementId: ids.existing };
    const duplicateName = fragment();
    duplicateName.classes[0] = { ...duplicateName.classes[0]!, name: "Existente" };

    for (const candidate of [colliding, duplicateName]) {
      const result = bus.execute({ type: "ImportUmlFragment", fragment: candidate });
      expect(result.success).toBe(false);
      expect(bus.document.uml).toEqual(initial.uml);
    }
    expect(bus.execute({ type: "ImportUmlFragment", fragment: colliding }).diagnostics.map((entry) => entry.code)).toContain("UML_DUPLICATE_ID");
    expect(bus.execute({ type: "ImportUmlFragment", fragment: duplicateName }).diagnostics.map((entry) => entry.code)).toContain("UML_DUPLICATE_NAME");
  });

  it("rechaza referencias rotas, layouts ajenos, fragmentos vacíos y demasiado grandes", () => {
    const bus = new UmlCommandBus(documentWithClass());
    const dangling = fragment();
    dangling.relationships[0] = { ...dangling.relationships[0]!, targetId: ids.external };
    const foreignLayout = fragment();
    foreignLayout.layout.push({ elementId: ids.existing, x: 1, y: 1 });
    const empty: UmlFragment = { classes: [], enumerations: [], relationships: [], layout: [] };
    const tooLarge: UmlFragment = { classes: [], enumerations: Array.from({ length: UML_FRAGMENT_MAX_ELEMENTS + 1 }, (_, index) => ({ id: id(1000 + index), name: `E${index}`, visibility: "public" as const, literals: [] })), relationships: [], layout: [] };

    expect(bus.execute({ type: "ImportUmlFragment", fragment: dangling }).diagnostics.map((entry) => entry.code)).toContain("UML_INVALID_RELATIONSHIP");
    for (const candidate of [foreignLayout, empty, tooLarge]) {
      const result = bus.execute({ type: "ImportUmlFragment", fragment: candidate });
      expect(result.success).toBe(false);
      expect(result.diagnostics.map((entry) => entry.code)).toContain("UML_INVALID_FRAGMENT");
    }
    expect(bus.document.uml.classes).toHaveLength(1);
  });
});

describe("RemoveUmlFragment", () => {
  it("retira exactamente los elementos importados, sus layouts y las relaciones conectadas", () => {
    const initial = documentWithClass();
    const bus = new UmlCommandBus(initial);
    bus.execute({ type: "ImportUmlFragment", fragment: fragment() });
    // A relationship created later towards an imported class leaves together with it.
    bus.execute({ type: "CreateRelationship", relationshipId: id(20), relationshipType: "Association", sourceId: ids.existing, targetId: ids.cliente });

    const result = bus.execute({ type: "RemoveUmlFragment", classIds: [ids.cliente, ids.pedido], enumerationIds: [ids.estado], relationshipIds: [ids.relation] });

    expect(result.success).toBe(true);
    expect(bus.document.uml).toEqual(initial.uml);
    expect(bus.document.layout.elements.map((entry) => entry.elementId)).toEqual([ids.existing]);
  });

  it("rechaza ids inexistentes sin modificar el documento", () => {
    const bus = new UmlCommandBus(documentWithClass());
    bus.execute({ type: "ImportUmlFragment", fragment: fragment() });
    const before = structuredClone(bus.document);
    const result = bus.execute({ type: "RemoveUmlFragment", classIds: [ids.cliente, ids.external], enumerationIds: [], relationshipIds: [] });
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toContain("UML_UNKNOWN_REFERENCE");
    expect(bus.document).toEqual(before);
  });

  it("rechaza retirar una enumeración que otra clase sigue usando como tipo", () => {
    const bus = new UmlCommandBus(documentWithClass());
    bus.execute({ type: "ImportUmlFragment", fragment: fragment() });
    bus.execute({ type: "AddAttribute", classId: ids.existing, attributeId: id(30), name: "estado", visibility: "private", attributeType: { kind: "reference", referenceType: "enumeration", elementId: ids.estado } });
    const result = bus.execute({ type: "RemoveUmlFragment", classIds: [], enumerationIds: [ids.estado], relationshipIds: [] });
    expect(result.success).toBe(false);
    expect(bus.document.uml.enumerations.map((entry) => entry.id)).toEqual([ids.estado]);
  });
});
