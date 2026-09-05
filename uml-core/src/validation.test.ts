import { describe, expect, it } from "vitest";
import {
  createProjectDocument,
  enumerationReferenceType,
  multiplicity,
  primitiveType,
  validateCanonicalUmlModel,
  validateProjectDocument,
  type CanonicalUmlModel,
  type GenerationMetadata,
  type ProjectDocument,
} from "./index.js";

const ids = {
  document: "11111111-1111-4111-8111-111111111111",
  package: "22222222-2222-4222-8222-222222222222",
  childPackage: "33333333-3333-4333-8333-333333333333",
  class: "44444444-4444-4444-8444-444444444444",
  otherClass: "55555555-5555-4555-8555-555555555555",
  enum: "66666666-6666-4666-8666-666666666666",
  attribute: "77777777-7777-4777-8777-777777777777",
  otherAttribute: "77777777-7777-4777-8777-777777777778",
  operation: "88888888-8888-4888-8888-888888888888",
  parameter: "99999999-9999-4999-8999-999999999999",
  relationship: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherRelationship: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  thirdRelationship: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  missing: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

function validModel(): CanonicalUmlModel {
  return {
    packages: [{ id: ids.package, name: "ventas" }],
    enumerations: [
      {
        id: ids.enum,
        name: "EstadoUsuario",
        visibility: "public",
        literals: ["ACTIVO", "INACTIVO"],
        packageId: ids.package,
      },
    ],
    classes: [
      {
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
            generationMetadata: { required: true, searchable: true, sortable: true, defaultSort: "asc" },
          },
        ],
        operations: [
          {
            id: ids.operation,
            name: "activar",
            visibility: "public",
            parameters: [{ id: ids.parameter, name: "valor", type: primitiveType("boolean") }],
            returnType: primitiveType("boolean"),
          },
        ],
        generationMetadata: { entity: true, auditable: true, crud: { create: true, read: true } },
      },
      {
        id: ids.otherClass,
        name: "Perfil",
        visibility: "public",
        attributes: [],
        operations: [],
      },
    ],
    relationships: [
      {
        id: ids.relationship,
        type: "Association",
        sourceId: ids.class,
        targetId: ids.otherClass,
        sourceMultiplicity: multiplicity(1),
        targetMultiplicity: multiplicity(0, "unbounded"),
      },
    ],
  };
}

function documentWith(model: CanonicalUmlModel): ProjectDocument {
  const document = createProjectDocument({
    now: new Date("2026-09-04T10:00:00.000Z"),
    uuidFactory: () => ids.document,
  });
  document.uml = model;
  return document;
}

describe("validación UML", () => {
  it("devuelve un resultado estructurado sin errores para un modelo válido", () => {
    const result = validateCanonicalUmlModel(validModel());

    expect(result).toEqual({ diagnostics: [], hasErrors: false });
  });

  it("valida ProjectDocument, revision y layout", () => {
    const document = documentWith(validModel());
    document.layout.elements.push({ elementId: ids.class, x: 10, y: 20 });

    expect(validateProjectDocument(document).diagnostics).toEqual([]);

    document.revision = 0;
    document.layout.elements.push({ elementId: ids.missing, x: 0, y: 0 });

    expect(validateProjectDocument(document).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "UML_UNKNOWN_REFERENCE",
      "UML_INVALID_REVISION",
    ]);
  });

  it("detecta UUID inválidos y duplicados", () => {
    const model = validModel();
    model.classes[1].id = ids.class;
    model.enumerations[0].id = "not-a-uuid";

    const codes = validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain("UML_DUPLICATE_ID");
    expect(codes).toContain("UML_INVALID_ID");
  });

  it("detecta nombres obligatorios y duplicados por ámbito", () => {
    const model = validModel();
    model.classes[0].name = "";
    model.classes[1].name = "";
    model.classes[0].attributes.push({
      id: ids.otherAttribute,
      name: "estado",
      visibility: "private",
      type: primitiveType("string"),
    });

    const codes = validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes.filter((code) => code === "UML_REQUIRED_NAME")).toHaveLength(2);
    expect(codes).toContain("UML_DUPLICATE_NAME");
  });

  it("detecta referencias y tipos inexistentes", () => {
    const model = validModel();
    model.classes[0].packageId = ids.missing;
    model.classes[0].attributes[0].type = enumerationReferenceType(ids.missing);

    const codes = validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain("UML_UNKNOWN_REFERENCE");
    expect(codes).toContain("UML_UNKNOWN_TYPE_REFERENCE");
  });

  it("detecta relaciones inválidas y generalización a sí misma", () => {
    const model = validModel();
    model.relationships.push(
      { id: ids.otherRelationship, type: "Association", sourceId: ids.missing, targetId: ids.otherClass },
      { id: ids.thirdRelationship, type: "Generalization", sourceId: ids.class, targetId: ids.class },
    );

    const codes = validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain("UML_INVALID_RELATIONSHIP");
    expect(codes).toContain("UML_SELF_GENERALIZATION");
  });

  it("detecta ciclos de herencia", () => {
    const model = validModel();
    model.relationships = [
      { id: ids.relationship, type: "Generalization", sourceId: ids.class, targetId: ids.otherClass },
      { id: ids.otherRelationship, type: "Generalization", sourceId: ids.otherClass, targetId: ids.class },
    ];

    expect(validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "UML_INHERITANCE_CYCLE",
    ]);
  });

  it("detecta multiplicidades inválidas y permite upper ilimitado", () => {
    const model = validModel();
    model.classes[0].attributes[0].multiplicity = { lower: 5, upper: 2 };
    model.relationships[0].targetMultiplicity = { lower: 0, upper: "unbounded" };

    expect(validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "UML_INVALID_MULTIPLICITY",
    ]);
  });

  it("detecta paquete padre inexistente y ciclos entre paquetes", () => {
    const model = validModel();
    model.packages = [
      { id: ids.package, name: "padre", parentPackageId: ids.childPackage },
      { id: ids.childPackage, name: "hijo", parentPackageId: ids.package },
      { id: ids.missing, name: "huérfano", parentPackageId: ids.relationship },
    ];

    expect(validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "UML_PACKAGE_CYCLE",
      "UML_UNKNOWN_REFERENCE",
    ]);
  });

  it("emite errores y warnings para generationMetadata incoherente", () => {
    const model = validModel();
    model.classes[0].generationMetadata = {
      entity: "yes",
      defaultSort: "desc",
    } as unknown as GenerationMetadata;

    expect(validateCanonicalUmlModel(model).diagnostics).toMatchObject([
      { severity: "warning", code: "UML_INCOHERENT_GENERATION_METADATA" },
      { severity: "error", code: "UML_INVALID_GENERATION_METADATA" },
    ]);
  });

  it("mantiene orden determinista de diagnósticos", () => {
    const model = validModel();
    model.classes[0].attributes[0].multiplicity = { lower: -1, upper: 1 };
    model.relationships[0].sourceId = ids.missing;
    const first = validateCanonicalUmlModel(model).diagnostics;
    const second = validateCanonicalUmlModel(model).diagnostics;

    expect(second).toEqual(first);
    expect(first.map((diagnostic) => `${diagnostic.path}:${diagnostic.code}:${diagnostic.elementId ?? ""}`)).toEqual(
      second.map((diagnostic) => `${diagnostic.path}:${diagnostic.code}:${diagnostic.elementId ?? ""}`),
    );
  });
});
