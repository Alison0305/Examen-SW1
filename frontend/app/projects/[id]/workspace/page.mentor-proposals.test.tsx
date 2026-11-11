import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument, UmlCommand } from "@examen-sw1/uml-core";
import PersistedWorkspacePage from "./page";
import { ApiError, type MentorProposalHistoryList, type MentorProposalStatus, type ProjectAccessRole, type ProjectChatMessage } from "../../../auth/api";
import { SessionProvider } from "../../../auth/session";
import { createProjectDetailFixture, resetPersistedWorkspaceTest } from "../../../workspace/persisted-workspace-test-harness";
import { STALE_PROPOSAL_MESSAGE } from "../../../workspace/mentor-proposal-section";
import { useWorkspaceStore } from "../../../workspace/workspace-store";

// CU-2P-06 inside the CU-2P-08 project chat, in the real persisted workspace page: real WorkspaceClient, chat panel,
// proposal card, store and realtime ACK handling. Only the API client and the socket are replaced. The proposal card
// arrives as a server-published PROPOSAL message in the project room. The diagram may change only through the
// authoritative project.operation.accepted event, never through the HTTP apply response.

const realtime = vi.hoisted(() => ({
  apply: vi.fn(),
  join: vi.fn(),
  resync: vi.fn(),
  leave: vi.fn(),
  disconnect: vi.fn(),
  presence: vi.fn(),
  connectListener: undefined as undefined | (() => void),
  eventListeners: {} as Record<string, (payload: unknown) => void>,
}));
const client = {
  login: vi.fn(), register: vi.fn(), me: vi.fn(), getProject: vi.fn(), saveProject: vi.fn(),
  queryMentor: vi.fn(), analyzeUml: vi.fn(), recommendMentor: vi.fn(),
  createMentorProposal: vi.fn(), getMentorProposal: vi.fn(), applyMentorProposal: vi.fn(), rejectMentorProposal: vi.fn(),
  getMentorHistory: vi.fn(), getMentorProposalHistory: vi.fn(),
  getChatMessages: vi.fn(), postChatMessage: vi.fn(), postChatAction: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/projects/project-1/workspace",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../auth/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../auth/api")>()), createApiClient: () => client }));
vi.mock("../../../workspace/realtime-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../workspace/realtime-client")>();
  class WorkspaceRealtimeClient {
    connect() {
      return {
        on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
          if (event === "connect") realtime.connectListener = listener;
          realtime.eventListeners[event] = listener;
        }),
      };
    }
    join = realtime.join;
    apply = realtime.apply;
    resync = realtime.resync;
    leave = realtime.leave;
    disconnect = realtime.disconnect;
    presence = realtime.presence;
  }
  return { ...actual, WorkspaceRealtimeClient };
});

const CLIENTE_ID = "22222222-2222-4222-8222-222222222222";
const SERVER_ATTRIBUTE_ID = "33333333-3333-4333-8333-333333333333";
const PROPOSAL_ID = "44444444-4444-4444-8444-444444444444";
const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";
// The ACK the backend broadcasts for an applied proposal: operationId = proposal id, the persisted command.
const ACK = {
  operationId: PROPOSAL_ID,
  projectId: "project-1",
  revision: 11,
  command: { type: "AddAttribute", classId: CLIENTE_ID, attributeId: SERVER_ATTRIBUTE_ID, name: "teléfono", attributeType: { kind: "primitive", name: "string" } } as UmlCommand,
};
const REQUEST: ProjectChatMessage = { id: "55555555-5555-4555-8555-555555555555", kind: "USER", author: { email: "user@example.test" }, body: `Propuesta de cambio UML: ${INSTRUCTION}`, replyToId: null, proposalId: null, createdAt: "2026-11-10T12:00:00.000Z" };
const CARD: ProjectChatMessage = { id: "66666666-6666-4666-8666-666666666666", kind: "PROPOSAL", author: null, body: "+ Cliente.teléfono: string", replyToId: REQUEST.id, proposalId: PROPOSAL_ID, createdAt: "2026-11-10T12:00:05.000Z" };

const statusList = (status: MentorProposalStatus): MentorProposalHistoryList => ({
  items: [{ proposalId: PROPOSAL_ID, status, operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } }, summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], baseRevision: 10, createdAt: "2026-11-10T12:00:05.000Z" }],
});

afterEach(() => { sessionStorage.clear(); realtime.connectListener = undefined; realtime.eventListeners = {}; vi.clearAllMocks(); resetPersistedWorkspaceTest(); });

function documentWithCliente(): ProjectDocument {
  const detail = createProjectDetailFixture();
  detail.document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [], operations: [] });
  detail.document.layout.elements.push({ elementId: CLIENTE_ID, x: 100, y: 100 });
  return detail.document;
}

async function openWorkspace({ accessRole = "EDITOR", connect = true }: { accessRole?: ProjectAccessRole; connect?: boolean } = {}) {
  const detail = createProjectDetailFixture({ id: "project-1", accessRole, revision: 10, document: documentWithCliente() });
  sessionStorage.setItem("examen-sw1.access-token", "test-token");
  client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
  client.getProject.mockResolvedValue(detail);
  client.getChatMessages.mockResolvedValue({ items: [], nextCursor: null });
  client.getMentorProposalHistory.mockResolvedValue({ items: [] });
  client.getMentorHistory.mockResolvedValue({ items: [], nextCursor: null });
  client.postChatAction.mockResolvedValue(REQUEST);
  client.applyMentorProposal.mockImplementation(async () => {
    client.getMentorProposalHistory.mockResolvedValue(statusList("APPLIED"));
    return {};
  });
  realtime.join.mockResolvedValue({ projectId: detail.id, revision: 10, document: detail.document, accessRole, presence: [] });

  render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
  await screen.findByText("Proyecto de prueba");
  if (connect) {
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    await screen.findByText(/Realtime connected/);
  }
  return structuredClone(useWorkspaceStore.getState().document);
}

const chat = () => screen.getByRole("log", { name: "Conversación del proyecto" });

// The editor asks for a proposal in the chat; the server answers in the room with the PROPOSAL card.
async function propose() {
  fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: INSTRUCTION } });
  fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));
  await within(chat()).findByText(REQUEST.body);
  client.getMentorProposalHistory.mockResolvedValue(statusList("PENDING"));
  act(() => { realtime.eventListeners["project.chat.message"]?.({ projectId: "project-1", message: CARD }); });
  return within(chat()).findByLabelText("Propuesta de cambio UML");
}

const attributesOfCliente = () => useWorkspaceStore.getState().document.uml.classes.find((umlClass) => umlClass.id === CLIENTE_ID)!.attributes.map((attribute) => [attribute.id, attribute.name]);

describe("workspace persistido: propuesta UML del Mentor desde el chat (CU-2P-06 en CU-2P-08)", () => {
  it("UI-02: pedir la propuesta no modifica el UML ni envía operaciones realtime", async () => {
    const before = await openWorkspace();
    const card = await propose();

    expect(client.postChatAction).toHaveBeenCalledExactlyOnceWith("project-1", "PROPOSAL", INSTRUCTION);
    expect(within(card).getByText("+ Cliente.teléfono: string")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(before);
    expect(realtime.apply).not.toHaveBeenCalled();
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
    expect(client.createMentorProposal).not.toHaveBeenCalled();
  });

  it("Aplicar: la respuesta HTTP no muta el diagrama; el ACK realtime lo actualiza una sola vez", async () => {
    const before = await openWorkspace();
    const card = await propose();
    await waitFor(() => expect(within(card).getByText("Estado: Pendiente")).toBeInTheDocument());
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(within(card).getByText("Estado: Aplicada")).toBeInTheDocument());

    expect(client.applyMentorProposal).toHaveBeenCalledExactlyOnceWith("project-1", PROPOSAL_ID);
    // Before the broadcast arrives nothing was patched locally.
    expect(useWorkspaceStore.getState().document).toEqual(before);
    expect(realtime.apply).not.toHaveBeenCalled();
    expect(within(card).queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();

    act(() => { realtime.eventListeners["project.operation.accepted"]?.(ACK); });
    expect(attributesOfCliente()).toEqual([[SERVER_ATTRIBUTE_ID, "teléfono"]]);
    expect(screen.getByText(/revisión confirmada 11/)).toBeInTheDocument();

    // A duplicated broadcast (same operationId) is ignored: still exactly one attribute.
    act(() => { realtime.eventListeners["project.operation.accepted"]?.(ACK); });
    expect(attributesOfCliente()).toEqual([[SERVER_ATTRIBUTE_ID, "teléfono"]]);
    expect(screen.queryByRole("button", { name: "Recargar versión" })).not.toBeInTheDocument();
  });

  it("otro editor conectado recibe solo la operación aceptada y su diagrama se actualiza sin conocer la propuesta", async () => {
    await openWorkspace();

    act(() => { realtime.eventListeners["project.operation.accepted"]?.(ACK); });

    expect(attributesOfCliente()).toEqual([[SERVER_ATTRIBUTE_ID, "teléfono"]]);
    expect(client.getMentorProposal).not.toHaveBeenCalled();
  });

  it("sin conexión realtime, Aplicar no parchea el documento y ofrece recargar la versión del servidor", async () => {
    const before = await openWorkspace({ connect: false });
    const card = await propose();
    fireEvent.click(await within(card).findByRole("button", { name: "Aplicar" }));

    expect(await screen.findByRole("button", { name: "Recargar versión" })).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });

  it("UI-05: Rechazar no modifica el UML", async () => {
    const before = await openWorkspace();
    client.rejectMentorProposal.mockImplementation(async () => {
      client.getMentorProposalHistory.mockResolvedValue(statusList("REJECTED"));
      return {};
    });
    const card = await propose();
    fireEvent.click(await within(card).findByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(within(card).getByText("Estado: Rechazada")).toBeInTheDocument());
    expect(client.rejectMentorProposal).toHaveBeenCalledExactlyOnceWith("project-1", PROPOSAL_ID);
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });

  it("UI-09: STALE_PROPOSAL muestra el mensaje en la tarjeta y no altera el modelo", async () => {
    const before = await openWorkspace();
    client.applyMentorProposal.mockRejectedValue(new ApiError(409, "El modelo cambió", "STALE_PROPOSAL"));
    const card = await propose();
    fireEvent.click(await within(card).findByRole("button", { name: "Aplicar" }));

    expect(await within(card).findByText(STALE_PROPOSAL_MESSAGE)).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(before);
    expect(client.applyMentorProposal).toHaveBeenCalledOnce();
  });

  it("UI-12: un VIEWER chatea y pide recomendaciones, pero no puede proponer ni aplicar cambios", async () => {
    await openWorkspace({ accessRole: "VIEWER" });

    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recomendación técnica" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument();

    client.getMentorProposalHistory.mockResolvedValue(statusList("PENDING"));
    act(() => { realtime.eventListeners["project.chat.message"]?.({ projectId: "project-1", message: CARD }); });
    const card = await within(chat()).findByLabelText("Propuesta de cambio UML");
    expect(within(card).queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
  });

  it("un EDITOR degradado a VIEWER pierde las acciones de proponer y de aplicar; la tarjeta queda en la conversación", async () => {
    await openWorkspace();
    const card = await propose();

    act(() => { realtime.eventListeners["project.access.changed"]?.({ projectId: "project-1", accessRole: "VIEWER" }); });

    await waitFor(() => expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument());
    expect(within(card).queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
    expect(within(card).getByText("+ Cliente.teléfono: string")).toBeInTheDocument();
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
  });

  it("los eventos de chat de otro proyecto se ignoran; los del proyecto abierto aparecen sin recargar", async () => {
    await openWorkspace();
    await screen.findByText(/Todavía no hay mensajes/);

    act(() => { realtime.eventListeners["project.chat.message"]?.({ projectId: "otro-proyecto", message: { ...REQUEST, body: "mensaje ajeno" } }); });
    act(() => { realtime.eventListeners["project.chat.message"]?.({ projectId: "project-1", message: { ...REQUEST, id: "77777777-7777-4777-8777-777777777777", body: "hola desde otro navegador" } }); });

    expect(await within(chat()).findByText("hola desde otro navegador")).toBeInTheDocument();
    expect(within(chat()).queryByText("mensaje ajeno")).not.toBeInTheDocument();
    expect(client.getChatMessages).toHaveBeenCalledTimes(1);
  });

  it("CU-2P-05 en el chat: la recomendación técnica es una acción del servidor y no crea propuestas ni toca el UML", async () => {
    const before = await openWorkspace({ accessRole: "VIEWER" });
    client.postChatAction.mockResolvedValue({ ...REQUEST, body: `Recomendación técnica: ${INSTRUCTION}` });
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: INSTRUCTION } });
    fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));

    expect(await within(chat()).findByText(`Recomendación técnica: ${INSTRUCTION}`)).toBeInTheDocument();
    act(() => { realtime.eventListeners["project.chat.message"]?.({ projectId: "project-1", message: { ...CARD, kind: "MENTOR", proposalId: null, body: "Problema:\nCliente no tiene contacto." } }); });
    expect(await within(chat()).findByText(/Cliente no tiene contacto/)).toBeInTheDocument();

    expect(client.postChatAction).toHaveBeenCalledExactlyOnceWith("project-1", "RECOMMENDATION", INSTRUCTION);
    expect(client.recommendMentor).not.toHaveBeenCalled();
    expect(client.createMentorProposal).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });
});
