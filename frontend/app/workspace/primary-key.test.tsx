import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectDocument, primitiveType, type ProjectDocument, type UmlCommand, type UmlFragment } from "@examen-sw1/uml-core";
import { AppProviders } from "../providers";
import WorkspacePage from "./page";
import { toReactFlowNodes } from "./react-flow-adapters";
import { resetWorkspaceStore, setWorkspaceCollaborativeCommandListener, useWorkspaceStore } from "./workspace-store";

// Primary keys: shown in the diagram with the UML `{id}` property and chosen from the class inspector.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const fragment = (): UmlFragment => ({
  classes: [
    {
      id: id(1),
      name: "Cliente",
      visibility: "public",
      attributes: [
        { id: id(10), name: "id", visibility: "private", type: primitiveType("integer") },
        { id: id(11), name: "codigo", visibility: "private", type: primitiveType("string") },
      ],
      operations: [],
    },
    { id: id(2), name: "Pedido", visibility: "public", attributes: [{ id: id(20), name: "fecha", visibility: "private", type: primitiveType("date") }], operations: [] },
  ],
  enumerations: [],
  relationships: [],
  layout: [{ elementId: id(1), x: 80, y: 80, width: 180, height: 120 }, { elementId: id(2), x: 320, y: 80, width: 180, height: 120 }],
});

function loaded(): ProjectDocument {
  expect(useWorkspaceStore.getState().importFragment(fragment()).success).toBe(true);
  return useWorkspaceStore.getState().document;
}

afterEach(() => {
  setWorkspaceCollaborativeCommandListener(undefined);
  resetWorkspaceStore();
});

describe("llaves primarias en el diagrama", () => {
  it("marca la llave con {id} y avisa en la clase que no tiene ninguna", () => {
    const nodes = toReactFlowNodes(loaded());
    const cliente = nodes.find((node) => node.id === id(1))!.data;
    const pedido = nodes.find((node) => node.id === id(2))!.data;

    expect(cliente.attributes).toEqual(["- id: integer {id}", "- codigo: string"]);
    expect(cliente.primaryKeys).toEqual([true, false]);
    expect(cliente.primaryKeyIssue).toBeUndefined();
    expect(pedido.primaryKeyIssue).toBe("missing");
  });

  it("no exige llave a una clase vacía de documento nuevo cuando no se mapea a tabla", () => {
    const document = createProjectDocument();
    document.uml.classes.push({ id: id(3), name: "Vista", visibility: "public", attributes: [], operations: [], generationMetadata: { entity: false } });
    expect(toReactFlowNodes(document)[0]!.data.primaryKeyIssue).toBeUndefined();
  });
});

describe("elegir la llave primaria", () => {
  it("la cambia en un solo paso: la nueva queda marcada, id deja de serlo y Deshacer lo revierte", () => {
    loaded();
    expect(useWorkspaceStore.getState().setPrimaryKey(id(1), id(11)).success).toBe(true);
    const attributes = useWorkspaceStore.getState().document.uml.classes[0]!.attributes;
    expect(attributes.map((entry) => entry.generationMetadata)).toEqual([{ identifier: false }, { identifier: true }]);
    expect(toReactFlowNodes(useWorkspaceStore.getState().document)[0]!.data.attributes).toEqual(["- id: integer", "- codigo: string {id}"]);

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().document.uml.classes[0]!.attributes.map((entry) => entry.generationMetadata)).toEqual([undefined, undefined]);
  });

  it("en colaboración envía un SetAttributeIdentifiers y su inverso restaura las marcas previas", () => {
    loaded();
    const operations: Array<{ command: UmlCommand; preimage: ProjectDocument }> = [];
    setWorkspaceCollaborativeCommandListener((command, preimage) => operations.push({ command, preimage }));

    useWorkspaceStore.getState().setPrimaryKey(id(1), id(11));
    expect(operations.map((entry) => entry.command)).toEqual([{ type: "SetAttributeIdentifiers", classId: id(1), identifiers: [{ attributeId: id(10), identifier: false }, { attributeId: id(11), identifier: true }] }]);

    useWorkspaceStore.getState().applyAuthoritativeCommand(operations[0]!.command, true, operations[0]!.preimage);
    useWorkspaceStore.getState().undo();
    // The inverse travels as JSON: entries without `identifier` drop the flag instead of relying on `undefined`.
    const inverse = operations.at(-1)!.command;
    expect(JSON.parse(JSON.stringify(inverse))).toEqual({ type: "SetAttributeIdentifiers", classId: id(1), identifiers: [{ attributeId: id(10) }, { attributeId: id(11) }] });
  });

  it("el inspector muestra PK, avisa si falta y permite elegirla con «Hacer PK»", async () => {
    loaded();
    render(<AppProviders><WorkspacePage /></AppProviders>);

    act(() => useWorkspaceStore.getState().selectElement(id(2)));
    expect(await screen.findByText(/La clase no tiene llave primaria/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar fecha como llave primaria" }));
    expect(screen.queryByText(/La clase no tiene llave primaria/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("fecha es la llave primaria")).toBeInTheDocument();
  });
});
