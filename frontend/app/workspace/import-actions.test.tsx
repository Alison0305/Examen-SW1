import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportXmi } from "@examen-sw1/xmi-core";
import type { CanonicalUmlModel, UmlImportProposal } from "@examen-sw1/uml-core";
import { AppProviders } from "../providers";
import { resetWorkspaceStore, useWorkspaceStore } from "./workspace-store";
import { WorkspaceImportActions } from "./import-actions";

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
const renderActions = (readOnly = false, onRecognizeImage?: Parameters<typeof WorkspaceImportActions>[0]["onRecognizeImage"]) => render(<AppProviders><WorkspaceImportActions readOnly={readOnly} projectName="Mi tienda" onRecognizeImage={onRecognizeImage} /></AppProviders>);
const imageProposal: UmlImportProposal = {
  source: "image",
  classes: [
    { key: "C1", name: "Empressa", attributes: [{ key: "C1.A1", name: "ruc", type: "String", visibility: "private" }, { key: "C1.A2", name: "sueido", type: "dooble", visibility: "private" }] },
    { key: "C2", name: "Empleado", attributes: [] },
  ],
  enumerations: [],
  relationships: [{ key: "R1", type: "Composition", source: "C1", target: "C2", targetMultiplicity: { lower: 1, upper: "unbounded" } }],
  diagnostics: [{ severity: "warning", code: "IMAGE_ILLEGIBLE_MULTIPLICITY", message: "No se pudo leer la multiplicidad \"0.0.\"; revisa ese extremo.", key: "R1" }],
};
const recognition = { proposal: imageProposal, image: { width: 1000, height: 420 }, ocrLines: 7, elapsedMs: 6400 };
const pngFile = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "pizarra.png", { type: "image/png" });
const selectImage = (file: File) => fireEvent.change(screen.getByLabelText("Imagen del diagrama"), { target: { files: [file] } });
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

  it("revisión: corrige nombres y tipos antes de aplicar", async () => {
    renderActions(false, async () => recognition);
    selectImage(pngFile());
    expect(await screen.findByRole("heading", { name: "Importar desde imagen" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre de la clase 1"), { target: { value: "Empresa" } });
    fireEvent.change(screen.getByLabelText("Nombre del atributo 2 de la clase 1"), { target: { value: "sueldo" } });
    fireEvent.change(screen.getByLabelText("Tipo del atributo 2 de la clase 1"), { target: { value: "double" } });
    expect(screen.getByText(/Composición: Empresa → Empleado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    const [empresa, empleado] = useWorkspaceStore.getState().document.uml.classes;
    expect([empresa?.name, empleado?.name]).toEqual(["Empresa", "Empleado"]);
    expect(empresa?.attributes.map((entry) => [entry.name, entry.type])).toEqual([["ruc", { kind: "primitive", name: "string" }], ["sueldo", { kind: "primitive", name: "number" }]]);
    expect(useWorkspaceStore.getState().document.uml.relationships).toEqual([expect.objectContaining({ type: "Composition", sourceId: empresa?.id, targetId: empleado?.id })]);
  });

  it("revisión: excluir una clase excluye sus relaciones y excluir un atributo lo omite", async () => {
    renderActions(false, async () => recognition);
    selectImage(pngFile());
    await screen.findByRole("heading", { name: "Importar desde imagen" });
    fireEvent.click(screen.getByLabelText("Incluir atributo 2 de la clase 1"));
    expect(screen.getByLabelText("Resumen de importación")).toHaveTextContent("2 clase(s), 1 atributo(s), 0 enumeración(es) y 1 relación(es).");
    fireEvent.click(screen.getByLabelText("Incluir clase 2"));
    expect(screen.getByLabelText("Resumen de importación")).toHaveTextContent("1 clase(s), 1 atributo(s), 0 enumeración(es) y 0 relación(es).");
    expect(screen.getByLabelText("Incluir relación 1")).toBeDisabled();
    expect(screen.getByText(/excluida con su clase/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(useWorkspaceStore.getState().document.uml.classes.map((entry) => [entry.name, entry.attributes.length])).toEqual([["Empressa", 1]]);
    expect(useWorkspaceStore.getState().document.uml.relationships).toEqual([]);
  });

  it("revisión: renombrar resuelve un conflicto y recalcula los diagnósticos", async () => {
    act(() => {
      const store = useWorkspaceStore.getState();
      store.createClass();
      store.updateClass(useWorkspaceStore.getState().document.uml.classes[0]!.id, "Empleado", "public");
    });
    renderActions(false, async () => recognition);
    selectImage(pngFile());
    await screen.findByRole("heading", { name: "Importar desde imagen" });
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(screen.getByText(/mismo nombre/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nombre de la clase 2"), { target: { value: "Trabajador" } });
    expect(screen.queryByText(/mismo nombre/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    expect(screen.getByText(/No se pudo leer la multiplicidad/)).toBeInTheDocument();
  });

  it("Desde imagen: muestra el progreso, abre la revisión y se deshace en un paso", async () => {
    let finish!: (value: typeof recognition) => void;
    const recognize = vi.fn(() => new Promise<typeof recognition>((resolve) => { finish = resolve; }));
    renderActions(false, recognize);
    const file = pngFile();
    selectImage(file);

    expect(await screen.findByRole("status")).toHaveTextContent("Reconociendo el diagrama");
    expect(screen.getByRole("button", { name: "Desde imagen" })).toBeDisabled();
    expect(recognize).toHaveBeenCalledWith(file);
    await act(async () => finish(recognition));

    expect(await screen.findByText(/Reconocida en 6,4 s a partir de 7 línea\(s\) de texto/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(2);
    act(() => useWorkspaceStore.getState().undo());
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
  });

  it("Desde imagen: muestra el error del reconocimiento y valida el archivo antes de enviarlo", async () => {
    const recognize = vi.fn().mockRejectedValueOnce(new Error("No se configuró un modelo local de visión."));
    renderActions(false, recognize);
    selectImage(pngFile());
    expect(await screen.findByText("No se configuró un modelo local de visión.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Importar desde imagen" })).not.toBeInTheDocument();

    selectImage(new File(["%PDF"], "diagrama.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("La imagen debe ser PNG o JPEG.")).toBeInTheDocument();
    selectImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "enorme.png", { type: "image/png" }));
    expect(await screen.findByText("La imagen supera el tamaño máximo de 5 MB.")).toBeInTheDocument();
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it("Desde imagen solo aparece con reconocimiento disponible y nunca para VIEWER", () => {
    const { unmount } = renderActions(false);
    expect(screen.queryByRole("button", { name: "Desde imagen" })).not.toBeInTheDocument();
    unmount();
    renderActions(true, async () => recognition);
    expect(screen.queryByRole("button", { name: "Desde imagen" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Imagen del diagrama")).not.toBeInTheDocument();
  });
});
