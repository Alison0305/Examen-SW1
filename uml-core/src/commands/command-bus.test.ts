import { describe, expect, it } from "vitest";
import {
  UmlCommandBus,
  UmlCommandExecutor,
  classReferenceType,
  createProjectDocument,
  enumerationReferenceType,
  multiplicity,
  primitiveType,
  type ProjectDocument,
  type UmlCommand,
} from "../index.js";

const ids = {
  document: "11111111-1111-4111-8111-111111111111",
  class: "22222222-2222-4222-8222-222222222222",
  otherClass: "33333333-3333-4333-8333-333333333333",
  thirdClass: "44444444-4444-4444-8444-444444444444",
  enum: "55555555-5555-4555-8555-555555555555",
  otherEnum: "66666666-6666-4666-8666-666666666666",
  attribute: "77777777-7777-4777-8777-777777777777",
  otherAttribute: "77777777-7777-4777-8777-777777777778",
  operation: "88888888-8888-4888-8888-888888888888",
  parameter: "99999999-9999-4999-8999-999999999999",
  relationship: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherRelationship: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  missing: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const timestamp = new Date("2026-09-05T10:00:00.000Z");
const nextTimestamp = new Date("2026-09-05T10:01:00.000Z");

function emptyDocument(): ProjectDocument {
  return createProjectDocument({ now: timestamp, uuidFactory: () => ids.document });
}

function documentWithClass(): ProjectDocument {
  const document = emptyDocument();
  document.uml.classes.push({
    id: ids.class,
    name: "Cliente",
    visibility: "public",
    attributes: [],
    operations: [],
  });
  document.layout.elements.push({ elementId: ids.class, x: 10, y: 20, width: 160, height: 100 });
  return document;
}

function documentWithTwoClasses(): ProjectDocument {
  const document = documentWithClass();
  document.uml.classes.push({
    id: ids.otherClass,
    name: "Pedido",
    visibility: "public",
    attributes: [],
    operations: [],
  });
  document.layout.elements.push({ elementId: ids.otherClass, x: 240, y: 20 });
  return document;
}

function executor(): UmlCommandExecutor {
  return new UmlCommandExecutor({ nowFactory: () => nextTimestamp });
}

function externalClass(name: string = "MutacionExterna") {
  return {
    id: ids.thirdClass,
    name,
    visibility: "public" as const,
    attributes: [],
    operations: [],
  };
}

describe("UmlCommandExecutor", () => {
  it("crea clases con entrada de layout y CommandResult exitoso", () => {
    const document = emptyDocument();
    const result = executor().execute(document, {
      type: "CreateClass",
      classId: ids.class,
      name: "Cliente",
      layout: { x: 30, y: 40, width: 180, height: 120 },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(result.diagnostics).toEqual([]);
    expect(result.document.uml.classes).toMatchObject([{ id: ids.class, name: "Cliente", visibility: "public" }]);
    expect(result.document.layout.elements).toEqual([{ elementId: ids.class, x: 30, y: 40, width: 180, height: 120 }]);
    expect(result.document.revision).toBe(2);
    expect(result.document.updatedAt).toBe("2026-09-05T10:01:00.000Z");
    expect(document.uml.classes).toEqual([]);
  });

  it("rechaza creación inválida con diagnostics y conserva el documento original", () => {
    const document = emptyDocument();
    const snapshot = structuredClone(document);
    const result = executor().execute(document, { type: "CreateClass", classId: ids.class, name: "" });

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.document).toEqual(snapshot);
    expect(document).toEqual(snapshot);
    expect(result.diagnostics).toMatchObject([{ code: "UML_REQUIRED_NAME", elementId: ids.class }]);
  });

  it("renombra clases y rechaza nombres duplicados", () => {
    const document = documentWithTwoClasses();
    const rename = executor().execute(document, { type: "RenameClass", classId: ids.class, name: "Cuenta" });

    expect(rename.success).toBe(true);
    expect(rename.document.uml.classes[0].name).toBe("Cuenta");

    const rejected = executor().execute(document, { type: "RenameClass", classId: ids.class, name: "Pedido" });
    expect(rejected.success).toBe(false);
    expect(rejected.document).toEqual(document);
    expect(rejected.diagnostics.map((diagnostic) => diagnostic.code)).toContain("UML_DUPLICATE_NAME");
  });

  it("actualiza visibilidad de clase mediante comando explícito", () => {
    const document = documentWithClass();

    const result = executor().execute(document, {
      type: "UpdateClassVisibility",
      classId: ids.class,
      visibility: "protected",
    });

    expect(result.success).toBe(true);
    expect(result.document.uml.classes[0].visibility).toBe("protected");
    expect(document.uml.classes[0].visibility).toBe("public");
  });

  it("elimina clases junto con layout y relaciones incidentes", () => {
    const document = documentWithTwoClasses();
    document.uml.relationships.push({
      id: ids.relationship,
      type: "Association",
      sourceId: ids.class,
      targetId: ids.otherClass,
    });
    document.layout.elements.push({ elementId: ids.relationship, x: 0, y: 0 });

    const result = executor().execute(document, { type: "DeleteClass", classId: ids.class });

    expect(result.success).toBe(true);
    expect(result.document.uml.classes.map((umlClass) => umlClass.id)).toEqual([ids.otherClass]);
    expect(result.document.uml.relationships).toEqual([]);
    expect(result.document.layout.elements.map((entry) => entry.elementId)).toEqual([ids.otherClass]);
  });

  it("rechaza DeleteClass por referencias externas de atributo, parámetro y returnType sin modificar el documento", () => {
    const document = documentWithTwoClasses();
    document.uml.classes[1].attributes.push({
      id: ids.attribute,
      name: "cliente",
      visibility: "private",
      type: classReferenceType(ids.class),
    });
    document.uml.classes[1].operations.push({
      id: ids.operation,
      name: "asignarCliente",
      visibility: "public",
      parameters: [{ id: ids.parameter, name: "cliente", type: classReferenceType(ids.class) }],
      returnType: classReferenceType(ids.class),
    });
    const snapshot = structuredClone(document);

    const result = executor().execute(document, { type: "DeleteClass", classId: ids.class });

    expect(result.success).toBe(false);
    expect(result.document).toEqual(snapshot);
    expect(document).toEqual(snapshot);
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      "classes[1].attributes[0].type.elementId",
      "classes[1].operations[0].parameters[0].type.elementId",
      "classes[1].operations[0].returnType.elementId",
    ]);
  });

  it("agrega, actualiza y remueve atributos mediante comandos", () => {
    const document = documentWithClass();
    const added = executor().execute(document, {
      type: "AddAttribute",
      classId: ids.class,
      attributeId: ids.attribute,
      name: "nombre",
      attributeType: primitiveType("string"),
      multiplicity: multiplicity(1),
    });

    expect(added.success).toBe(true);
    expect(added.document.uml.classes[0].attributes).toMatchObject([
      { id: ids.attribute, name: "nombre", visibility: "private", type: primitiveType("string") },
    ]);

    const updated = executor().execute(added.document, {
      type: "UpdateAttribute",
      classId: ids.class,
      attributeId: ids.attribute,
      updates: { name: "razonSocial", visibility: "public", attributeType: primitiveType("integer") },
    });
    expect(updated.success).toBe(true);
    expect(updated.document.uml.classes[0].attributes[0]).toMatchObject({
      name: "razonSocial",
      visibility: "public",
      type: primitiveType("integer"),
    });

    const removed = executor().execute(updated.document, {
      type: "RemoveAttribute",
      classId: ids.class,
      attributeId: ids.attribute,
    });
    expect(removed.success).toBe(true);
    expect(removed.document.uml.classes[0].attributes).toEqual([]);
  });

  it("rechaza atributos inválidos con diagnostics", () => {
    const document = documentWithClass();
    const result = executor().execute(document, {
      type: "AddAttribute",
      classId: ids.class,
      attributeId: ids.attribute,
      name: "",
      attributeType: primitiveType("string"),
    });

    expect(result.success).toBe(false);
    expect(result.document).toEqual(document);
    expect(result.diagnostics).toMatchObject([{ code: "UML_REQUIRED_NAME", elementId: ids.attribute }]);
  });

  it("crea y renombra enumeraciones y administra literales", () => {
    const document = emptyDocument();
    const created = executor().execute(document, {
      type: "CreateEnumeration",
      enumerationId: ids.enum,
      name: "EstadoPedido",
      literals: ["BORRADOR"],
      layout: { x: 15, y: 25 },
    });
    expect(created.success).toBe(true);
    expect(created.document.uml.enumerations[0]).toMatchObject({ id: ids.enum, name: "EstadoPedido" });
    expect(created.document.layout.elements).toEqual([{ elementId: ids.enum, x: 15, y: 25 }]);

    const renamed = executor().execute(created.document, {
      type: "RenameEnumeration",
      enumerationId: ids.enum,
      name: "EstadoOrden",
    });
    const literalAdded = executor().execute(renamed.document, {
      type: "AddEnumerationLiteral",
      enumerationId: ids.enum,
      literal: "CONFIRMADO",
    });
    const literalRemoved = executor().execute(literalAdded.document, {
      type: "RemoveEnumerationLiteral",
      enumerationId: ids.enum,
      literal: "BORRADOR",
    });

    expect(literalRemoved.success).toBe(true);
    expect(literalRemoved.document.uml.enumerations[0]).toMatchObject({
      name: "EstadoOrden",
      literals: ["CONFIRMADO"],
    });
  });

  it("actualiza visibilidad de enumeración mediante comando explícito", () => {
    const document = emptyDocument();
    document.uml.enumerations.push({ id: ids.enum, name: "EstadoPedido", visibility: "public", literals: [] });

    const result = executor().execute(document, {
      type: "UpdateEnumerationVisibility",
      enumerationId: ids.enum,
      visibility: "package",
    });

    expect(result.success).toBe(true);
    expect(result.document.uml.enumerations[0].visibility).toBe("package");
    expect(document.uml.enumerations[0].visibility).toBe("public");
  });

  it("elimina enumeraciones y su layout cuando no tienen referencias", () => {
    const document = emptyDocument();
    document.uml.enumerations.push({ id: ids.enum, name: "EstadoPedido", visibility: "public", literals: ["NUEVO"] });
    document.layout.elements.push({ elementId: ids.enum, x: 10, y: 20 });

    const result = executor().execute(document, { type: "DeleteEnumeration", enumerationId: ids.enum });

    expect(result.success).toBe(true);
    expect(result.document.uml.enumerations).toEqual([]);
    expect(result.document.layout.elements).toEqual([]);
  });

  it("rechaza DeleteEnumeration por referencias de atributo, parámetro y returnType", () => {
    const document = documentWithClass();
    document.uml.enumerations.push({ id: ids.enum, name: "EstadoPedido", visibility: "public", literals: ["NUEVO"] });
    document.uml.classes[0].attributes.push({
      id: ids.attribute,
      name: "estado",
      visibility: "private",
      type: enumerationReferenceType(ids.enum),
    });
    document.uml.classes[0].operations.push({
      id: ids.operation,
      name: "cambiarEstado",
      visibility: "public",
      parameters: [{ id: ids.parameter, name: "estado", type: enumerationReferenceType(ids.enum) }],
      returnType: enumerationReferenceType(ids.enum),
    });
    const snapshot = structuredClone(document);

    const result = executor().execute(document, { type: "DeleteEnumeration", enumerationId: ids.enum });

    expect(result.success).toBe(false);
    expect(result.document).toEqual(snapshot);
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      "classes[0].attributes[0].type.elementId",
      "classes[0].operations[0].parameters[0].type.elementId",
      "classes[0].operations[0].returnType.elementId",
    ]);
  });

  it("crea relaciones de todos los tipos soportados y elimina relaciones", () => {
    const document = documentWithTwoClasses();
    const relationshipTypes = ["Association", "Aggregation", "Composition", "Generalization"] as const;
    let current = document;

    relationshipTypes.forEach((relationshipType, index) => {
      const result = executor().execute(current, {
        type: "CreateRelationship",
        relationshipId: `${index + 1}${ids.relationship.slice(1)}`,
        relationshipType,
        sourceId: ids.class,
        targetId: ids.otherClass,
        sourceMultiplicity: relationshipType === "Generalization" ? undefined : multiplicity(1),
        targetMultiplicity: relationshipType === "Generalization" ? undefined : multiplicity(0, "unbounded"),
      });
      expect(result.success).toBe(true);
      current = result.document;
    });

    expect(current.uml.relationships.map((relationship) => relationship.type)).toEqual(relationshipTypes);

    const deleted = executor().execute(current, { type: "DeleteRelationship", relationshipId: `1${ids.relationship.slice(1)}` });
    expect(deleted.success).toBe(true);
    expect(deleted.document.uml.relationships.map((relationship) => relationship.type)).toEqual([
      "Aggregation",
      "Composition",
      "Generalization",
    ]);
  });

  it("actualiza multiplicidades y rechaza multiplicidades inválidas", () => {
    const document = documentWithTwoClasses();
    document.uml.relationships.push({
      id: ids.relationship,
      type: "Association",
      sourceId: ids.class,
      targetId: ids.otherClass,
    });

    const updated = executor().execute(document, {
      type: "UpdateMultiplicity",
      relationshipId: ids.relationship,
      end: "target",
      multiplicity: { lower: 0, upper: "unbounded" },
    });
    expect(updated.success).toBe(true);
    expect(updated.document.uml.relationships[0].targetMultiplicity).toEqual({ lower: 0, upper: "unbounded" });

    const rejected = executor().execute(document, {
      type: "UpdateMultiplicity",
      relationshipId: ids.relationship,
      end: "source",
      multiplicity: { lower: 3, upper: 1 },
    });
    expect(rejected.success).toBe(false);
    expect(rejected.document).toEqual(document);
    expect(rejected.diagnostics).toMatchObject([{ code: "UML_INVALID_MULTIPLICITY", elementId: ids.relationship }]);
  });

  it("actualiza, normaliza y elimina nombres opcionales de relaciones nombrables", () => {
    const document = documentWithTwoClasses();
    document.uml.relationships.push({
      id: ids.relationship,
      type: "Association",
      sourceId: ids.class,
      targetId: ids.otherClass,
    });

    const named = executor().execute(document, { type: "UpdateRelationshipName", relationshipId: ids.relationship, name: "  tiene  " });
    expect(named.success).toBe(true);
    expect(named.document.uml.relationships[0].name).toBe("tiene");

    const unnamed = executor().execute(named.document, { type: "UpdateRelationshipName", relationshipId: ids.relationship, name: "   " });
    expect(unnamed.success).toBe(true);
    expect(unnamed.document.uml.relationships[0]).not.toHaveProperty("name");
  });

  it("rechaza nombres para generalizaciones sin modificar el documento", () => {
    const document = documentWithTwoClasses();
    document.uml.relationships.push({
      id: ids.relationship,
      type: "Generalization",
      sourceId: ids.class,
      targetId: ids.otherClass,
    });

    const result = executor().execute(document, { type: "UpdateRelationshipName", relationshipId: ids.relationship, name: "extiende" });
    expect(result.success).toBe(false);
    expect(result.document).toEqual(document);
    expect(result.diagnostics).toMatchObject([{ code: "UML_INVALID_RELATIONSHIP", elementId: ids.relationship }]);
  });

  it("mueve elementos modificando solo DiagramLayout", () => {
    const document = documentWithClass();
    const semanticBefore = structuredClone(document.uml);

    const result = executor().execute(document, { type: "MoveElement", elementId: ids.class, x: 100, y: 120 });

    expect(result.success).toBe(true);
    expect(result.document.uml).toEqual(semanticBefore);
    expect(result.document.layout.elements[0]).toEqual({ elementId: ids.class, x: 100, y: 120, width: 160, height: 100 });
  });

  it("aplica layout masivo modificando solo DiagramLayout y conservando dimensiones", () => {
    const document = documentWithTwoClasses();
    const semanticBefore = structuredClone(document.uml);

    const result = executor().execute(document, {
      type: "ApplyLayout",
      elements: [
        { elementId: ids.class, x: 100, y: 120 },
        { elementId: ids.otherClass, x: 360, y: 240 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.document.uml).toEqual(semanticBefore);
    expect(result.document.layout.elements).toEqual([
      { elementId: ids.class, x: 100, y: 120, width: 160, height: 100 },
      { elementId: ids.otherClass, x: 360, y: 240 },
    ]);
    expect(document.uml).toEqual(semanticBefore);
  });

  it("rechaza layout masivo con referencias inexistentes sin mutar documento", () => {
    const document = documentWithClass();
    const snapshot = structuredClone(document);

    const result = executor().execute(document, {
      type: "ApplyLayout",
      elements: [{ elementId: ids.missing, x: 100, y: 120 }],
    });

    expect(result.success).toBe(false);
    expect(result.document).toEqual(snapshot);
    expect(document).toEqual(snapshot);
    expect(result.diagnostics).toMatchObject([{ code: "UML_UNKNOWN_REFERENCE", elementId: ids.missing }]);
  });

  it("rechaza MoveElement para entradas de layout inexistentes", () => {
    const document = documentWithClass();
    document.layout.elements = [];

    const result = executor().execute(document, { type: "MoveElement", elementId: ids.class, x: 100, y: 120 });

    expect(result.success).toBe(false);
    expect(result.document).toEqual(document);
    expect(result.diagnostics).toMatchObject([{ code: "UML_UNKNOWN_REFERENCE", elementId: ids.class }]);
  });

  it("captura y restaura atómicamente eliminaciones de clase, enum, relación, atributo y literal", () => {
    const document = documentWithTwoClasses();
    document.uml.classes[0].attributes.push({ id: ids.attribute, name: "codigo", visibility: "private", type: primitiveType("string") });
    document.uml.enumerations.push({ id: ids.enum, name: "Estado", visibility: "public", literals: ["NUEVO", "FINAL"] });
    document.uml.relationships.push({ id: ids.relationship, type: "Association", sourceId: ids.class, targetId: ids.otherClass });
    document.layout.elements.push({ elementId: ids.enum, x: 20, y: 40 }, { elementId: ids.relationship, x: 30, y: 50 });
    const cases: UmlCommand[] = [
      { type: "DeleteClass", classId: ids.class },
      { type: "DeleteEnumeration", enumerationId: ids.enum },
      { type: "DeleteRelationship", relationshipId: ids.relationship },
      { type: "RemoveAttribute", classId: ids.class, attributeId: ids.attribute },
      { type: "RemoveEnumerationLiteral", enumerationId: ids.enum, literal: "NUEVO" },
    ];

    for (const command of cases) {
      const deleted = executor().execute(document, command);
      expect(deleted.success).toBe(true);
      if (!deleted.success) throw new Error("La eliminación debe ser aceptada.");
      expect(deleted.deletionSnapshot).toBeDefined();
      if (!deleted.deletionSnapshot) throw new Error("La eliminación aceptada debe capturar su snapshot.");
      const restored = executor().execute(deleted.document, { type: "RestoreDeletionSnapshot", snapshot: deleted.deletionSnapshot });
      expect(restored.success).toBe(true);
      if (!restored.success) throw new Error("La restauración del snapshot aceptado debe completarse.");
      expect(restored.document.uml.classes.map((item) => item.id)).toEqual(document.uml.classes.map((item) => item.id));
      expect(restored.document.uml.enumerations.map((item) => item.id)).toEqual(document.uml.enumerations.map((item) => item.id));
      expect(restored.document.uml.relationships.map((item) => item.id)).toEqual(document.uml.relationships.map((item) => item.id));
      expect(restored.document.uml.classes.map((item) => item.attributes.map((attribute) => attribute.id))).toEqual(
        document.uml.classes.map((item) => item.attributes.map((attribute) => attribute.id)),
      );
      expect(restored.document.uml.enumerations.map((item) => item.literals)).toEqual(document.uml.enumerations.map((item) => item.literals));
      expect(restored.document.layout.elements.map((item) => item.elementId)).toEqual(document.layout.elements.map((item) => item.elementId));
    }
  });

  it("rechaza índices de restauración inválidos sin una mutación parcial", () => {
    const document = documentWithClass();
    const deleted = executor().execute(document, { type: "DeleteClass", classId: ids.class });
    expect(deleted.success).toBe(true);
    if (!deleted.success || !deleted.deletionSnapshot || deleted.deletionSnapshot.kind !== "class") return;
    const snapshot = structuredClone(deleted.deletionSnapshot);
    snapshot.classIndex = Number.MAX_SAFE_INTEGER + 1;
    const restored = executor().execute(deleted.document, { type: "RestoreDeletionSnapshot", snapshot });

    expect(restored.success).toBe(false);
    expect(restored.document).toEqual(deleted.document);
    expect(restored.diagnostics).toMatchObject([{ code: "UML_INVALID_TYPE" }]);
  });

  it("rechaza snapshots incompletos, incompatibles o con índices inválidos sin mutación parcial", () => {
    const document = documentWithTwoClasses();
    document.uml.classes[0].attributes.push({ id: ids.attribute, name: "codigo", visibility: "private", type: primitiveType("string") });
    document.uml.enumerations.push({ id: ids.enum, name: "Estado", visibility: "public", literals: ["NUEVO", "FINAL"] });
    document.uml.relationships.push({ id: ids.relationship, type: "Association", sourceId: ids.class, targetId: ids.otherClass });
    document.layout.elements.push({ elementId: ids.enum, x: 20, y: 40 }, { elementId: ids.relationship, x: 30, y: 50 });
    const deleted = executor().execute(document, { type: "DeleteClass", classId: ids.class });
    expect(deleted.success).toBe(true);
    if (!deleted.success || !deleted.deletionSnapshot || deleted.deletionSnapshot.kind !== "class") throw new Error("Se esperaba snapshot de clase.");

    const invalidSnapshots = [
      { ...structuredClone(deleted.deletionSnapshot), classIndex: -1 },
      { ...structuredClone(deleted.deletionSnapshot), classIndex: 0.5 },
      { ...structuredClone(deleted.deletionSnapshot), classIndex: Number.MAX_SAFE_INTEGER + 1 },
      { ...structuredClone(deleted.deletionSnapshot), classIndex: 99 },
      { ...structuredClone(deleted.deletionSnapshot), relationships: [{ ...deleted.deletionSnapshot.relationships[0], index: 0 }, { ...deleted.deletionSnapshot.relationships[0], index: 0 }] },
      { kind: "class", classIndex: 0, relationships: [], layouts: [] } as unknown as UmlCommand extends never ? never : typeof deleted.deletionSnapshot,
    ];

    for (const snapshot of invalidSnapshots) {
      const restored = executor().execute(deleted.document, { type: "RestoreDeletionSnapshot", snapshot });
      expect(restored.success).toBe(false);
      expect(restored.document).toEqual(deleted.document);
      expect(restored.diagnostics).toMatchObject([{ code: "UML_INVALID_TYPE" }]);
    }

    const attributeDeleted = executor().execute(document, { type: "RemoveAttribute", classId: ids.class, attributeId: ids.attribute });
    expect(attributeDeleted.success).toBe(true);
    if (!attributeDeleted.success || !attributeDeleted.deletionSnapshot || attributeDeleted.deletionSnapshot.kind !== "attribute") throw new Error("Se esperaba snapshot de atributo.");
    const incompatible = executor().execute(attributeDeleted.document, {
      type: "RestoreDeletionSnapshot",
      snapshot: { ...attributeDeleted.deletionSnapshot, classId: ids.missing },
    });
    expect(incompatible.success).toBe(false);
    expect(incompatible.document).toEqual(attributeDeleted.document);
  });

  it("no captura snapshots para eliminaciones rechazadas de atributo o literal", () => {
    const document = documentWithClass();
    const missingAttribute = executor().execute(document, { type: "RemoveAttribute", classId: ids.class, attributeId: ids.attribute });
    const missingLiteral = executor().execute(document, { type: "RemoveEnumerationLiteral", enumerationId: ids.enum, literal: "NUEVO" });

    expect(missingAttribute).toMatchObject({ success: false, document });
    expect(missingLiteral).toMatchObject({ success: false, document });
    expect(missingAttribute).not.toHaveProperty("deletionSnapshot");
    expect(missingLiteral).not.toHaveProperty("deletionSnapshot");
  });

  it("devuelve copia defensiva del documento original en rechazos del executor directo", () => {
    const original = documentWithClass();
    const result = executor().execute(original, { type: "CreateClass", classId: ids.otherClass, name: "" });

    expect(result.success).toBe(false);
    result.document.uml.classes.push(externalClass());

    expect(original.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente"]);
    expect(result.document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente", "MutacionExterna"]);
  });
});

describe("UmlCommandBus", () => {
  it("solo comandos aceptados generan historial y Undo/Redo restauran snapshots", () => {
    const bus = new UmlCommandBus(emptyDocument(), { executor: executor() });

    const created = bus.execute({ type: "CreateClass", classId: ids.class, name: "Cliente" });
    expect(created.success).toBe(true);
    expect(bus.getHistoryState()).toMatchObject({ canUndo: true, canRedo: false, undoCount: 1, redoCount: 0 });

    const rejected = bus.execute({ type: "CreateClass", classId: ids.otherClass, name: "" });
    expect(rejected.success).toBe(false);
    expect(bus.getHistoryState()).toMatchObject({ canUndo: true, canRedo: false, undoCount: 1, redoCount: 0 });

    const undone = bus.undo();
    expect(undone?.uml.classes).toEqual([]);
    expect(bus.getHistoryState()).toMatchObject({ canUndo: false, canRedo: true });

    const redone = bus.redo();
    expect(redone?.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente"]);
    expect(bus.getHistoryState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("registra ApplyLayout como una sola operación undoable y redoable", () => {
    const bus = new UmlCommandBus(documentWithTwoClasses(), { executor: executor() });
    const originalLayout = structuredClone(bus.document.layout.elements);
    const semanticBefore = structuredClone(bus.document.uml);

    const result = bus.execute({
      type: "ApplyLayout",
      elements: [
        { elementId: ids.class, x: 100, y: 120 },
        { elementId: ids.otherClass, x: 360, y: 240 },
      ],
    });

    expect(result.success).toBe(true);
    expect(bus.getHistoryState()).toMatchObject({ undoCount: 1, redoCount: 0 });
    expect(bus.document.uml).toEqual(semanticBefore);
    expect(bus.document.layout.elements.map((entry) => [entry.elementId, entry.x, entry.y])).toEqual([
      [ids.class, 100, 120],
      [ids.otherClass, 360, 240],
    ]);

    expect(bus.undo()?.layout.elements).toEqual(originalLayout);
    expect(bus.getHistoryState()).toMatchObject({ undoCount: 0, redoCount: 1 });

    const redone = bus.redo();
    expect(redone?.uml).toEqual(semanticBefore);
    expect(redone?.layout.elements.map((entry) => [entry.elementId, entry.x, entry.y])).toEqual([
      [ids.class, 100, 120],
      [ids.otherClass, 360, 240],
    ]);
  });

  it("limpia Redo cuando se ejecuta un comando nuevo después de Undo", () => {
    const bus = new UmlCommandBus(emptyDocument(), { executor: executor() });
    bus.execute({ type: "CreateClass", classId: ids.class, name: "Cliente" });
    bus.execute({ type: "CreateClass", classId: ids.otherClass, name: "Pedido" });
    bus.undo();
    expect(bus.canRedo).toBe(true);

    bus.execute({ type: "CreateClass", classId: ids.thirdClass, name: "Producto" });

    expect(bus.canRedo).toBe(false);
    expect(bus.document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente", "Producto"]);
  });

  it("usa límite inicial 100 y permite límite configurable con descarte de estados antiguos", () => {
    expect(new UmlCommandBus(emptyDocument()).historyLimit).toBe(100);
    const bus = new UmlCommandBus(emptyDocument(), { executor: executor(), historyLimit: 2 });

    bus.execute({ type: "CreateClass", classId: ids.class, name: "Clase1" });
    bus.execute({ type: "CreateClass", classId: ids.otherClass, name: "Clase2" });
    bus.execute({ type: "CreateClass", classId: ids.thirdClass, name: "Clase3" });

    expect(bus.getHistoryState()).toMatchObject({ undoCount: 2, historyLimit: 2 });
    expect(bus.undo()?.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Clase1", "Clase2"]);
    expect(bus.undo()?.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Clase1"]);
    expect(bus.undo()).toBeUndefined();
  });

  it("mantiene resultados e historial deterministas para el mismo orden de comandos", () => {
    const commands: UmlCommand[] = [
      { type: "CreateClass", classId: ids.class, name: "Cliente" },
      { type: "CreateClass", classId: ids.otherClass, name: "Pedido" },
      {
        type: "CreateRelationship",
        relationshipId: ids.relationship,
        relationshipType: "Association",
        sourceId: ids.class,
        targetId: ids.otherClass,
      },
    ];
    const first = new UmlCommandBus(emptyDocument(), { executor: executor() });
    const second = new UmlCommandBus(emptyDocument(), { executor: executor() });

    const firstResults = commands.map((command) => first.execute(command));
    const secondResults = commands.map((command) => second.execute(command));

    expect(firstResults).toEqual(secondResults);
    expect(first.document).toEqual(second.document);
    expect(first.getHistoryState()).toEqual(second.getHistoryState());
  });

  it("encapsula currentDocument frente a mutaciones del getter document", () => {
    const bus = new UmlCommandBus(documentWithClass(), { executor: executor() });

    const external = bus.document;
    external.uml.classes.push(externalClass());

    expect(bus.document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente"]);
  });

  it("encapsula currentDocument frente a mutaciones del CommandResult exitoso", () => {
    const bus = new UmlCommandBus(emptyDocument(), { executor: executor() });

    const result = bus.execute({ type: "CreateClass", classId: ids.class, name: "Cliente" });
    result.document.uml.classes.push(externalClass());

    expect(result.success).toBe(true);
    expect(bus.document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente"]);
  });

  it("encapsula currentDocument frente a mutaciones del CommandResult rechazado", () => {
    const bus = new UmlCommandBus(documentWithClass(), { executor: executor() });

    const rejected = bus.execute({ type: "CreateClass", classId: ids.otherClass, name: "" });
    rejected.document.uml.classes.push(externalClass());

    expect(rejected.success).toBe(false);
    expect(bus.document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente"]);
    expect(bus.getHistoryState()).toMatchObject({ undoCount: 0, redoCount: 0 });
  });

  it("encapsula currentDocument frente a mutaciones del resultado de undo", () => {
    const bus = new UmlCommandBus(emptyDocument(), { executor: executor() });
    bus.execute({ type: "CreateClass", classId: ids.class, name: "Cliente" });

    const undone = bus.undo();
    expect(undone).toBeDefined();
    undone?.uml.classes.push(externalClass());

    expect(bus.document.uml.classes).toEqual([]);
    expect(bus.canRedo).toBe(true);
  });

  it("encapsula currentDocument frente a mutaciones del resultado de redo", () => {
    const bus = new UmlCommandBus(emptyDocument(), { executor: executor() });
    bus.execute({ type: "CreateClass", classId: ids.class, name: "Cliente" });
    bus.undo();

    const redone = bus.redo();
    expect(redone).toBeDefined();
    redone?.uml.classes.push(externalClass());

    expect(bus.document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Cliente"]);
  });
});
