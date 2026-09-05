import { describe, expect, it } from "vitest";
import {
  UML_PRIMITIVE_TYPES,
  UML_RELATIONSHIP_TYPES,
  UML_VISIBILITIES,
  classReferenceType,
  createProjectDocument,
  deserializeProjectDocument,
  enumerationReferenceType,
  multiplicity,
  primitiveType,
  serializeProjectDocument,
  type GenerationMetadata,
  type UmlAttribute,
  type UmlClass,
  type UmlEnumeration,
  type UmlOperation,
  type UmlPackage,
  type UmlRelationship,
} from "./index.js";

const ids = {
  document: "11111111-1111-4111-8111-111111111111",
  package: "22222222-2222-4222-8222-222222222222",
  childPackage: "33333333-3333-4333-8333-333333333333",
  class: "44444444-4444-4444-8444-444444444444",
  otherClass: "55555555-5555-4555-8555-555555555555",
  enum: "66666666-6666-4666-8666-666666666666",
  attribute: "77777777-7777-4777-8777-777777777777",
  operation: "88888888-8888-4888-8888-888888888888",
  parameter: "99999999-9999-4999-8999-999999999999",
  relationship: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("dominio UML", () => {
  it("define visibilidades y tipos primitivos soportados", () => {
    expect(UML_VISIBILITIES).toEqual(["public", "private", "protected", "package"]);
    expect(UML_PRIMITIVE_TYPES).toEqual([
      "string",
      "integer",
      "boolean",
      "number",
      "date",
      "datetime",
    ]);
  });

  it("distingue tipos primitivos de referencias a clases y enumeraciones", () => {
    expect(primitiveType("string")).toEqual({ kind: "primitive", name: "string" });
    expect(classReferenceType(ids.class)).toEqual({
      kind: "reference",
      referenceType: "class",
      elementId: ids.class,
    });
    expect(enumerationReferenceType(ids.enum)).toEqual({
      kind: "reference",
      referenceType: "enumeration",
      elementId: ids.enum,
    });
  });

  it("representa clases, atributos, operaciones y parámetros tipados", () => {
    const metadata: GenerationMetadata = {
      entity: true,
      auditable: true,
      readOnly: false,
      searchable: true,
      crud: { create: true, read: true, update: true, delete: false },
      required: true,
      unique: true,
      sortable: true,
      defaultSort: "asc",
    };
    const attribute: UmlAttribute = {
      id: ids.attribute,
      name: "nombre",
      visibility: "private",
      type: primitiveType("string"),
      multiplicity: multiplicity(1),
      generationMetadata: metadata,
    };
    const operation: UmlOperation = {
      id: ids.operation,
      name: "renombrar",
      visibility: "public",
      parameters: [{ id: ids.parameter, name: "nuevoNombre", type: primitiveType("string") }],
      returnType: primitiveType("boolean"),
    };
    const umlClass: UmlClass = {
      id: ids.class,
      name: "Usuario",
      visibility: "public",
      packageId: ids.package,
      attributes: [attribute],
      operations: [operation],
      generationMetadata: metadata,
    };

    expect(umlClass).toMatchObject({
      id: ids.class,
      name: "Usuario",
      visibility: "public",
      packageId: ids.package,
      generationMetadata: metadata,
    });
    expect(umlClass.attributes[0]).toEqual(attribute);
    expect(umlClass.operations[0]).toEqual(operation);
  });

  it("representa enumeraciones y paquetes anidados", () => {
    const parentPackage: UmlPackage = { id: ids.package, name: "ventas" };
    const childPackage: UmlPackage = {
      id: ids.childPackage,
      name: "catalogo",
      parentPackageId: ids.package,
    };
    const enumeration: UmlEnumeration = {
      id: ids.enum,
      name: "EstadoUsuario",
      visibility: "public",
      literals: ["ACTIVO", "INACTIVO"],
      packageId: ids.childPackage,
    };

    expect(parentPackage.parentPackageId).toBeUndefined();
    expect(childPackage.parentPackageId).toBe(ids.package);
    expect(enumeration.literals).toEqual(["ACTIVO", "INACTIVO"]);
  });

  it("representa multiplicidades estructuradas finitas e ilimitadas", () => {
    expect(multiplicity(1)).toEqual({ lower: 1, upper: 1 });
    expect(multiplicity(0, 1)).toEqual({ lower: 0, upper: 1 });
    expect(multiplicity(0, "unbounded")).toEqual({ lower: 0, upper: "unbounded" });
    expect(multiplicity(1, "unbounded")).toEqual({ lower: 1, upper: "unbounded" });
    expect(multiplicity(2, 5)).toEqual({ lower: 2, upper: 5 });
  });

  it("representa relaciones UML tipadas con identidad propia", () => {
    expect(UML_RELATIONSHIP_TYPES).toEqual([
      "Association",
      "Aggregation",
      "Composition",
      "Generalization",
    ]);

    const relationshipTypes = UML_RELATIONSHIP_TYPES.map((type): UmlRelationship => ({
      id: `${type}-${ids.relationship}`,
      type,
      sourceId: ids.class,
      targetId: ids.otherClass,
      sourceMultiplicity: multiplicity(1),
      targetMultiplicity: multiplicity(0, "unbounded"),
    }));

    expect(relationshipTypes.map((relationship) => relationship.type)).toEqual([
      "Association",
      "Aggregation",
      "Composition",
      "Generalization",
    ]);
    expect(relationshipTypes.every((relationship) => relationship.sourceId === ids.class)).toBe(true);
    expect(relationshipTypes.every((relationship) => relationship.targetId === ids.otherClass)).toBe(true);
  });

  it("serializa y reconstruye un documento completo sin pérdida", () => {
    const document = createProjectDocument({
      now: new Date("2026-09-04T10:00:00.000Z"),
      uuidFactory: () => ids.document,
    });

    document.uml.packages.push({ id: ids.package, name: "ventas" });
    document.uml.enumerations.push({
      id: ids.enum,
      name: "EstadoUsuario",
      visibility: "public",
      literals: ["ACTIVO", "INACTIVO"],
      packageId: ids.package,
    });
    document.uml.classes.push({
      id: ids.class,
      name: "Usuario",
      visibility: "public",
      packageId: ids.package,
      attributes: [
        {
          id: ids.attribute,
          name: "estado",
          visibility: "private",
          type: enumerationReferenceType(ids.enum),
          multiplicity: multiplicity(1),
          generationMetadata: { required: true, searchable: true, sortable: true },
        },
      ],
      operations: [
        {
          id: ids.operation,
          name: "cambiarEstado",
          visibility: "public",
          parameters: [{ id: ids.parameter, name: "estado", type: enumerationReferenceType(ids.enum) }],
        },
      ],
      generationMetadata: { entity: true, auditable: true },
    });
    document.uml.classes.push({
      id: ids.otherClass,
      name: "Perfil",
      visibility: "public",
      attributes: [],
      operations: [],
    });
    document.uml.relationships.push({
      id: ids.relationship,
      type: "Association",
      sourceId: ids.class,
      targetId: ids.otherClass,
      sourceMultiplicity: multiplicity(1),
      targetMultiplicity: multiplicity(0, "unbounded"),
    });
    document.layout.elements.push({ elementId: ids.class, x: 10, y: 20, width: 140, height: 90 });

    expect(deserializeProjectDocument(serializeProjectDocument(document))).toEqual(document);
  });
});
