import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type MentorHistoryItem, type MentorHistoryPage, type MentorHistoryParams, type MentorProposalHistoryItem, type MentorProposalHistoryList } from "../auth/api";
import { AppProviders } from "../providers";
import { formatHistoryDate, MentorHistorySection } from "./mentor-history-section";
import { MentorPanel } from "./mentor-panel";

// CU-2P-07, task 8.1 (frontend): the "Propuestas UML" sublist inside the shared history section. Both loaders are
// doubles; debounceMs=0 keeps the interaction search deterministic.

type Loader = (params: MentorHistoryParams) => Promise<MentorHistoryPage>;
type ProposalLoader = () => Promise<MentorProposalHistoryList>;

const interaction = (n: number): MentorHistoryItem => ({
  id: `d7035000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  author: { email: `autor${n}@example.test` },
  question: `Pregunta ${n}`,
  answer: `Respuesta ${n}`,
  occurredAt: `2026-11-10T1${n % 10}:00:00.000Z`,
});
const page = (items: MentorHistoryItem[], nextCursor: string | null = null): MentorHistoryPage => ({ items, nextCursor });

const PENDING: MentorProposalHistoryItem = {
  proposalId: "d7035000-0000-4000-8000-0000000000d3",
  status: "PENDING",
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
  summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }],
  baseRevision: 10,
  createdAt: "2026-11-10T12:20:00.000Z",
};
const APPLIED: MentorProposalHistoryItem = {
  proposalId: "d7035000-0000-4000-8000-0000000000d1",
  status: "APPLIED",
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Pedido" }, change: { attributeName: "total", attributeType: "number" } },
  summary: [{ kind: "added", element: "attribute", label: "Pedido.total: number" }],
  baseRevision: 10,
  createdAt: "2026-11-10T12:00:00.000Z",
  resolvedAt: "2026-11-10T12:05:00.000Z",
  resultingRevision: 11,
};
const REJECTED: MentorProposalHistoryItem = {
  proposalId: "d7035000-0000-4000-8000-0000000000d2",
  status: "REJECTED",
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Producto" }, change: { attributeName: "stock", attributeType: "integer" } },
  summary: [{ kind: "added", element: "attribute", label: "Producto.stock: integer" }],
  baseRevision: 11,
  createdAt: "2026-11-10T12:10:00.000Z",
  resolvedAt: "2026-11-10T12:15:00.000Z",
};
const list = (...items: MentorProposalHistoryItem[]): MentorProposalHistoryList => ({ items });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function renderSection(onLoad: Loader, onLoadProposals: ProposalLoader, refreshKey = 0) {
  const view = render(<AppProviders><MentorHistorySection onLoad={onLoad} onLoadProposals={onLoadProposals} refreshKey={refreshKey} debounceMs={0} /></AppProviders>);
  return { ...view, rerenderWith: (nextKey: number) => view.rerender(<AppProviders><MentorHistorySection onLoad={onLoad} onLoadProposals={onLoadProposals} refreshKey={nextKey} debounceMs={0} /></AppProviders>) };
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Mostrar historial" }));
const close = () => fireEvent.click(screen.getByRole("button", { name: "Ocultar historial" }));
const proposalsRegion = () => screen.getByRole("region", { name: "Propuestas UML" });
const proposalEntries = () => within(proposalsRegion()).queryAllByTestId("mentor-proposal-item");
const entryFor = (className: string) => proposalEntries().find((entry) => entry.textContent?.includes(`${className}.`))!;
const settle = () => act(async () => undefined);

beforeEach(() => vi.clearAllMocks());

describe("MentorHistorySection: Propuestas UML (CU-2P-07, tarea 8.1)", () => {
  it("no pide nada hasta abrir; al abrir carga interacciones y propuestas una vez cada una", async () => {
    const onLoad = vi.fn<Loader>(async () => page([interaction(1)]));
    const onLoadProposals = vi.fn<ProposalLoader>(async () => list(PENDING));
    renderSection(onLoad, onLoadProposals);
    await settle();
    expect(onLoadProposals).not.toHaveBeenCalled();

    open();

    expect(await within(proposalsRegion()).findByText("+ Cliente.teléfono: string")).toBeInTheDocument();
    expect(onLoadProposals).toHaveBeenCalledOnce();
    expect(onLoadProposals).toHaveBeenCalledWith();
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("muestra la carga de las propuestas mientras llega la respuesta", async () => {
    const pending = deferred<MentorProposalHistoryList>();
    renderSection(vi.fn<Loader>(async () => page([])), () => pending.promise);
    open();

    expect(within(proposalsRegion()).getByText("Cargando propuestas UML...")).toBeInTheDocument();
    await act(async () => pending.resolve(list()));
    expect(within(proposalsRegion()).queryByText("Cargando propuestas UML...")).not.toBeInTheDocument();
  });

  it("UI-PROP-01: un proyecto sin propuestas muestra el estado vacío, sin error", async () => {
    renderSection(vi.fn<Loader>(async () => page([interaction(1)])), vi.fn<ProposalLoader>(async () => list()));
    open();

    expect(await within(proposalsRegion()).findByText("No hay propuestas UML registradas.")).toBeInTheDocument();
    expect(within(proposalsRegion()).queryByRole("alert")).not.toBeInTheDocument();
    expect(proposalEntries()).toHaveLength(0);
  });

  it("UI-PROP-02: PENDING muestra operación, estado, cambio, revisión base y fecha de creación; nunca resolución ni revisión resultante", async () => {
    // A stray resolvedAt/resultingRevision on a PENDING item is still not shown: the UI follows the status.
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list({ ...PENDING, resolvedAt: "2026-11-10T13:00:00.000Z", resultingRevision: 99 } as MentorProposalHistoryItem)));
    open();
    await within(proposalsRegion()).findByText("+ Cliente.teléfono: string");
    const entry = entryFor("Cliente");

    expect(within(entry).getByText("Agregar atributo")).toBeInTheDocument();
    expect(within(entry).getByText("Estado: Pendiente")).toBeInTheDocument();
    expect(within(entry).getByText("Cambio:")).toBeInTheDocument();
    expect(within(entry).getByText("Revisión base: 10")).toBeInTheDocument();
    expect(within(entry).getByText(/^Creada:/)).toBeInTheDocument();
    expect(entry.querySelector("time")?.getAttribute("dateTime")).toBe(PENDING.createdAt);
    expect(within(entry).getByText(formatHistoryDate(PENDING.createdAt))).toBeInTheDocument();
    expect(within(entry).queryByText(/Resuelta/)).not.toBeInTheDocument();
    expect(within(entry).queryByText(/Revisión resultante/)).not.toBeInTheDocument();
    expect(entry.textContent).not.toContain("99");
  });

  it("UI-PROP-03: APPLIED muestra además la revisión resultante y la fecha de resolución", async () => {
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list(APPLIED)));
    open();
    await within(proposalsRegion()).findByText("+ Pedido.total: number");
    const entry = entryFor("Pedido");

    expect(within(entry).getByText("Estado: Aplicada")).toBeInTheDocument();
    expect(within(entry).getByText("Revisión base: 10")).toBeInTheDocument();
    expect(within(entry).getByText("Revisión resultante: 11")).toBeInTheDocument();
    expect(within(entry).getByText(/^Resuelta:/)).toBeInTheDocument();
    expect([...entry.querySelectorAll("time")].map((time) => time.getAttribute("dateTime"))).toEqual([APPLIED.createdAt, APPLIED.resolvedAt]);
  });

  it("UI-PROP-04: REJECTED muestra la fecha de resolución y nunca una revisión resultante", async () => {
    // Even if a resultingRevision slipped into a REJECTED item, it is not shown.
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list({ ...REJECTED, resultingRevision: 12 } as MentorProposalHistoryItem)));
    open();
    await within(proposalsRegion()).findByText("+ Producto.stock: integer");
    const entry = entryFor("Producto");

    expect(within(entry).getByText("Estado: Rechazada")).toBeInTheDocument();
    expect(within(entry).getByText(/^Resuelta:/)).toBeInTheDocument();
    expect(within(entry).queryByText(/Revisión resultante/)).not.toBeInTheDocument();
    expect(entry.textContent).not.toContain("12");
  });

  it("UI-PROP-05: el resumen se muestra como líneas de diff legibles (+, −, ~), sin JSON", async () => {
    const multi: MentorProposalHistoryItem = {
      ...PENDING,
      summary: [
        { kind: "added", element: "attribute", label: "Cliente.teléfono: string" },
        { kind: "removed", element: "attribute", label: "Cliente.fax: string" },
        { kind: "changed", element: "class", label: "Cliente" },
      ],
    };
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list(multi)));
    open();
    const diff = await within(proposalsRegion()).findByRole("list", { name: "Cambio propuesto" });

    expect(within(diff).getAllByRole("listitem").map((line) => line.textContent)).toEqual(["+ Cliente.teléfono: string", "− Cliente.fax: string", "~ Cliente"]);
    expect(diff.textContent).not.toMatch(/[{}"]|kind|element|label/);
  });

  it("varias propuestas se muestran en el orden del servidor, sin reordenar", async () => {
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list(PENDING, REJECTED, APPLIED)));
    open();
    await within(proposalsRegion()).findByText("+ Pedido.total: number");

    expect(proposalEntries().map((entry) => within(entry).getByRole("list", { name: "Cambio propuesto" }).textContent)).toEqual(["+ Cliente.teléfono: string", "+ Producto.stock: integer", "+ Pedido.total: number"]);
  });

  it("UI-PROP-06 y UI-PROP-14: propuestas e interacciones son dos sublistas separadas; ninguna propuesta entra en la lista de interacciones", async () => {
    renderSection(vi.fn<Loader>(async () => page([interaction(2), interaction(1)])), vi.fn<ProposalLoader>(async () => list(PENDING, APPLIED)));
    open();
    const interactions = await screen.findByRole("list", { name: "Interacciones del Mentor" });
    await within(proposalsRegion()).findByText("+ Pedido.total: number");

    expect(screen.getByRole("heading", { name: "Interacciones" })).toBeInTheDocument();
    expect(within(proposalsRegion()).getByRole("heading", { name: "Propuestas UML" })).toBeInTheDocument();
    expect(within(interactions).getAllByTestId("mentor-history-item")).toHaveLength(2);
    expect(within(interactions).queryAllByTestId("mentor-proposal-item")).toHaveLength(0);
    expect(interactions.textContent).not.toMatch(/Cliente\.teléfono|Pedido\.total|Estado:/);
    expect(proposalEntries()).toHaveLength(2);
    expect(proposalsRegion().textContent).not.toMatch(/Pregunta [12]/);
    // Two blocks, interactions first: never one merged timeline.
    expect(interactions.compareDocumentPosition(proposalsRegion()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("UI-PROP-07: «Cargar más» pide solo la siguiente página de interacciones con su cursor; las propuestas no cambian ni se recargan", async () => {
    const onLoad = vi.fn<Loader>(async (params) => (params.cursor === "cursor-1" ? page([interaction(1)]) : page([interaction(3), interaction(2)], "cursor-1")));
    const onLoadProposals = vi.fn<ProposalLoader>(async () => list(PENDING));
    renderSection(onLoad, onLoadProposals);
    open();
    await within(proposalsRegion()).findByText("+ Cliente.teléfono: string");
    await screen.findByText("Pregunta 3");

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    await screen.findByText("Pregunta 1");
    expect(onLoad).toHaveBeenLastCalledWith({ cursor: "cursor-1" });
    expect(onLoadProposals).toHaveBeenCalledOnce();
    expect(proposalEntries()).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Interacciones del Mentor" })).getAllByTestId("mentor-history-item")).toHaveLength(3);
  });

  it("UI-PROP-08: «Actualizar» vuelve a cargar las propuestas (y las interacciones) y muestra los cambios", async () => {
    let calls = 0;
    const onLoadProposals = vi.fn<ProposalLoader>(async () => (++calls === 1 ? list(PENDING) : list({ ...PENDING, status: "APPLIED", resolvedAt: "2026-11-10T12:30:00.000Z", resultingRevision: 11 })));
    const onLoad = vi.fn<Loader>(async () => page([interaction(1)]));
    renderSection(onLoad, onLoadProposals);
    open();
    expect(await within(proposalsRegion()).findByText("Estado: Pendiente")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(await within(proposalsRegion()).findByText("Estado: Aplicada")).toBeInTheDocument();
    expect(within(proposalsRegion()).getByText("Revisión resultante: 11")).toBeInTheDocument();
    expect(onLoadProposals).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
  });

  it("reabrir sin cambios conserva las propuestas sin repetir la petición; tras un error, reabrir reintenta", async () => {
    const onLoadProposals = vi.fn<ProposalLoader>().mockRejectedValueOnce(new ApiError(503, "x")).mockResolvedValue(list(PENDING));
    renderSection(vi.fn<Loader>(async () => page([])), onLoadProposals);
    open();
    expect(await within(proposalsRegion()).findByText("No se pudieron cargar las propuestas UML en este momento.")).toBeInTheDocument();

    close();
    open();
    expect(await within(proposalsRegion()).findByText("+ Cliente.teléfono: string")).toBeInTheDocument();
    close();
    open();
    await settle();
    expect(onLoadProposals).toHaveBeenCalledTimes(2);
  });

  it("una consulta o recomendación (refreshKey) recarga las interacciones pero no las propuestas", async () => {
    const onLoad = vi.fn<Loader>(async () => page([interaction(1)]));
    const onLoadProposals = vi.fn<ProposalLoader>(async () => list(PENDING));
    const view = renderSection(onLoad, onLoadProposals, 0);
    open();
    await within(proposalsRegion()).findByText("+ Cliente.teléfono: string");

    view.rerenderWith(1);

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    await settle();
    expect(onLoadProposals).toHaveBeenCalledOnce();
  });

  it("UI-PROP-10 y UI-PROP-11: un fallo de propuestas se muestra solo en su sublista y las interacciones siguen visibles", async () => {
    renderSection(vi.fn<Loader>(async () => page([interaction(1)])), vi.fn<ProposalLoader>().mockRejectedValue(new ApiError(500, "detalle interno de Prisma")));
    open();

    const alert = await within(proposalsRegion()).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar las propuestas UML en este momento.");
    expect(document.body.textContent).not.toContain("Prisma");
    expect(await screen.findByText("Pregunta 1")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(within(proposalsRegion()).queryByText("No hay propuestas UML registradas.")).not.toBeInTheDocument();
  });

  it("y al revés: un fallo de interacciones no oculta las propuestas", async () => {
    renderSection(vi.fn<Loader>().mockRejectedValue(new ApiError(503, "x")), vi.fn<ProposalLoader>(async () => list(APPLIED)));
    open();

    expect(await screen.findByText("No se pudo cargar el historial en este momento.")).toBeInTheDocument();
    expect(await within(proposalsRegion()).findByText("+ Pedido.total: number")).toBeInTheDocument();
  });

  it("un 404 muestra el mensaje genérico, sin distinguir proyecto inexistente de sin acceso", async () => {
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>().mockRejectedValue(new ApiError(404, "Not Found")));
    open();

    expect(await within(proposalsRegion()).findByRole("alert")).toHaveTextContent("Proyecto no encontrado o no disponible.");
  });

  it("UI-PROP-13: no muestra ids, comando, instrucción, autor, diagnósticos, recibos, prompts ni JSON aunque llegaran en la respuesta", async () => {
    const polluted = {
      ...APPLIED,
      command: { type: "AddAttribute", classId: "c1a55000-0000-4000-8000-0000000000c1", attributeId: "a77e0000-0000-4000-8000-0000000000a1" },
      instruction: "INSTRUCCION-SECRETA",
      projectId: "PROYECTO-SECRETO",
      authorUserId: "AUTOR-SECRETO",
      authorEmail: "autor-secreto@example.test",
      resolvedByUserId: "RESOLUTOR-SECRETO",
      diagnostics: [{ code: "DIAG", severity: "warning", message: "DIAGNOSTICO-SECRETO" }],
      receipt: { fingerprint: "RECIBO-SECRETO" },
      prompt: "PROMPT-SECRETO",
    } as unknown as MentorProposalHistoryItem;
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list(polluted)));
    open();
    await within(proposalsRegion()).findByText("+ Pedido.total: number");

    const text = proposalsRegion().textContent ?? "";
    for (const secret of ["c1a55000", "a77e0000", "AddAttribute", "INSTRUCCION-SECRETA", "PROYECTO-SECRETO", "AUTOR-SECRETO", "autor-secreto", "RESOLUTOR-SECRETO", "DIAGNOSTICO-SECRETO", "RECIBO-SECRETO", "PROMPT-SECRETO", APPLIED.proposalId]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/[{}"]|ADD_ATTRIBUTE|command|classId|attributeId/);
    expect(proposalsRegion().innerHTML).not.toContain(APPLIED.proposalId);
  });

  it("es solo lectura: la sublista no ofrece aplicar, rechazar ni editar", async () => {
    renderSection(vi.fn<Loader>(async () => page([])), vi.fn<ProposalLoader>(async () => list(PENDING)));
    open();
    await within(proposalsRegion()).findByText("+ Cliente.teléfono: string");

    expect(within(proposalsRegion()).queryAllByRole("button")).toHaveLength(0);
  });

  it("sin onLoadProposals la sección es exactamente la de interacciones (sin sublista ni encabezados nuevos)", async () => {
    render(<AppProviders><MentorHistorySection onLoad={vi.fn<Loader>(async () => page([interaction(1)]))} debounceMs={0} /></AppProviders>);
    open();
    await screen.findByText("Pregunta 1");

    expect(screen.queryByRole("region", { name: "Propuestas UML" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Interacciones" })).not.toBeInTheDocument();
  });
});

describe("MentorPanel con Propuestas UML en el historial (CU-2P-07, tarea 8.1)", () => {
  const onQuery = () => vi.fn().mockResolvedValue({ answer: "Cliente tiene nombre.", grounded: true, projectRevision: 3 });

  it("UI-PROP-09: al cambiar de proyecto reinicia la sublista, carga las propuestas del nuevo e ignora la respuesta tardía del anterior", async () => {
    const slowA = deferred<MentorProposalHistoryList>();
    const proposalsA = vi.fn<ProposalLoader>(() => slowA.promise);
    const proposalsB = vi.fn<ProposalLoader>(async () => list({ ...REJECTED, summary: [{ kind: "added", element: "attribute", label: "ProyectoB.campo: string" }] }));
    const loadA = vi.fn<Loader>(async () => page([]));
    const loadB = vi.fn<Loader>(async () => page([]));
    const view = render(<AppProviders><MentorPanel projectName="A" onQuery={onQuery()} history={{ projectKey: "A", onLoad: loadA, onLoadProposals: proposalsA }} /></AppProviders>);
    open();
    expect(proposalsA).toHaveBeenCalledOnce();

    view.rerender(<AppProviders><MentorPanel projectName="B" onQuery={onQuery()} history={{ projectKey: "B", onLoad: loadB, onLoadProposals: proposalsB }} /></AppProviders>);
    await act(async () => slowA.resolve(list({ ...PENDING, summary: [{ kind: "added", element: "attribute", label: "SECRETO-A.campo: string" }] })));

    expect(screen.queryByText(/SECRETO-A/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar historial" })).toBeInTheDocument();
    open();
    expect(await within(proposalsRegion()).findByText("+ ProyectoB.campo: string")).toBeInTheDocument();
    expect(proposalsB).toHaveBeenCalledOnce();
    expect(screen.queryByText(/SECRETO-A/)).not.toBeInTheDocument();
  });

  it("UI-PROP-12: un VIEWER (panel sin acciones de propuesta) ve la sublista de propuestas, sin acciones", async () => {
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery()} history={{ projectKey: "p1", onLoad: vi.fn<Loader>(async () => page([])), onLoadProposals: vi.fn<ProposalLoader>(async () => list(PENDING, APPLIED, REJECTED)) }} /></AppProviders>);
    open();

    await within(proposalsRegion()).findByText("+ Pedido.total: number");
    expect(proposalEntries()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aplicar|Rechazar/ })).not.toBeInTheDocument();
  });

  it("una consulta correcta del panel refresca solo las interacciones (interactionVersion no recarga propuestas)", async () => {
    const onLoad = vi.fn<Loader>(async () => page([interaction(1)]));
    const onLoadProposals = vi.fn<ProposalLoader>(async () => list(PENDING));
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery()} history={{ projectKey: "p1", onLoad, onLoadProposals }} /></AppProviders>);
    open();
    await within(proposalsRegion()).findByText("+ Cliente.teléfono: string");

    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Describe Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    await settle();
    expect(onLoadProposals).toHaveBeenCalledOnce();
  });
});
