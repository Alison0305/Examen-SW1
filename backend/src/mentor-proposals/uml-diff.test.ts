import { classReferenceType, createProjectDocument, enumerationReferenceType, primitiveType, type ProjectDocument, type UmlAttribute } from "@examen-sw1/uml-core";
import { describe, expect, it } from "vitest";
import { previewMentorProposal } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";
import { diffCanonicalUml } from "./uml-diff";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000010";
const NOMBRE_ID = "00000000-0000-4000-8000-000000000011";
const PEDIDO_ID = "00000000-0000-4000-8000-000000000020";
const ESTADO_ID = "00000000-0000-4000-8000-000000000030";
const ATTR_A = "00000000-0000-4000-8000-0000000000a1";
const ATTR_B = "00000000-0000-4000-8000-0000000000a2";
const ALL_IDS = [DOCUMENT_ID, CLIENTE_ID, NOMBRE_ID, PEDIDO_ID, ESTADO_ID, ATTR_A, ATTR_B];

function documentFixture(): ProjectDocument {
  const document = createProjectDocument({ id: DOCUMENT_ID, now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push(
    { id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: NOMBRE_ID, name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] },
    { id: PEDIDO_ID, name: "Pedido", visibility: "public", attributes: [], operations: [] },
  );
  document.uml.enumerations.push({ id: ESTADO_ID, name: "Estado", visibility: "public", literals: ["NUEVO"] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 }, { elementId: PEDIDO_ID, x: 240, y: 0 }, { elementId: ESTADO_ID, x: 480, y: 0 });
  return document;
}

const attribute = (id: string, name: string, overrides: Partial<UmlAttribute> = {}): UmlAttribute => ({ id, name, visibility: "private", type: primitiveType("string"), ...overrides });

function withAttribute(document: ProjectDocument, classIndex: number, value: UmlAttribute): ProjectDocument {
  const copy = structuredClone(document);
  copy.uml.classes[classIndex]!.attributes.push(value);
  return copy;
}

describe("diffCanonicalUml", () => {
  it("D-01 un atributo agregado produce exactamente una línea semántica", () => {
    const before = documentFixture();
    const after = withAttribute(before, 0, attribute(ATTR_A, "telefono"));
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([{ kind: "added", element: "attribute", label: "Cliente.telefono: string" }]);
  });

  it("D-02 conserva la tilde del nombre del atributo", () => {
    const before = documentFixture();
    const after = withAttribute(before, 0, attribute(ATTR_A, "teléfono"));
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }]);
  });

  it("D-03 representa la multiplicidad con el formato canónico", () => {
    const before = documentFixture();
    const after = withAttribute(before, 0, attribute(ATTR_A, "correos", { multiplicity: { lower: 0, upper: "unbounded" } }));
    const ranged = withAttribute(before, 0, attribute(ATTR_A, "telefonos", { multiplicity: { lower: 2, upper: 5 } }));
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([{ kind: "added", element: "attribute", label: "Cliente.correos: string [0..*]" }]);
    expect(diffCanonicalUml(before.uml, ranged.uml)[0]?.label).toBe("Cliente.telefonos: string [2..5]");
  });

  it("D-04 sin multiplicidad no muestra ninguna", () => {
    const before = documentFixture();
    const after = withAttribute(before, 1, attribute(ATTR_A, "fecha", { type: primitiveType("date") }));
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([{ kind: "added", element: "attribute", label: "Pedido.fecha: date" }]);
  });

  it("D-05 un cambio solo de revisión no produce diff", () => {
    const before = documentFixture();
    const after = structuredClone(before);
    after.revision = 11;
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([]);
  });

  it("D-06 un cambio solo de timestamps no produce diff", () => {
    const before = documentFixture();
    const after = structuredClone(before);
    after.updatedAt = "2026-11-11T09:30:00.000Z";
    after.createdAt = "2026-01-01T00:00:00.000Z";
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([]);
  });

  it("D-07 un cambio solo de layout no produce diff", () => {
    const before = documentFixture();
    const after = structuredClone(before);
    after.layout.elements = after.layout.elements.map((entry) => ({ ...entry, x: entry.x + 500, y: entry.y + 90, width: 300, height: 200 }));
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([]);
  });

  it("D-08 el mismo UML produce un diff vacío, sin mensajes artificiales", () => {
    const before = documentFixture();
    expect(diffCanonicalUml(before.uml, structuredClone(before.uml))).toEqual([]);
    expect(diffCanonicalUml(before.uml, before.uml)).toEqual([]);
  });

  it("D-09 el orden no depende del orden interno de los arreglos", () => {
    const before = documentFixture();
    const first = withAttribute(withAttribute(before, 1, attribute(ATTR_B, "total", { type: primitiveType("number") })), 0, attribute(ATTR_A, "telefono"));
    const second = structuredClone(first);
    second.uml.classes.reverse();
    second.uml.classes.forEach((umlClass) => umlClass.attributes.reverse());

    const expected = [
      { kind: "added", element: "attribute", label: "Cliente.telefono: string" },
      { kind: "added", element: "attribute", label: "Pedido.total: number" },
    ];
    expect(diffCanonicalUml(before.uml, first.uml)).toEqual(expected);
    expect(diffCanonicalUml(before.uml, second.uml)).toEqual(expected);
  });

  it("ordena por categoría: clases antes que atributos", () => {
    const before = documentFixture();
    const after = withAttribute(before, 0, attribute(ATTR_A, "telefono"));
    after.uml.classes.push({ id: "00000000-0000-4000-8000-000000000040", name: "Pago", visibility: "public", attributes: [attribute(ATTR_B, "monto", { type: primitiveType("number") })], operations: [] });

    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([
      { kind: "added", element: "class", label: "Clase Pago" },
      { kind: "added", element: "attribute", label: "Cliente.telefono: string" },
      { kind: "added", element: "attribute", label: "Pago.monto: number" },
    ]);
  });

  it("D-10 el diff no contiene identificadores internos", () => {
    const before = documentFixture();
    const after = withAttribute(withAttribute(before, 0, attribute(ATTR_A, "telefono")), 1, attribute(ATTR_B, "cliente", { type: classReferenceType(CLIENTE_ID) }));
    after.uml.classes[0]!.attributes.splice(0, 1);
    const serialized = JSON.stringify(diffCanonicalUml(before.uml, after.uml));
    for (const id of ALL_IDS) expect(serialized).not.toContain(id);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("D-11 no muta ninguno de los modelos", () => {
    const before = documentFixture();
    const after = withAttribute(before, 0, attribute(ATTR_A, "telefono"));
    after.uml.classes.reverse();
    const beforeSnapshot = structuredClone(before);
    const afterSnapshot = structuredClone(after);

    diffCanonicalUml(before.uml, after.uml);

    expect(before).toEqual(beforeSnapshot);
    expect(after).toEqual(afterSnapshot);
  });

  it("no emite una línea de clase cuando solo se le agrega un atributo", () => {
    const before = documentFixture();
    const after = withAttribute(before, 0, attribute(ATTR_A, "telefono"));
    expect(diffCanonicalUml(before.uml, after.uml).filter((line) => line.element === "class")).toEqual([]);
  });

  it("detecta un atributo eliminado", () => {
    const before = withAttribute(documentFixture(), 0, attribute(ATTR_A, "telefono"));
    const after = structuredClone(before);
    after.uml.classes[0]!.attributes = after.uml.classes[0]!.attributes.filter((entry) => entry.id !== ATTR_A);
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([{ kind: "removed", element: "attribute", label: "Cliente.telefono: string" }]);
  });

  it("detecta un atributo modificado en nombre, tipo o multiplicidad, pero no en visibilidad", () => {
    const before = withAttribute(documentFixture(), 0, attribute(ATTR_A, "telefono"));
    const typed = structuredClone(before);
    typed.uml.classes[0]!.attributes[1]!.type = primitiveType("integer");
    const multiple = structuredClone(before);
    multiple.uml.classes[0]!.attributes[1]!.multiplicity = { lower: 0, upper: 1 };
    const visibility = structuredClone(before);
    visibility.uml.classes[0]!.attributes[1]!.visibility = "public";

    expect(diffCanonicalUml(before.uml, typed.uml)).toEqual([{ kind: "changed", element: "attribute", label: "Cliente.telefono: string → Cliente.telefono: integer" }]);
    expect(diffCanonicalUml(before.uml, multiple.uml)).toEqual([{ kind: "changed", element: "attribute", label: "Cliente.telefono: string → Cliente.telefono: string [0..1]" }]);
    expect(diffCanonicalUml(before.uml, visibility.uml)).toEqual([]);
  });

  it("detecta clases creadas, eliminadas y renombradas sin repetir líneas por sus atributos sin cambios", () => {
    const before = documentFixture();
    const renamed = structuredClone(before);
    renamed.uml.classes[0]!.name = "Comprador";
    const removed = structuredClone(before);
    removed.uml.classes.splice(1, 1);

    expect(diffCanonicalUml(before.uml, renamed.uml)).toEqual([{ kind: "changed", element: "class", label: "Clase Cliente → Clase Comprador" }]);
    expect(diffCanonicalUml(before.uml, removed.uml)).toEqual([{ kind: "removed", element: "class", label: "Clase Pedido" }]);
  });

  it("muestra los tipos de referencia por el nombre visible del elemento", () => {
    const before = documentFixture();
    const after = withAttribute(withAttribute(before, 1, attribute(ATTR_A, "cliente", { type: classReferenceType(CLIENTE_ID) })), 1, attribute(ATTR_B, "estado", { type: enumerationReferenceType(ESTADO_ID) }));
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([
      { kind: "added", element: "attribute", label: "Pedido.cliente: Cliente" },
      { kind: "added", element: "attribute", label: "Pedido.estado: Estado" },
    ]);
  });

  it("no compara todavía enumeraciones ni relaciones", () => {
    const before = documentFixture();
    const after = structuredClone(before);
    after.uml.enumerations[0]!.literals.push("PAGADO");
    after.uml.relationships.push({ id: "00000000-0000-4000-8000-000000000050", type: "Association", sourceId: CLIENTE_ID, targetId: PEDIDO_ID });
    expect(diffCanonicalUml(before.uml, after.uml)).toEqual([]);
  });
});

describe("integración con el preview", () => {
  it("D-12 Agrega teléfono:String a Cliente produce exactamente una línea de diff desde el candidato real", () => {
    const document = documentFixture();
    const before = structuredClone(document);
    const resolved = resolveMentorProposal(document, { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" }, { uuidFactory: () => ATTR_A });
    if (!resolved.ok) throw new Error("se esperaba una resolución correcta");

    const preview = previewMentorProposal(document, resolved.command);

    expect(preview.ok && preview.candidate.revision).toBe(11);
    expect(preview.ok && preview.diff).toEqual([{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }]);
    expect(document).toEqual(before);
  });
});
