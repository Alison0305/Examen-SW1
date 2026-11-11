import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type MentorProposalHistoryList, type ProjectChatMessage, type ProjectChatPage } from "../auth/api";
import { AppProviders } from "../providers";
import { ProjectChatPanel, type ProjectChatConnection, type ProjectChatListener } from "./project-chat-panel";

const message = (n: number, overrides: Partial<ProjectChatMessage> = {}): ProjectChatMessage => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  kind: "USER",
  author: { email: "ana@example.test" },
  body: `mensaje ${n}`,
  replyToId: null,
  proposalId: null,
  createdAt: `2026-11-11T12:00:${String(n).padStart(2, "0")}.000Z`,
  ...overrides,
});

function setup(overrides: Partial<ProjectChatConnection> = {}) {
  let listener: ProjectChatListener | undefined;
  const connection = {
    projectKey: "p1",
    load: vi.fn(async () => ({ items: [message(3), message(2)], nextCursor: null as string | null })),
    send: vi.fn(async (body: string) => message(10, { body })),
    action: vi.fn(async (_action: string, text: string) => message(11, { body: `Recomendación técnica: ${text}` })),
    subscribe: vi.fn((next: ProjectChatListener) => { listener = next; return () => { listener = undefined; }; }),
    loadProposalStatuses: vi.fn(async () => ({ items: [] })),
    ...overrides,
  } satisfies ProjectChatConnection;
  render(<AppProviders><ProjectChatPanel projectName="CRM" connection={connection} /></AppProviders>);
  return { connection, emit: () => listener! };
}

const log = () => screen.getByRole("log", { name: "Conversación del proyecto" });
const bodies = () => within(log()).getAllByTestId("project-chat-message").map((item) => item.querySelector("p:last-child, pre")?.textContent);
const type = (value: string) => fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value } });

describe("ProjectChatPanel (CU-2P-08)", () => {
  it("carga la última página y la muestra del más antiguo al más reciente", async () => {
    setup();
    await within(log()).findByText("mensaje 3");
    expect(bodies()).toEqual(["mensaje 2", "mensaje 3"]);
  });

  it("muestra un estado vacío y un error genérico de carga", async () => {
    setup({ load: vi.fn(async () => ({ items: [], nextCursor: null })) });
    expect(await screen.findByText(/Todavía no hay mensajes/)).toBeInTheDocument();
  });

  it("un 404 al cargar muestra un mensaje genérico", async () => {
    setup({ load: vi.fn(async () => { throw new ApiError(404, "x"); }) });
    expect(await screen.findByText("Proyecto no encontrado o no disponible.")).toBeInTheDocument();
  });

  it("enviar publica el texto recortado, limpia el campo y no duplica el eco por la sala", async () => {
    const { connection, emit } = setup();
    await within(log()).findByText("mensaje 3");
    type("  Hola equipo  ");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await within(log()).findByText("Hola equipo");
    expect(connection.send).toHaveBeenCalledExactlyOnceWith("Hola equipo");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
    act(() => emit().message(message(10, { body: "Hola equipo" })));
    expect(within(log()).getAllByText("Hola equipo")).toHaveLength(1);
  });

  it("Ctrl + Enter envía; un doble clic produce una sola petición", async () => {
    let release!: (value: ProjectChatMessage) => void;
    const { connection } = setup({ send: vi.fn(() => new Promise<ProjectChatMessage>((resolve) => { release = resolve; })) });
    await within(log()).findByText("mensaje 3");
    type("uno");
    const button = screen.getByRole("button", { name: "Enviar" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByLabelText("Mensaje"), { key: "Enter", ctrlKey: true });
    expect(connection.send).toHaveBeenCalledOnce();
    await act(async () => release(message(10, { body: "uno" })));

    type("dos");
    fireEvent.keyDown(screen.getByLabelText("Mensaje"), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(connection.send).toHaveBeenCalledTimes(2));
  });

  it("si el envío falla conserva el texto y muestra un error seguro", async () => {
    setup({ send: vi.fn(async () => { throw new ApiError(500, "detalle interno"); }) });
    await within(log()).findByText("mensaje 3");
    type("se pierde?");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("No se pudo enviar el mensaje. Intenta nuevamente.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje")).toHaveValue("se pierde?");
    expect(screen.queryByText("detalle interno")).not.toBeInTheDocument();
  });

  it("los mensajes de otros llegan por la sala; el estado del Mentor aparece y desaparece", async () => {
    const { emit } = setup();
    await within(log()).findByText("mensaje 3");
    const question = message(4, { body: "@mentor ¿qué es Pedido?", author: { email: "luis@example.test" } });

    act(() => emit().message(question));
    act(() => emit().mentor({ replyToId: question.id, state: "THINKING" }));
    expect(screen.getByText("Mentor IA está respondiendo…")).toBeInTheDocument();

    act(() => emit().message(message(5, { kind: "MENTOR", author: null, body: "Pedido pertenece a Cliente.", replyToId: question.id })));
    act(() => emit().mentor({ replyToId: question.id, state: "IDLE" }));
    expect(screen.queryByText("Mentor IA está respondiendo…")).not.toBeInTheDocument();
    const entries = within(log()).getAllByTestId("project-chat-message");
    expect(within(entries.at(-1)!).getByText("Mentor IA")).toBeInTheDocument();
    expect(within(entries.at(-2)!).getByText("luis@example.test")).toBeInTheDocument();
  });

  it("los avisos se rotulan como Aviso y el texto se muestra como texto, nunca como HTML", async () => {
    const { emit } = setup();
    await within(log()).findByText("mensaje 3");
    act(() => emit().message(message(6, { kind: "NOTICE", author: null, body: "El Mentor IA no está disponible." })));
    act(() => emit().message(message(7, { body: "<img src=x onerror=alert(1)><b>negrita</b>" })));

    expect(screen.getByText("Aviso")).toBeInTheDocument();
    expect(within(log()).getByText("<img src=x onerror=alert(1)><b>negrita</b>")).toBeInTheDocument();
    expect(log().querySelector("img, b")).toBeNull();
  });

  it("al reconectar vuelve a cargar la última página y limpia los estados del Mentor pendientes", async () => {
    const load = vi.fn(async (): Promise<ProjectChatPage> => ({ items: [message(3), message(2)], nextCursor: null }));
    const { emit } = setup({ load });
    await within(log()).findByText("mensaje 3");
    act(() => emit().mentor({ replyToId: message(3).id, state: "THINKING" }));
    load.mockResolvedValueOnce({ items: [message(8, { body: "perdido durante la desconexión" }), message(3)], nextCursor: null });

    act(() => emit().reconnected());

    expect(await within(log()).findByText("perdido durante la desconexión")).toBeInTheDocument();
    expect(screen.queryByText("Mentor IA está respondiendo…")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("carga mensajes anteriores con el cursor del servidor", async () => {
    const load = vi.fn(async (params: { cursor?: string }) => (params.cursor ? { items: [message(1)], nextCursor: null } : { items: [message(3), message(2)], nextCursor: "cursor-1" }));
    setup({ load });
    fireEvent.click(await screen.findByRole("button", { name: "Cargar mensajes anteriores" }));

    await within(log()).findByText("mensaje 1");
    expect(load).toHaveBeenLastCalledWith({ limit: 30, cursor: "cursor-1" });
    expect(bodies()).toEqual(["mensaje 1", "mensaje 2", "mensaje 3"]);
    expect(screen.queryByRole("button", { name: "Cargar mensajes anteriores" })).not.toBeInTheDocument();
  });

  it("Recomendación técnica envía la acción con el texto; sin permiso de edición no hay Proponer cambio UML", async () => {
    const { connection } = setup();
    await within(log()).findByText("mensaje 3");
    expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument();
    type("¿Conviene teléfono?");
    fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));

    await within(log()).findByText("Recomendación técnica: ¿Conviene teléfono?");
    expect(connection.action).toHaveBeenCalledExactlyOnceWith("RECOMMENDATION", "¿Conviene teléfono?");
  });

  it("las acciones del Mentor se desactivan con más de 500 caracteres; el mensaje normal admite hasta 2000", async () => {
    setup({ proposals: { apply: vi.fn(), reject: vi.fn() } });
    await within(log()).findByText("mensaje 3");
    type("a".repeat(501));
    expect(screen.getByRole("button", { name: "Recomendación técnica" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Proponer cambio UML" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("una tarjeta de propuesta muestra el diff y su estado público, y la acción refresca el estado", async () => {
    const apply = vi.fn(async () => undefined);
    const loadProposalStatuses = vi.fn(async (): Promise<MentorProposalHistoryList> => ({ items: [{ proposalId: "p-1", status: "PENDING", operation: { kind: "ADD_ATTRIBUTE" as const, target: { className: "Cliente" }, change: { attributeName: "ID", attributeType: "integer" } }, summary: [], baseRevision: 3, createdAt: "2026-11-11T12:00:00.000Z" }] }));
    const { emit } = setup({ proposals: { apply, reject: vi.fn() }, loadProposalStatuses });
    await within(log()).findByText("mensaje 3");

    act(() => emit().message(message(9, { kind: "PROPOSAL", author: null, body: "+ Cliente.ID: integer", proposalId: "p-1" })));
    const card = await within(log()).findByLabelText("Propuesta de cambio UML");
    expect(within(card).getByText("+ Cliente.ID: integer")).toBeInTheDocument();
    expect(await within(card).findByText("Estado: Pendiente")).toBeInTheDocument();

    loadProposalStatuses.mockResolvedValue({ items: [{ ...(await loadProposalStatuses()).items[0]!, status: "APPLIED" }] });
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));
    expect(await within(card).findByText("Estado: Aplicada")).toBeInTheDocument();
    expect(apply).toHaveBeenCalledExactlyOnceWith("p-1");
  });
});
