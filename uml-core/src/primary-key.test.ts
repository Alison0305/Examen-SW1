import { describe, expect, it } from "vitest";
import { UmlCommandBus } from "./commands/command-bus.js";
import { createProjectDocument, primitiveType, type ProjectDocument, type UmlAttribute, type UmlClass } from "./model.js";
import { isPrimaryKeyAttribute, primaryKeyStatus } from "./primary-key.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const attribute = (n: number, name: string, extra: Partial<UmlAttribute> = {}): UmlAttribute => ({ id: id(n), name, visibility: "private", type: primitiveType("integer"), ...extra });
const umlClass = (attributes: UmlAttribute[], extra: Partial<UmlClass> = {}): UmlClass => ({ id: id(1), name: "Cliente", visibility: "public", attributes, operations: [], ...extra });

function documentWith(classes: UmlClass[]): ProjectDocument {
  const document = createProjectDocument();
  document.uml.classes.push(...classes);
  return document;
}

describe("isPrimaryKeyAttribute", () => {
  it("usa la marca explícita y, sin ella, la convención del nombre id", () => {
    expect(isPrimaryKeyAttribute(attribute(10, "id"))).toBe(true);
    expect(isPrimaryKeyAttribute(attribute(10, "ID"))).toBe(false);
    expect(isPrimaryKeyAttribute(attribute(10, "codigo", { generationMetadata: { identifier: true } }))).toBe(true);
    expect(isPrimaryKeyAttribute(attribute(10, "id", { generationMetadata: { identifier: false } }))).toBe(false);
  });
});

describe("primaryKeyStatus", () => {
  it("distingue una, ninguna o varias llaves, y no la exige donde el generador no la necesita", () => {
    const model = createProjectDocument().uml;
    expect(primaryKeyStatus(model, umlClass([attribute(10, "id"), attribute(11, "nombre")]))).toEqual({ kind: "single", attributeId: id(10) });
    expect(primaryKeyStatus(model, umlClass([attribute(11, "nombre")]))).toEqual({ kind: "missing" });
    expect(primaryKeyStatus(model, umlClass([attribute(10, "id"), attribute(11, "codigo", { generationMetadata: { identifier: true } })]))).toEqual({ kind: "multiple", attributeIds: [id(10), id(11)] });
    expect(primaryKeyStatus(model, umlClass([], { generationMetadata: { entity: false } }))).toEqual({ kind: "not-required" });
    const withAssociationClass = { ...model, relationships: [{ id: id(9), type: "Association" as const, sourceId: id(2), targetId: id(3), associationClassId: id(1) }] };
    expect(primaryKeyStatus(withAssociationClass, umlClass([]))).toEqual({ kind: "not-required" });
  });
});

describe("SetAttributeIdentifiers", () => {
  it("cambia la llave primaria en un solo paso deshacible y conserva el resto de metadatos", () => {
    const bus = new UmlCommandBus(documentWith([umlClass([attribute(10, "id"), attribute(11, "codigo", { generationMetadata: { unique: true } })])]));
    const result = bus.execute({ type: "SetAttributeIdentifiers", classId: id(1), identifiers: [{ attributeId: id(10), identifier: false }, { attributeId: id(11), identifier: true }] });

    expect(result.success).toBe(true);
    const [idAttribute, codigo] = bus.document.uml.classes[0]!.attributes;
    expect(idAttribute!.generationMetadata).toEqual({ identifier: false });
    expect(codigo!.generationMetadata).toEqual({ unique: true, identifier: true });
    expect(primaryKeyStatus(bus.document.uml, bus.document.uml.classes[0]!)).toEqual({ kind: "single", attributeId: id(11) });

    bus.undo();
    expect(bus.document.uml.classes[0]!.attributes.map((entry) => entry.generationMetadata)).toEqual([undefined, { unique: true }]);
  });

  it("una entrada sin identifier quita la marca y vuelve a la convención", () => {
    const bus = new UmlCommandBus(documentWith([umlClass([attribute(10, "id", { generationMetadata: { identifier: false } })])]));
    expect(bus.execute({ type: "SetAttributeIdentifiers", classId: id(1), identifiers: [{ attributeId: id(10) }] }).success).toBe(true);
    expect(bus.document.uml.classes[0]!.attributes[0]!.generationMetadata).toBeUndefined();
  });

  it("rechaza atributos inexistentes o una lista vacía sin tocar el documento", () => {
    const document = documentWith([umlClass([attribute(10, "id")])]);
    const bus = new UmlCommandBus(document);
    expect(bus.execute({ type: "SetAttributeIdentifiers", classId: id(1), identifiers: [{ attributeId: id(99), identifier: true }] }).success).toBe(false);
    expect(bus.execute({ type: "SetAttributeIdentifiers", classId: id(1), identifiers: [] }).success).toBe(false);
    expect(bus.document).toEqual(document);
  });
});

describe("primaryKeyStatus con generalización", () => {
  const generalization = (n: number, child: number, parent: number) => ({ id: id(n), type: "Generalization" as const, sourceId: id(child), targetId: id(parent) });
  const persona = umlClass([attribute(10, "id"), attribute(11, "nombre")], { id: id(1), name: "Persona" });
  const cliente = umlClass([attribute(20, "ruc")], { id: id(2), name: "Cliente" });
  const vip = umlClass([], { id: id(3), name: "ClienteVip" });

  it("la hija sin llave propia hereda la del padre, también a través de varios niveles", () => {
    const model = { classes: [persona, cliente, vip], relationships: [generalization(8, 3, 2), generalization(9, 2, 1)] };
    expect(primaryKeyStatus(model, cliente)).toEqual({ kind: "inherited", attributeId: id(10), fromClassId: id(1) });
    expect(primaryKeyStatus(model, vip)).toEqual({ kind: "inherited", attributeId: id(10), fromClassId: id(1) });
  });

  it("sigue faltando si ningún ancestro tiene llave, y no se cuelga con ciclos", () => {
    const sinLlave = umlClass([attribute(11, "nombre")], { id: id(1), name: "Persona" });
    expect(primaryKeyStatus({ classes: [sinLlave, cliente], relationships: [generalization(9, 2, 1)] }, cliente)).toEqual({ kind: "missing" });
    const a = umlClass([], { id: id(4), name: "A" });
    const b = umlClass([], { id: id(5), name: "B" });
    expect(primaryKeyStatus({ classes: [a, b], relationships: [generalization(6, 4, 5), generalization(7, 5, 4)] }, a)).toEqual({ kind: "missing" });
  });
});
