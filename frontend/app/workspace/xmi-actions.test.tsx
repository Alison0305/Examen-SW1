import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportXmi } from "@examen-sw1/xmi-core";
import type { CanonicalUmlModel } from "@examen-sw1/uml-core";
import { AppProviders } from "../providers";
import { resetWorkspaceStore, useWorkspaceStore } from "./workspace-store";
import { WorkspaceXmiActions } from "./xmi-actions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sourceModel: CanonicalUmlModel = {
  classes: [
    { id: id(1), name: "Cliente", visibility: "public", attributes: [{ id: id(11), name: "nombre", visibility: "private", type: { kind: "primitive", name: "string" } }], operations: [] },
    { id: id(2), name: "Pedido", visibility: "public", attributes: [], operations: [] },
  ],
  enumerations: [],
  packages: [],
  relationships: [{ id: id(3), type: "Association", sourceId: id(1), targetId: id(2), sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }],
};

const xmiFile = (content: string, name = "tienda.xmi") => new File([content], name, { type: "application/xml" });
const renderActions = (readOnly = false) => render(<AppProviders><WorkspaceXmiActions readOnly={readOnly} projectName="Mi tienda" /></AppProviders>);
const selectFile = (file: File) => fireEvent.change(screen.getByLabelText("Archivo XMI"), { target: { files: [file] } });

beforeEach(() => resetWorkspaceStore());
afterEach(() => vi.restoreAllMocks());

describe("Intercambio XMI en el workspace", () => {
  it("exporta el modelo como archivo .xmi con el nombre del proyecto", async () => {
    act(() => { useWorkspaceStore.getState().createClass(); });
    let exported: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => { exported = blob; return "blob:xmi"; });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("Mi_tienda.xmi"); });
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Exportar XMI" }));

    expect(click).toHaveBeenCalledOnce();
    const xml = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported!); });
    expect(xml).toContain('xmi:version="2.1"');
    expect(xml).toContain('name="Clase1"');
  });

  it("importa un XMI tras revisarlo y lo aplica como una sola operación deshacible", async () => {
    renderActions();
    selectFile(xmiFile(exportXmi(sourceModel).xml));

    expect(await screen.findByRole("heading", { name: "Importar XMI" })).toBeInTheDocument();
    expect(screen.getByLabelText("Resumen de importación")).toHaveTextContent("2 clase(s), 1 atributo(s), 0 enumeración(es) y 1 relación(es).");
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(useWorkspaceStore.getState().document.uml.classes.map((entry) => entry.name)).toEqual(["Cliente", "Pedido"]);
    expect(useWorkspaceStore.getState().document.uml.relationships).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Importar XMI" })).not.toBeInTheDocument());

    act(() => useWorkspaceStore.getState().undo());
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
  });

  it("Cancelar no modifica el documento", async () => {
    renderActions();
    selectFile(xmiFile(exportXmi(sourceModel).xml));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
  });

  it("muestra el error de un archivo que no es XML y no abre la revisión", async () => {
    renderActions();
    selectFile(xmiFile("esto no es xml", "notas.xmi"));
    expect(await screen.findByText(/no es XML bien formado/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Importar XMI" })).not.toBeInTheDocument();
  });

  it("bloquea Aplicar cuando una clase importada choca con una existente", async () => {
    act(() => {
      const store = useWorkspaceStore.getState();
      store.createClass();
      const [created] = useWorkspaceStore.getState().document.uml.classes;
      store.updateClass(created!.id, "Cliente", "public");
    });
    renderActions();
    selectFile(xmiFile(exportXmi(sourceModel).xml));

    expect(await screen.findByRole("heading", { name: "Importar XMI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(screen.getByText(/mismo nombre/)).toBeInTheDocument();
  });

  it("para VIEWER ofrece exportar pero no importar", () => {
    renderActions(true);
    expect(screen.getByRole("button", { name: "Exportar XMI" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Importar XMI" })).not.toBeInTheDocument();
  });
});
