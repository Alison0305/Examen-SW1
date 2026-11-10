import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import { ApiError, type UmlAnalysisFocus, type UmlAnalysisResponse } from "../auth/api";
import { AppProviders } from "../providers";
import { MentorPanel } from "./mentor-panel";
import { describeSelection, type UmlAnalysisSelection } from "./uml-analysis-section";
import { WorkspaceClient } from "./workspace-client";
import { resetWorkspaceStore, useWorkspaceStore } from "./workspace-store";

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const PEDIDO = "22222222-2222-4222-8222-222222222222";
const ESTADO = "33333333-3333-4333-8333-333333333333";
const REALIZA = "44444444-4444-4444-8444-444444444444";

const NO_OMISSIONS = { classes: 0, enumerations: 0, relationships: 0, attributes: 0, diagnostics: 0, limitations: 0 };
const ANALYSIS = {
  facts: { uml: {}, relational: {} },
  diagnostics: { uml: [], relational: [{ severity: "warning" as const, code: "REL_ONE_TO_ONE_OWNER_FALLBACK", message: "La relación 1:1 no define propietario; se usa SOURCE de forma determinista.", path: "relationships[0]", elementId: REALIZA }] },
  conflicts: [],
  limitations: { unsupportedFeatures: [{ code: "INTERFACES_NOT_SUPPORTED", message: "ShareGrams no modela interfaces." }], editor: [], schema: [{ code: "MINIMUM_MULTIPLICITY_NOT_ENFORCED", message: "La multiplicidad 1..* junto a Pedido exige al menos 1 Pedido por cada Cliente; el esquema relacional no lo garantiza.", elementId: REALIZA }] },
  summary: { hasUmlErrors: false, hasRelationalErrors: false, relationalDerivable: true },
};
const response = (overrides: Partial<UmlAnalysisResponse> = {}): UmlAnalysisResponse => ({
  projectRevision: 3,
  focus: { kind: "class", id: CLIENTE, name: "Cliente" },
  analysis: ANALYSIS,
  explanation: { text: "Resumen: cada Cliente realiza 0..* Pedido.\nObservación: considere un índice.", contextTruncation: { truncated: false, omitted: NO_OMISSIONS } },
  ...overrides,
});

const cliente: UmlAnalysisSelection = { kind: "class", id: CLIENTE, label: "Cliente" };
const pedido: UmlAnalysisSelection = { kind: "class", id: PEDIDO, label: "Pedido" };
const realiza: UmlAnalysisSelection = { kind: "relationship", id: REALIZA, label: "realiza" };
const estado: UmlAnalysisSelection = { kind: "enumeration", id: ESTADO, label: "Estado" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type Analyze = (focus: UmlAnalysisFocus) => Promise<UmlAnalysisResponse>;

function renderPanel(selection: UmlAnalysisSelection | null, onAnalyze = vi.fn<Analyze>(async () => response()), onQuery = vi.fn().mockResolvedValue({ answer: "Cliente tiene nombre.", grounded: true, projectRevision: 3 })) {
  const view = render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery} analysis={{ selection, onAnalyze }} /></AppProviders>);
  const rerender = (next: UmlAnalysisSelection | null) => view.rerender(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery} analysis={{ selection: next, onAnalyze }} /></AppProviders>);
  return { ...view, onAnalyze, onQuery, rerender };
}
const explainSelection = () => screen.getByRole("button", { name: "Explicar selección" });
const explainModel = () => screen.getByRole("button", { name: "Explicar modelo" });

describe("UmlAnalysisSection: selección", () => {
  it("U-01: sin selección, Explicar selección está deshabilitado y Explicar modelo disponible", () => {
    renderPanel(null);
    expect(screen.getByText("Selecciona una clase o relación para analizarla.")).toBeInTheDocument();
    expect(explainSelection()).toBeDisabled();
    expect(explainModel()).toBeEnabled();
  });

  it("U-02 y U-03: una clase o una relación habilitan Explicar selección", () => {
    const { rerender } = renderPanel(cliente);
    expect(screen.getByText("Selección: Cliente")).toBeInTheDocument();
    expect(explainSelection()).toBeEnabled();
    rerender(realiza);
    expect(screen.getByText("Selección: realiza")).toBeInTheDocument();
    expect(explainSelection()).toBeEnabled();
  });

  it("U-04: una enumeración deshabilita el botón, lo explica y nunca llama a la API", () => {
    const { onAnalyze } = renderPanel(estado);
    expect(screen.getByText("Las enumeraciones aún no se pueden analizar individualmente.")).toBeInTheDocument();
    expect(explainSelection()).toBeDisabled();
    fireEvent.click(explainSelection());
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("U-05: Explicar modelo envía { kind: model } con cualquier selección, incluida una enumeración", async () => {
    const { onAnalyze } = renderPanel(estado, vi.fn(async () => response({ focus: { kind: "model" } })));
    fireEvent.click(explainModel());
    await waitFor(() => expect(onAnalyze).toHaveBeenCalledWith({ kind: "model" }));
    expect(await screen.findByText("Análisis de: Modelo completo")).toBeInTheDocument();
  });

  it("U-06 y U-19: una clase llama a la API una sola vez con solo su kind e id", async () => {
    const { onAnalyze } = renderPanel(cliente);
    fireEvent.click(explainSelection());
    await screen.findByText("Análisis de: Cliente");
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onAnalyze.mock.calls[0]![0]).toStrictEqual({ kind: "class", id: CLIENTE });
  });

  it("U-07: una relación llama a la API una sola vez con su id", async () => {
    const { onAnalyze } = renderPanel(realiza, vi.fn(async () => response({ focus: { kind: "relationship", id: REALIZA, name: "realiza" } })));
    fireEvent.click(explainSelection());
    await screen.findByText("Análisis de: realiza");
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onAnalyze.mock.calls[0]![0]).toStrictEqual({ kind: "relationship", id: REALIZA });
  });
});

describe("UmlAnalysisSection: carga y resultado", () => {
  it("U-08: muestra Analizando..., deshabilita las dos acciones y evita el doble envío", async () => {
    const pending = deferred<UmlAnalysisResponse>();
    const { onAnalyze } = renderPanel(cliente, vi.fn(() => pending.promise));
    fireEvent.click(explainSelection());

    expect(await screen.findByText("Analizando...")).toBeInTheDocument();
    const [selectionButton, modelButton] = within(screen.getByLabelText("Análisis UML")).getAllByRole("button");
    expect(selectionButton).toBeDisabled();
    expect(modelButton).toBeDisabled();
    fireEvent.click(selectionButton!);
    fireEvent.click(modelButton!);
    expect(onAnalyze).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(response()));
    expect(await screen.findByText("Análisis de: Cliente")).toBeInTheDocument();
    expect(explainSelection()).toBeEnabled();
  });

  it("U-09: muestra la explicación como texto plano y las observaciones deterministas compactas", async () => {
    renderPanel(cliente, vi.fn(async () => response({ explanation: { text: "Resumen: <b>Cliente</b> realiza 0..* Pedido.", contextTruncation: { truncated: false, omitted: NO_OMISSIONS } } })));
    fireEvent.click(explainSelection());

    expect(await screen.findByText("Explicación")).toBeInTheDocument();
    // Markup is shown as text, never interpreted.
    expect(screen.getByText("Resumen: <b>Cliente</b> realiza 0..* Pedido.")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("Observaciones del modelo")).toBeInTheDocument();
    expect(screen.getByText(/no define propietario/)).toBeInTheDocument();
    expect(screen.getByText(/el esquema relacional no lo garantiza/)).toBeInTheDocument();
    // The raw analysis object and the global unsupported-features catalog are not dumped.
    expect(screen.queryByText(/relationalDerivable|"facts"/)).toBeNull();
    expect(screen.queryByText("ShareGrams no modela interfaces.")).toBeNull();
  });

  it("U-10 y U-20: el título usa el foco devuelto aunque la selección cambie durante la petición", async () => {
    const pending = deferred<UmlAnalysisResponse>();
    const { rerender } = renderPanel(cliente, vi.fn(() => pending.promise));
    fireEvent.click(explainSelection());
    rerender(pedido);
    expect(screen.getByText("Selección: Pedido")).toBeInTheDocument();

    await act(async () => pending.resolve(response()));

    expect(await screen.findByText("Análisis de: Cliente")).toBeInTheDocument();
    expect(screen.queryByText("Análisis de: Pedido")).toBeNull();
  });

  it("U-11: un contexto recortado muestra un aviso informativo con lo omitido", async () => {
    renderPanel(null, vi.fn(async () => response({ focus: { kind: "model" }, explanation: { text: "Resumen del modelo.", contextTruncation: { truncated: true, omitted: { ...NO_OMISSIONS, classes: 14, relationships: 18, attributes: 43 } } } })));
    fireEvent.click(explainModel());

    expect(await screen.findByText(/El análisis utilizó una versión resumida del contexto del modelo\./)).toBeInTheDocument();
    expect(screen.getByText("Omitido: 14 clases, 18 relaciones, 43 atributos.")).toBeInTheDocument();
    expect(screen.queryByRole("alert", { name: /error/i })).toBeNull();
  });
});

describe("UmlAnalysisSection: diagnósticos y errores", () => {
  it("U-12: EMPTY_MODEL", async () => {
    renderPanel(null, vi.fn(async () => response({ focus: { kind: "model" }, analysis: null, explanation: null, diagnostic: "EMPTY_MODEL" })));
    fireEvent.click(explainModel());
    expect(await screen.findByText("El modelo UML está vacío.")).toBeInTheDocument();
  });

  it("U-13: ELEMENT_NOT_FOUND", async () => {
    renderPanel(cliente, vi.fn(async () => response({ focus: { kind: "class", id: CLIENTE }, analysis: null, explanation: null, diagnostic: "ELEMENT_NOT_FOUND" })));
    fireEvent.click(explainSelection());
    expect(await screen.findByText("El elemento seleccionado ya no existe en el modelo.")).toBeInTheDocument();
  });

  it("U-14: CONTEXT_TOO_LARGE aclara que los hechos sí se calcularon y solo falta la explicación", async () => {
    renderPanel(cliente, vi.fn(async () => response({ explanation: null, diagnostic: "CONTEXT_TOO_LARGE" })));
    fireEvent.click(explainSelection());

    expect(await screen.findByText(/El contexto esencial de este análisis es demasiado grande para el Mentor IA\./)).toBeInTheDocument();
    expect(screen.getByText(/solo la explicación no pudo generarse/)).toBeInTheDocument();
    expect(screen.queryByText("Explicación")).toBeNull();
    expect(screen.getByText("Observaciones del modelo")).toBeInTheDocument();
  });

  it("los demás diagnósticos tienen su mensaje propio", async () => {
    const onAnalyze = vi.fn()
      .mockResolvedValueOnce(response({ analysis: null, explanation: null, diagnostic: "INVALID_FOCUS_ID" }))
      .mockResolvedValueOnce(response({ analysis: null, explanation: null, diagnostic: "INCONSISTENT_REFERENCE" }));
    renderPanel(cliente, onAnalyze);
    fireEvent.click(explainSelection());
    expect(await screen.findByText("No se pudo identificar correctamente el elemento seleccionado.")).toBeInTheDocument();
    fireEvent.click(explainSelection());
    expect(await screen.findByText("El modelo contiene una referencia inconsistente que impide analizar este elemento.")).toBeInTheDocument();
  });

  it("U-15: un 503 muestra el mensaje seguro sin detalles internos", async () => {
    renderPanel(cliente, vi.fn(async () => { throw new ApiError(503, "NOT_CONFIGURED: C:/modelos/qwen3.gguf"); }));
    fireEvent.click(explainSelection());

    expect(await screen.findByText("El Mentor IA no está disponible en este momento.")).toBeInTheDocument();
    expect(screen.queryByText(/NOT_CONFIGURED|gguf|LocalModelError/)).toBeNull();
  });

  it("los errores de red, 401, 404 y 422 tienen mensajes controlados", async () => {
    const onAnalyze = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(404, "Not Found"))
      .mockRejectedValueOnce(new ApiError(422, "El modelo del proyecto no es válido para analizarlo."))
      .mockRejectedValueOnce(new ApiError(401, "Unauthorized"));
    renderPanel(null, onAnalyze);
    for (const message of ["No fue posible analizar el modelo. Intenta nuevamente.", "Proyecto no encontrado o no disponible.", "El modelo del proyecto no es válido para analizarlo.", "Tu sesión expiró. Inicia sesión nuevamente."]) {
      fireEvent.click(explainModel());
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
  });
});

describe("Convivencia con CU-2P-01 y solo lectura", () => {
  it("U-16 y U-17: la consulta libre sigue funcionando, con estado independiente, y el análisis no toca la pregunta", async () => {
    const pending = deferred<UmlAnalysisResponse>();
    const { onQuery } = renderPanel(cliente, vi.fn(() => pending.promise));
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Describe Cliente" } });

    // The analysis is running: the free query is not blocked.
    fireEvent.click(explainSelection());
    expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await waitFor(() => expect(onQuery).toHaveBeenCalledWith("Describe Cliente"));
    expect(await screen.findByText("Cliente tiene nombre.")).toBeInTheDocument();

    await act(async () => pending.resolve(response()));
    expect(await screen.findByText("Análisis de: Cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Consulta")).toHaveValue("Describe Cliente");
    expect(screen.getByText("Cliente tiene nombre.")).toBeInTheDocument();
  });

  it("sin la propiedad analysis el panel es exactamente el de CU-2P-01", () => {
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={vi.fn()} /></AppProviders>);
    expect(screen.queryByText("Análisis UML")).toBeNull();
    expect(screen.queryByRole("button", { name: /Explicar/ })).toBeNull();
  });

  it("U-18: no ofrece ninguna acción para aplicar, corregir o modificar el modelo, ni siquiera ante una Observación", async () => {
    renderPanel(cliente);
    fireEvent.click(explainSelection());
    expect(await screen.findByText(/Observación: considere un índice\./)).toBeInTheDocument();

    const labels = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    expect(labels.filter((label) => /aplicar|corregir|aceptar|modificar|cambiar/i.test(label))).toEqual([]);
  });
});

describe("Integración con el workspace", () => {
  function documentWithModel(): ProjectDocument {
    const document = createProjectDocument({ id: "55555555-5555-4555-8555-555555555555", now: new Date("2026-11-09T00:00:00.000Z") });
    document.uml.classes.push(
      { id: CLIENTE, name: "Cliente", visibility: "public", attributes: [], operations: [] },
      { id: PEDIDO, name: "Pedido", visibility: "public", attributes: [], operations: [] },
    );
    document.uml.enumerations.push({ id: ESTADO, name: "Estado", visibility: "public", literals: ["ABIERTO"] });
    document.uml.relationships.push({ id: REALIZA, type: "Association", sourceId: CLIENTE, targetId: PEDIDO, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    return document;
  }

  beforeEach(() => resetWorkspaceStore(documentWithModel()));

  it("describeSelection nombra clases, enumeraciones y relaciones sin nombre a partir de sus extremos", () => {
    const document = documentWithModel();
    expect(describeSelection(document, null)).toBeNull();
    expect(describeSelection(document, { kind: "class", id: CLIENTE })).toEqual({ kind: "class", id: CLIENTE, label: "Cliente" });
    expect(describeSelection(document, { kind: "enumeration", id: ESTADO })).toEqual({ kind: "enumeration", id: ESTADO, label: "Estado" });
    expect(describeSelection(document, { kind: "relationship", id: REALIZA })).toEqual({ kind: "relationship", id: REALIZA, label: "Cliente — Pedido" });
  });

  it("toma la selección del store del editor y envía solo el foco", async () => {
    const onUmlAnalysis = vi.fn<Analyze>(async () => response());
    render(<AppProviders><WorkspaceClient projectName="CRM" onMentorQuery={vi.fn()} onUmlAnalysis={onUmlAnalysis} /></AppProviders>);

    expect(screen.getByText("Selecciona una clase o relación para analizarla.")).toBeInTheDocument();
    act(() => useWorkspaceStore.getState().selectElement(CLIENTE));
    expect(await screen.findByText("Selección: Cliente")).toBeInTheDocument();
    fireEvent.click(explainSelection());

    await waitFor(() => expect(onUmlAnalysis).toHaveBeenCalledTimes(1));
    expect(onUmlAnalysis.mock.calls[0]![0]).toStrictEqual({ kind: "class", id: CLIENTE });
    // The editor selection and document are untouched by the analysis.
    expect(useWorkspaceStore.getState().selection).toEqual({ kind: "class", id: CLIENTE });
    expect(useWorkspaceStore.getState().document.uml).toEqual(documentWithModel().uml);

    act(() => useWorkspaceStore.getState().selectElement(ESTADO));
    expect(await screen.findByText("Las enumeraciones aún no se pueden analizar individualmente.")).toBeInTheDocument();
    act(() => useWorkspaceStore.getState().selectElement(REALIZA));
    expect(await screen.findByText("Selección: Cliente — Pedido")).toBeInTheDocument();
  });
});
