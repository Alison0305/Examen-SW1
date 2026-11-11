import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument, UmlCommand } from "@examen-sw1/uml-core";
import PersistedWorkspacePage from "./page";
import { ApiError, type MentorProposalResponse, type ProjectAccessRole } from "../../../auth/api";
import { SessionProvider } from "../../../auth/session";
import { createProjectDetailFixture, resetPersistedWorkspaceTest } from "../../../workspace/persisted-workspace-test-harness";
import { STALE_PROPOSAL_MESSAGE } from "../../../workspace/mentor-proposal-section";
import { useWorkspaceStore } from "../../../workspace/workspace-store";

// CU-2P-06 in the real persisted workspace page: real WorkspaceClient, MentorPanel, proposal card, store and realtime
// ACK handling. Only the API client and the socket are replaced. The diagram may change only through the authoritative
// project.operation.accepted event, never through the HTTP apply response.

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
const PENDING: MentorProposalResponse = {
  id: PROPOSAL_ID,
  status: "PENDING",
  baseRevision: 10,
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
  preview: { valid: true, diff: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], diagnostics: [] },
  createdAt: "2026-11-10T12:00:00.000Z",
};
const APPLIED: MentorProposalResponse = { ...PENDING, status: "APPLIED", resolvedAt: "2026-11-10T12:05:00.000Z", resultingRevision: 11 };
// The ACK the backend broadcasts for an applied proposal: operationId = proposal id, the persisted command.
const ACK = {
  operationId: PROPOSAL_ID,
  projectId: "project-1",
  revision: 11,
  command: { type: "AddAttribute", classId: CLIENTE_ID, attributeId: SERVER_ATTRIBUTE_ID, name: "teléfono", attributeType: { kind: "primitive", name: "string" } } as UmlCommand,
};

const RECOMMENDATION = { status: "READ_ONLY" as const, problem: "Falta contacto", alternatives: ["Agregar teléfono a Cliente."], rationale: "Cliente existe.", limitations: "Sin formato.", confidence: 0.75, needsClarification: false, requiresUmlChange: true, projectRevision: 10 };

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
  client.createMentorProposal.mockResolvedValue(PENDING);
  client.applyMentorProposal.mockResolvedValue(APPLIED);
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

async function propose() {
  fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: INSTRUCTION } });
  fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));
  return screen.findByLabelText("Propuesta IA");
}

const attributesOfCliente = () => useWorkspaceStore.getState().document.uml.classes.find((umlClass) => umlClass.id === CLIENTE_ID)!.attributes.map((attribute) => [attribute.id, attribute.name]);

describe("workspace persistido: propuesta UML del Mentor (CU-2P-06)", () => {
  it("UI-02: crear la propuesta no modifica el UML ni envía operaciones realtime", async () => {
    const before = await openWorkspace();
    await propose();

    expect(client.createMentorProposal).toHaveBeenCalledExactlyOnceWith("project-1", INSTRUCTION);
    expect(useWorkspaceStore.getState().document).toEqual(before);
    expect(realtime.apply).not.toHaveBeenCalled();
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
  });

  it("Aplicar: la respuesta HTTP no muta el diagrama; el ACK realtime lo actualiza una sola vez", async () => {
    const before = await openWorkspace();
    const card = await propose();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(within(card).getByText("Estado: Aplicada")).toBeInTheDocument());

    expect(client.applyMentorProposal).toHaveBeenCalledExactlyOnceWith("project-1", PROPOSAL_ID);
    // Before the broadcast arrives nothing was patched locally.
    expect(useWorkspaceStore.getState().document).toEqual(before);
    expect(realtime.apply).not.toHaveBeenCalled();

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
    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
  });

  it("sin conexión realtime, Aplicar no parchea el documento y ofrece recargar la versión del servidor", async () => {
    const before = await openWorkspace({ connect: false });
    const card = await propose();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByRole("button", { name: "Recargar versión" })).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });

  it("UI-05: Rechazar no modifica el UML", async () => {
    const before = await openWorkspace();
    client.rejectMentorProposal.mockResolvedValue({ ...PENDING, status: "REJECTED", resolvedAt: "2026-11-10T12:05:00.000Z" });
    const card = await propose();
    fireEvent.click(within(card).getByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(within(card).getByText("Estado: Rechazada")).toBeInTheDocument());
    expect(client.rejectMentorProposal).toHaveBeenCalledExactlyOnceWith("project-1", PROPOSAL_ID);
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });

  it("UI-09: STALE_PROPOSAL muestra el mensaje y no altera el modelo", async () => {
    const before = await openWorkspace();
    client.applyMentorProposal.mockRejectedValue(new ApiError(409, "El modelo cambió", "STALE_PROPOSAL"));
    const card = await propose();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));

    expect(await within(card).findByText(STALE_PROPOSAL_MESSAGE)).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(before);
    expect(client.applyMentorProposal).toHaveBeenCalledOnce();
    expect(client.createMentorProposal).toHaveBeenCalledOnce();
  });

  it("UI-12: VIEWER no puede iniciar una modificación desde el Mentor", async () => {
    await openWorkspace({ accessRole: "VIEWER" });

    expect(screen.getByRole("button", { name: "Consultar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument();
  });

  it("un EDITOR degradado a VIEWER pierde la acción de proponer y la tarjeta abierta con sus botones", async () => {
    await openWorkspace();
    await propose();

    act(() => { realtime.eventListeners["project.access.changed"]?.({ projectId: "project-1", accessRole: "VIEWER" }); });

    await waitFor(() => expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument());
    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
  });

  it("CU-2P-05 → CU-2P-06: desde una recomendación con requiresUmlChange se crea la propuesta solo con { instruction } y sin tocar el UML", async () => {
    const before = await openWorkspace();
    client.recommendMentor.mockResolvedValue(RECOMMENDATION);
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: INSTRUCTION } });
    fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));
    fireEvent.click(await screen.findByRole("button", { name: "Generar propuesta UML" }));

    expect(await screen.findByLabelText("Propuesta IA")).toBeInTheDocument();
    expect(client.recommendMentor).toHaveBeenCalledExactlyOnceWith("project-1", INSTRUCTION);
    expect(client.createMentorProposal).toHaveBeenCalledExactlyOnceWith("project-1", INSTRUCTION);
    expect(client.applyMentorProposal).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });

  it("CU-2P-05 → CU-2P-06: un VIEWER ve la recomendación pero no puede generar la propuesta", async () => {
    await openWorkspace({ accessRole: "VIEWER" });
    client.recommendMentor.mockResolvedValue(RECOMMENDATION);
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: INSTRUCTION } });
    fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));

    expect(await screen.findByText("Recomendación técnica (solo lectura)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar propuesta UML" })).not.toBeInTheDocument();
    expect(client.createMentorProposal).not.toHaveBeenCalled();
  });
});
