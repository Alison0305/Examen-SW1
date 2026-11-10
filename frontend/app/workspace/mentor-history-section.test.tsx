import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type MentorHistoryItem, type MentorHistoryPage, type MentorHistoryParams } from "../auth/api";
import { AppProviders } from "../providers";
import { formatHistoryDate, MentorHistorySection } from "./mentor-history-section";
import { MentorPanel } from "./mentor-panel";

// CU-2P-07, fase 6: "Historial del proyecto" section. The loader is a double; debounceMs=0 keeps the search
// deterministic without fake timers.

const item = (n: number, overrides: Partial<MentorHistoryItem> = {}): MentorHistoryItem => ({
  id: `d7035000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  author: { email: `autor${n}@example.test` },
  question: `Pregunta ${n}`,
  answer: `Respuesta ${n}`,
  occurredAt: `2026-11-10T${String(10 + (n % 10)).padStart(2, "0")}:00:00.000Z`,
  ...overrides,
});
const page = (items: MentorHistoryItem[], nextCursor: string | null = null): MentorHistoryPage => ({ items, nextCursor });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type Loader = (params: MentorHistoryParams) => Promise<MentorHistoryPage>;

function renderSection(onLoad: Loader, refreshKey = 0) {
  const view = render(<AppProviders><MentorHistorySection onLoad={onLoad} refreshKey={refreshKey} debounceMs={0} /></AppProviders>);
  return {
    ...view,
    rerenderWith: (nextLoad: Loader, nextKey: number) => view.rerender(<AppProviders><MentorHistorySection onLoad={nextLoad} refreshKey={nextKey} debounceMs={0} /></AppProviders>),
  };
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Mostrar historial" }));
const close = () => fireEvent.click(screen.getByRole("button", { name: "Ocultar historial" }));
const search = (value: string) => fireEvent.change(screen.getByLabelText("Buscar en el historial"), { target: { value } });
const shownQuestions = () => screen.queryAllByTestId("mentor-history-item").map((entry) => within(entry).getByText(/^Pregunta|<b>/).textContent);

beforeEach(() => vi.clearAllMocks());

describe("MentorHistorySection", () => {
  it("1. cerrada no hace ninguna petición", async () => {
    const onLoad = vi.fn<Loader>(async () => page([item(1)]));
    renderSection(onLoad);

    expect(screen.getByRole("heading", { name: "Historial del proyecto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar historial" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Buscar en el historial")).not.toBeInTheDocument();
    await act(async () => undefined);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("2 y 3. al abrirla carga la primera página sin parámetros y muestra el estado de carga", async () => {
    const pending = deferred<MentorHistoryPage>();
    const onLoad = vi.fn<Loader>(() => pending.promise);
    renderSection(onLoad);

    open();

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith({});
    expect(screen.getByRole("status")).toHaveTextContent("Cargando historial...");
    await act(async () => pending.resolve(page([item(1)])));
    expect(screen.queryByText("Cargando historial...")).not.toBeInTheDocument();
    expect(screen.getByText("Pregunta 1")).toBeInTheDocument();
  });

  it("4. historial vacío: mensaje informativo, no error", async () => {
    renderSection(vi.fn<Loader>(async () => page([])));
    open();

    expect(await screen.findByText("Todavía no hay interacciones en este proyecto.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("5, 6 y 7. cada elemento muestra autor, fecha legible (con el ISO intacto en dateTime) y pregunta", async () => {
    const entry = item(1, { author: { email: "ana@example.test" }, question: "¿Qué representa Cliente?", occurredAt: "2026-11-10T12:00:00.000Z" });
    renderSection(vi.fn<Loader>(async () => page([entry])));
    open();

    const shown = await screen.findByTestId("mentor-history-item");
    expect(within(shown).getByText(/ana@example\.test/)).toBeInTheDocument();
    expect(within(shown).getByText("¿Qué representa Cliente?")).toBeInTheDocument();
    const time = shown.querySelector("time")!;
    expect(time).toHaveAttribute("dateTime", "2026-11-10T12:00:00.000Z");
    expect(time.textContent).toBe(formatHistoryDate("2026-11-10T12:00:00.000Z"));
    expect(time.textContent).not.toBe("2026-11-10T12:00:00.000Z");
  });

  it("8. la respuesta está oculta hasta expandir el elemento", async () => {
    renderSection(vi.fn<Loader>(async () => page([item(1)])));
    open();
    await screen.findByText("Pregunta 1");

    expect(screen.queryByText("Respuesta 1")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Ver respuesta" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("Respuesta 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar respuesta" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar respuesta" }));
    expect(screen.queryByText("Respuesta 1")).not.toBeInTheDocument();
  });

  it("9. la búsqueda se envía al servidor como q (recortada), reemplazando los resultados", async () => {
    const onLoad = vi.fn<Loader>(async (params) => (params.q ? page([item(7, { question: "Pregunta 7 sobre UML" })]) : page([item(1), item(2)])));
    renderSection(onLoad);
    open();
    await screen.findByText("Pregunta 1");

    search("  UML  ");

    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ q: "UML" }));
    expect(await screen.findByText("Pregunta 7 sobre UML")).toBeInTheDocument();
    expect(screen.queryByText("Pregunta 1")).not.toBeInTheDocument();
  });

  it("10. borrar la búsqueda vuelve al historial sin filtro y nunca envía q vacío", async () => {
    const onLoad = vi.fn<Loader>(async (params) => (params.q ? page([item(7)]) : page([item(1), item(2)])));
    renderSection(onLoad);
    open();
    await screen.findByText("Pregunta 1");
    search("uml");
    await screen.findByText("Pregunta 7");

    search("   ");

    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({}));
    expect(await screen.findByText("Pregunta 1")).toBeInTheDocument();
    expect(screen.queryByText("Pregunta 7")).not.toBeInTheDocument();
    for (const [params] of onLoad.mock.calls) expect(params.q === undefined || params.q.trim() !== "").toBe(true);
  });

  it("11. al cambiar q se descarta el cursor anterior (q=Prisma sin cursor)", async () => {
    const onLoad = vi.fn<Loader>(async (params) => (params.q === "UML" && !params.cursor ? page([item(1)], "cursor-uml") : page([item(2)])));
    renderSection(onLoad);
    open();
    search("UML");
    await screen.findByRole("button", { name: "Cargar más" });

    search("Prisma");

    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ q: "Prisma" }));
    expect(onLoad.mock.calls.some(([params]) => params.q === "Prisma" && params.cursor !== undefined)).toBe(false);
  });

  it("12 y 13. «Cargar más» usa el cursor y la búsqueda actuales y añade al final sin reordenar ni duplicar", async () => {
    const onLoad = vi.fn<Loader>(async (params) => {
      if (!params.cursor) return page([item(1), item(2)], "c1");
      return page([item(2), item(3), item(4)], null); // item 2 repeated on purpose
    });
    renderSection(onLoad);
    open();
    search("pregunta");
    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ q: "pregunta" }));
    await screen.findByRole("button", { name: "Cargar más" });

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ cursor: "c1", q: "pregunta" }));
    await waitFor(() => expect(shownQuestions()).toEqual(["Pregunta 1", "Pregunta 2", "Pregunta 3", "Pregunta 4"]));
  });

  it("14. al final del historial (nextCursor null) no hay «Cargar más» ni peticiones extra", async () => {
    const onLoad = vi.fn<Loader>(async () => page([item(1)], null));
    renderSection(onLoad);
    open();
    await screen.findByText("Pregunta 1");

    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("15. «Actualizar» recarga la primera página sin cursor, conserva la búsqueda y reemplaza (no concatena)", async () => {
    let call = 0;
    const onLoad = vi.fn<Loader>(async (params) => {
      call += 1;
      if (params.cursor) return page([item(3)], null);
      return call < 4 ? page([item(1), item(2)], "c1") : page([item(9), item(1)], "c9");
    });
    renderSection(onLoad);
    open();
    search("uml");
    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ q: "uml" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cargar más" }));
    await screen.findByText("Pregunta 3");

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ q: "uml" }));
    await waitFor(() => expect(shownQuestions()).toEqual(["Pregunta 9", "Pregunta 1"]));
  });

  it.each([
    [400, "No se pudo cargar el historial."],
    [404, "Proyecto no encontrado o no disponible."],
    [500, "No se pudo cargar el historial en este momento."],
    [503, "No se pudo cargar el historial en este momento."],
  ])("16-18. un error %i muestra un mensaje seguro, sin el detalle técnico", async (status, message) => {
    renderSection(vi.fn<Loader>(async () => {
      throw new ApiError(status, '{"code":"INVALID_CURSOR","stack":"PrismaClientKnownRequestError at /ruta/secreta"}');
    }));
    open();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body.textContent).not.toMatch(/INVALID_CURSOR|Prisma|ruta\/secreta|stack/);
    expect(screen.queryByText("Todavía no hay interacciones en este proyecto.")).not.toBeInTheDocument();
  });

  it("un error de red genérico también muestra el mensaje seguro de 5xx", async () => {
    renderSection(vi.fn<Loader>(async () => {
      throw new TypeError("Failed to fetch");
    }));
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el historial en este momento.");
  });

  it("si falla «Cargar más» se conservan las páginas ya mostradas y se puede reintentar", async () => {
    const onLoad = vi.fn<Loader>(async (params) => (params.cursor ? Promise.reject(new ApiError(500, "x")) : page([item(1)], "c1")));
    renderSection(onLoad);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Cargar más" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el historial en este momento.");
    expect(screen.getByText("Pregunta 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar más" })).toBeEnabled();
  });

  it("tras un error, cerrar y volver a abrir reintenta la carga", async () => {
    const onLoad = vi.fn<Loader>().mockRejectedValueOnce(new ApiError(500, "x")).mockResolvedValue(page([item(1)]));
    renderSection(onLoad);
    open();
    await screen.findByRole("alert");
    close();
    open();
    expect(await screen.findByText("Pregunta 1")).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it("19. solo muestra el DTO público aunque el servidor enviara campos internos", async () => {
    const leaky = { ...item(1), userId: "USER-INTERNO", projectId: "PROYECTO-INTERNO", accessRole: "OWNER", projectRevision: 77, grounded: true, createdAt: "2026-01-01T00:00:00.000Z" } as MentorHistoryItem;
    renderSection(vi.fn<Loader>(async () => page([leaky])));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Ver respuesta" }));

    const text = document.body.textContent ?? "";
    for (const leaked of ["USER-INTERNO", "PROYECTO-INTERNO", "OWNER", "77", "2026-01-01"]) expect(text).not.toContain(leaked);
  });

  it("20. pregunta y respuesta se muestran como texto plano, sin interpretar HTML", async () => {
    const hostile = item(1, { question: "<b>hola</b>", answer: '<img src=x onerror="alert(1)"><script>alert(2)</script>' });
    const { container } = renderSection(vi.fn<Loader>(async () => page([hostile])));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Ver respuesta" }));

    expect(screen.getByText("<b>hola</b>")).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)"><script>alert(2)</script>')).toBeInTheDocument();
    expect(container.querySelector("b, img, script")).toBeNull();
  });

  it("race: una respuesta lenta de una búsqueda anterior no reemplaza los resultados de la búsqueda nueva", async () => {
    const slowUml = deferred<MentorHistoryPage>();
    const onLoad = vi.fn<Loader>(async (params) => {
      if (params.q === "uml") return slowUml.promise;
      if (params.q === "prisma") return page([item(5, { question: "Pregunta 5 de Prisma" })]);
      return page([item(1)]);
    });
    renderSection(onLoad);
    open();
    await screen.findByText("Pregunta 1");

    search("uml");
    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith({ q: "uml" }));
    search("prisma");
    expect(await screen.findByText("Pregunta 5 de Prisma")).toBeInTheDocument();

    await act(async () => slowUml.resolve(page([item(8, { question: "Pregunta 8 de UML" })])));

    expect(screen.queryByText("Pregunta 8 de UML")).not.toBeInTheDocument();
    expect(screen.getByText("Pregunta 5 de Prisma")).toBeInTheDocument();
  });

  it("refreshKey: si nunca se abrió no hace petición; si está abierta recarga; si está cerrada y cargada recarga al reabrir", async () => {
    let calls = 0;
    const onLoad = vi.fn<Loader>(async () => page([item(++calls)]));
    const view = renderSection(onLoad, 0);

    view.rerenderWith(onLoad, 1);
    await act(async () => undefined);
    expect(onLoad).not.toHaveBeenCalled();

    open();
    await screen.findByText("Pregunta 1");
    view.rerenderWith(onLoad, 2);
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    expect(onLoad).toHaveBeenLastCalledWith({});
    expect(await screen.findByText("Pregunta 2")).toBeInTheDocument();

    close();
    view.rerenderWith(onLoad, 3);
    await act(async () => undefined);
    expect(onLoad).toHaveBeenCalledTimes(2);
    open();
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Pregunta 3")).toBeInTheDocument();
  });

  it("reabrir sin cambios conserva los datos y no repite la petición", async () => {
    const onLoad = vi.fn<Loader>(async () => page([item(1)]));
    renderSection(onLoad);
    open();
    await screen.findByText("Pregunta 1");
    close();
    open();

    expect(screen.getByText("Pregunta 1")).toBeInTheDocument();
    await act(async () => undefined);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});

describe("MentorPanel con historial (CU-2P-07)", () => {
  const onQuery = () => vi.fn().mockResolvedValue({ answer: "Cliente tiene nombre.", grounded: true, projectRevision: 3 });

  it("muestra Consulta, Análisis UML e Historial como secciones independientes", async () => {
    const onLoad = vi.fn<Loader>(async () => page([item(1)]));
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery()} analysis={{ selection: null, onAnalyze: vi.fn() }} history={{ projectKey: "p1", onLoad }} /></AppProviders>);

    expect(screen.getByLabelText("Consulta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar modelo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historial del proyecto" })).toBeInTheDocument();
    open();
    expect(await screen.findByText("Pregunta 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeInTheDocument();
  });

  it("tras una consulta correcta del Mentor refresca el historial abierto", async () => {
    let calls = 0;
    const onLoad = vi.fn<Loader>(async () => page(++calls > 1 ? [item(2, { question: "Describe Cliente" }), item(1)] : [item(1)]));
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery()} history={{ projectKey: "p1", onLoad }} /></AppProviders>);
    open();
    await screen.findByText("Pregunta 1");

    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Describe Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    const list = await screen.findByRole("list", { name: "Interacciones del Mentor" });
    await waitFor(() => expect(within(list).getByText("Describe Cliente")).toBeInTheDocument());
  });

  it("una consulta fallida (Mentor IA no disponible) no refresca y el historial sigue visible", async () => {
    const onLoad = vi.fn<Loader>(async () => page([item(1)]));
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={vi.fn().mockRejectedValue(new ApiError(503, "x"))} history={{ projectKey: "p1", onLoad }} /></AppProviders>);
    open();
    await screen.findByText("Pregunta 1");

    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Describe Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText("No fue posible consultar al Mentor IA. Intenta nuevamente.")).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pregunta 1")).toBeInTheDocument();
  });

  it("al cambiar de proyecto no muestra datos del anterior y la respuesta tardía del anterior se ignora", async () => {
    const slowA = deferred<MentorHistoryPage>();
    const loadA = vi.fn<Loader>(() => slowA.promise);
    const loadB = vi.fn<Loader>(async () => page([item(2, { question: "Pregunta de B" })]));
    const view = render(<AppProviders><MentorPanel projectName="A" onQuery={onQuery()} history={{ projectKey: "A", onLoad: loadA }} /></AppProviders>);
    open();

    view.rerender(<AppProviders><MentorPanel projectName="B" onQuery={onQuery()} history={{ projectKey: "B", onLoad: loadB }} /></AppProviders>);
    await act(async () => slowA.resolve(page([item(1, { question: "SECRETO de A" })])));

    expect(screen.queryByText("SECRETO de A")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar historial" })).toBeInTheDocument();
    open();
    expect(await screen.findByText("Pregunta de B")).toBeInTheDocument();
    expect(screen.queryByText("SECRETO de A")).not.toBeInTheDocument();
    expect(loadB).toHaveBeenCalledWith({});
  });

  it("sin la prop history el panel es exactamente el de CU-2P-01/04", () => {
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery()} /></AppProviders>);
    expect(screen.queryByText("Historial del proyecto")).not.toBeInTheDocument();
  });
});
