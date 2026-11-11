import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { classReferenceType, createProjectDocument, enumerationReferenceType, primitiveType, type ProjectDocument, type UmlAttribute } from "@examen-sw1/uml-core";
import { AppProviders } from "../providers";
import WorkspacePage from "./page";
import { toReactFlowNodes } from "./react-flow-adapters";
import { resetWorkspaceStore, useWorkspaceStore } from "./workspace-store";
import { formatAttributeLabel, formatAttributeSignature, formatAttributeType, formatType, typeFromValue } from "./workspace-utils";

// fix-cu-02-notacion-uml-clases: UML 2.5.1 attribute notation (`visibility name: Type [multiplicity]`), reference types
// by name, enumerations as attribute types in the inspector, and the «enumeration» stereotype.

const ID = {
  document: "11111111-1111-4111-8111-111111111111",
  pedido: "33333333-3333-4333-8333-333333333333",
  estado: "22222222-2222-4222-8222-222222222222",
  cliente: "55555555-5555-4555-8555-555555555555",
  attribute: "44444444-4444-4444-8444-444444444444",
  missing: "99999999-9999-4999-8999-999999999999",
} as const;

const attribute = (overrides: Partial<UmlAttribute> = {}): UmlAttribute => ({ id: ID.attribute, name: "telefonos", visibility: "public", type: primitiveType("string"), ...overrides });
const model = { classes: [{ id: ID.cliente, name: "Cliente", visibility: "public" as const, attributes: [], operations: [] }], enumerations: [{ id: ID.estado, name: "EstadoPedido", visibility: "public" as const, literals: ["NUEVO"] }] };

// Pedido has one attribute typed by `type`; the EstadoPedido enumeration and the Cliente class exist.
function documentWith(type: UmlAttribute["type"], multiplicity?: UmlAttribute["multiplicity"]): ProjectDocument {
  const document = createProjectDocument({ id: ID.document, now: new Date("2026-11-11T00:00:00.000Z") });
  document.uml.classes.push(
    { id: ID.pedido, name: "Pedido", visibility: "public", attributes: [{ id: ID.attribute, name: "estado", visibility: "private", type, ...(multiplicity ? { multiplicity } : {}) }], operations: [] },
    { id: ID.cliente, name: "Cliente", visibility: "public", attributes: [], operations: [] },
  );
  document.uml.enumerations.push({ id: ID.estado, name: "EstadoPedido", visibility: "public", literals: ["NUEVO", "PAGADO"] });
  document.layout.elements.push({ elementId: ID.pedido, x: 300, y: 100 }, { elementId: ID.cliente, x: 100, y: 300 }, { elementId: ID.estado, x: 100, y: 100 });
  return document;
}

function renderWorkspace() {
  return render(<AppProviders><WorkspacePage /></AppProviders>);
}

function changeSelect(label: string, value: string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}

const pedidoAttribute = () => useWorkspaceStore.getState().document.uml.classes.find((umlClass) => umlClass.id === ID.pedido)!.attributes[0]!;

describe("notación UML de atributos (utilidades y adaptador)", () => {
  it.each([
    [{ lower: 0, upper: "unbounded" as const }, "+ telefonos: string [0..*]"],
    [{ lower: 1, upper: "unbounded" as const }, "+ telefonos: string [1..*]"],
    [{ lower: 0, upper: 1 }, "+ telefonos: string [0..1]"],
    [{ lower: 2, upper: 5 }, "+ telefonos: string [2..5]"],
    [{ lower: 3, upper: 3 }, "+ telefonos: string [3]"],
  ])("muestra la multiplicidad %j entre corchetes", (multiplicity, expected) => {
    expect(formatAttributeSignature(attribute({ multiplicity }), model)).toBe(expected);
  });

  it("omite la multiplicidad por defecto (ausente o exactamente 1)", () => {
    expect(formatAttributeSignature(attribute(), model)).toBe("+ telefonos: string");
    expect(formatAttributeSignature(attribute({ multiplicity: { lower: 1, upper: 1 } }), model)).toBe("+ telefonos: string");
  });

  it("usa el símbolo UML de cada visibilidad y la etiqueta sin símbolo para el inspector", () => {
    expect(["public", "private", "protected", "package"].map((visibility) => formatAttributeSignature(attribute({ visibility: visibility as UmlAttribute["visibility"] }), model))).toEqual(["+ telefonos: string", "- telefonos: string", "# telefonos: string", "~ telefonos: string"]);
    expect(formatAttributeLabel(attribute({ multiplicity: { lower: 0, upper: "unbounded" } }), model)).toBe("telefonos: string [0..*]");
  });

  it("muestra los tipos de referencia por nombre y `?` si no se resuelven, nunca el identificador", () => {
    expect(formatAttributeType(enumerationReferenceType(ID.estado), model)).toBe("EstadoPedido");
    expect(formatAttributeType(classReferenceType(ID.cliente), model)).toBe("Cliente");
    expect(formatAttributeType(enumerationReferenceType(ID.missing), model)).toBe("?");
    expect(formatAttributeType(classReferenceType(ID.estado), model)).toBe("?");
    expect(formatAttributeSignature(attribute({ type: enumerationReferenceType(ID.missing) }), model)).not.toContain(ID.missing);
  });

  it("el valor del selector identifica el tipo y se convierte de vuelta sin pérdida", () => {
    for (const type of [primitiveType("integer"), enumerationReferenceType(ID.estado), classReferenceType(ID.cliente)]) expect(typeFromValue(formatType(type))).toEqual(type);
    expect(typeFromValue("desconocido")).toEqual(primitiveType("string"));
  });

  it("el nodo de clase recibe las filas ya en notación UML, con el tipo de referencia por nombre", () => {
    const nodes = toReactFlowNodes(documentWith(enumerationReferenceType(ID.estado), { lower: 0, upper: 1 }));

    expect(nodes.find((node) => node.id === ID.pedido)?.data.attributes).toEqual(["- estado: EstadoPedido [0..1]"]);
    expect(JSON.stringify(nodes.map((node) => node.data))).not.toContain(`estado: ${ID.estado}`);
  });
});

describe("notación UML de atributos en el workspace", () => {
  beforeEach(() => resetWorkspaceStore());

  it("el nodo y el inspector muestran el atributo tipado por una enumeración por su nombre, sin identificadores", () => {
    resetWorkspaceStore(documentWith(enumerationReferenceType(ID.estado), { lower: 0, upper: "unbounded" }));
    useWorkspaceStore.getState().selectElement(ID.pedido);
    renderWorkspace();

    expect(screen.getByTestId("uml-node-Pedido")).toHaveTextContent("- estado: EstadoPedido [0..*]");
    expect(screen.getByTestId("attribute-list")).toHaveTextContent("estado: EstadoPedido [0..*]");
    expect(screen.getByTestId("uml-node-Pedido").textContent).not.toContain(ID.estado);
    expect(screen.getByTestId("attribute-list").textContent).not.toMatch(/enumeration:|class:/);
  });

  it("una referencia no resoluble se muestra como `?`", () => {
    resetWorkspaceStore(documentWith(enumerationReferenceType(ID.missing)));
    renderWorkspace();

    expect(screen.getByTestId("uml-node-Pedido")).toHaveTextContent("- estado: ?");
    expect(screen.getByTestId("uml-node-Pedido").textContent).not.toContain(ID.missing);
  });

  it("el selector de tipo ofrece los primitivos y las enumeraciones del modelo, pero no las clases", () => {
    resetWorkspaceStore(documentWith(primitiveType("string")));
    useWorkspaceStore.getState().selectElement(ID.pedido);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Tipo de atributo" }));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["string", "integer", "boolean", "number", "date", "datetime", "EstadoPedido"]);
  });

  it("crea un atributo tipado por una enumeración mediante el Command Bus, con Undo", () => {
    resetWorkspaceStore(documentWith(primitiveType("string")));
    useWorkspaceStore.getState().selectElement(ID.pedido);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "situacion" } });
    changeSelect("Tipo de atributo", "EstadoPedido");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const added = useWorkspaceStore.getState().document.uml.classes.find((umlClass) => umlClass.id === ID.pedido)!.attributes[1]!;
    expect(added).toMatchObject({ name: "situacion", type: { kind: "reference", referenceType: "enumeration", elementId: ID.estado } });
    expect(screen.getByTestId("uml-node-Pedido")).toHaveTextContent("- situacion: EstadoPedido");

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.uml.classes.find((umlClass) => umlClass.id === ID.pedido)!.attributes).toHaveLength(1);
  });

  it("cambia el tipo de un atributo a una enumeración desde Editar", () => {
    resetWorkspaceStore(documentWith(primitiveType("string")));
    useWorkspaceStore.getState().selectElement(ID.pedido);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    changeSelect("Tipo de atributo", "EstadoPedido");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(pedidoAttribute().type).toEqual(enumerationReferenceType(ID.estado));
  });

  it.each([
    ["una enumeración", enumerationReferenceType(ID.estado), "EstadoPedido"],
    ["una clase (importada)", classReferenceType(ID.cliente), "Cliente"],
  ])("editar un atributo tipado por %s sin tocar el tipo lo conserva (no pasa a string)", (_case, type, label) => {
    resetWorkspaceStore(documentWith(type));
    useWorkspaceStore.getState().selectElement(ID.pedido);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("combobox", { name: "Tipo de atributo" })).toHaveTextContent(label);
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "renombrado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(pedidoAttribute()).toMatchObject({ name: "renombrado", type });
  });

  it("la enumeración se dibuja con el estereotipo «enumeration»", () => {
    resetWorkspaceStore(documentWith(primitiveType("string")));
    renderWorkspace();

    expect(screen.getByTestId("uml-node-EstadoPedido")).toHaveTextContent("«enumeration»");
    expect(screen.getByTestId("uml-node-EstadoPedido").textContent).not.toContain("<<");
  });
});
