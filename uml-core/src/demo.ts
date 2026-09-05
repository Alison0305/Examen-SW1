import {
  createProjectDocument,
  enumerationReferenceType,
  multiplicity,
  primitiveType,
  serializeProjectDocument,
  deserializeProjectDocument,
  validateProjectDocument,
  type ProjectDocument,
} from "./index.js";

const ids = {
  project: "11111111-1111-4111-8111-111111111111",
  userClass: "22222222-2222-4222-8222-222222222222",
  profileClass: "33333333-3333-4333-8333-333333333333",
  statusEnum: "44444444-4444-4444-8444-444444444444",
  statusAttribute: "55555555-5555-4555-8555-555555555555",
  operation: "66666666-6666-4666-8666-666666666666",
  parameter: "77777777-7777-4777-8777-777777777777",
  relationship: "88888888-8888-4888-8888-888888888888",
  invalidAttribute: "99999999-9999-4999-8999-999999999999",
};

function createValidDemoProject(): ProjectDocument {
  const document = createProjectDocument({
    now: new Date("2026-09-04T10:00:00.000Z"),
    uuidFactory: () => ids.project,
  });

  document.uml.enumerations.push({
    id: ids.statusEnum,
    name: "EstadoUsuario",
    visibility: "public",
    literals: ["ACTIVO", "INACTIVO"],
  });
  document.uml.classes.push(
    {
      id: ids.userClass,
      name: "Usuario",
      visibility: "public",
      attributes: [
        {
          id: ids.statusAttribute,
          name: "estado",
          visibility: "private",
          type: enumerationReferenceType(ids.statusEnum),
          multiplicity: multiplicity(1),
          generationMetadata: { required: true, searchable: true, sortable: true },
        },
      ],
      operations: [
        {
          id: ids.operation,
          name: "activar",
          visibility: "public",
          parameters: [{ id: ids.parameter, name: "confirmado", type: primitiveType("boolean") }],
          returnType: primitiveType("boolean"),
        },
      ],
      generationMetadata: { entity: true, auditable: true, crud: { create: true, read: true, update: true } },
    },
    {
      id: ids.profileClass,
      name: "Perfil",
      visibility: "public",
      attributes: [],
      operations: [],
    },
  );
  document.uml.relationships.push({
    id: ids.relationship,
    type: "Association",
    sourceId: ids.userClass,
    targetId: ids.profileClass,
    sourceMultiplicity: multiplicity(1),
    targetMultiplicity: multiplicity(0, "unbounded"),
  });
  document.layout.elements.push({ elementId: ids.userClass, x: 80, y: 120, width: 180, height: 120 });

  return document;
}

const validProject = createValidDemoProject();
const validResult = validateProjectDocument(validProject);
const serialized = serializeProjectDocument(validProject);
const reconstructed = deserializeProjectDocument(serialized);

console.log("Proyecto creado correctamente.");
console.log(`Clases: ${validProject.uml.classes.length}`);
console.log(`Enumeraciones: ${validProject.uml.enumerations.length}`);
console.log(`Relaciones: ${validProject.uml.relationships.length}`);
console.log("");
console.log("Validación:");
console.log(`${validResult.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length} errores`);
console.log(`${validResult.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length} advertencias`);
console.log(`Serialización JSON: ${JSON.stringify(reconstructed) === JSON.stringify(validProject) ? "correcta" : "incorrecta"}`);

const invalidProject = createValidDemoProject();
invalidProject.uml.classes[0].attributes.push({
  id: ids.statusAttribute,
  name: "estadoDuplicado",
  visibility: "private",
  type: primitiveType("string"),
  multiplicity: { lower: 5, upper: 2 },
});
invalidProject.uml.classes[0].attributes.push({
  id: ids.invalidAttribute,
  name: "orden",
  visibility: "private",
  type: primitiveType("integer"),
  generationMetadata: { defaultSort: "asc" },
});

const invalidResult = validateProjectDocument(invalidProject);

console.log("");
console.log("Modelo inválido:");
console.log("Validación:");
console.log(`${invalidResult.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length} errores`);
console.log(`${invalidResult.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length} advertencias`);
invalidResult.diagnostics.forEach((diagnostic) => {
  console.log(`${diagnostic.code} ${diagnostic.path}`);
});
