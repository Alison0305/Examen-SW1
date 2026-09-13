import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import PersistedWorkspacePage from "./page";
import { ApiError } from "../../../auth/api";
import { SessionProvider } from "../../../auth/session";
import { createProjectDetailFixture, resetPersistedWorkspaceTest } from "../../../workspace/persisted-workspace-test-harness";
import { useWorkspaceStore } from "../../../workspace/workspace-store";

const routerPush = vi.fn();
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
  login: vi.fn(), register: vi.fn(), me: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(), renameProject: vi.fn(), deleteProject: vi.fn(), getProject: vi.fn(), saveProject: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
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

afterEach(() => { sessionStorage.clear(); realtime.connectListener = undefined; realtime.eventListeners = {}; vi.clearAllMocks(); vi.unstubAllGlobals(); resetPersistedWorkspaceTest(); });

describe("ruta de workspace persistido", () => {
  it("carga e hidrata un proyecto persistido", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", name: "Sistema de ventas" });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);

    expect(await screen.findByText("Sistema de ventas")).toBeInTheDocument();
    await waitFor(() => expect(client.getProject).toHaveBeenCalledWith("project-1"));
    expect(useWorkspaceStore.getState().document).toEqual(detail.document);
  });

  it("marca dirty y guarda usando la revisión externa y el documento actual", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", name: "Sistema de ventas", revision: 8 });
    detail.document.revision = 1;
    let resolveSave!: (value: typeof detail) => void;
    client.saveProject.mockReturnValue(new Promise<typeof detail>((resolve) => { resolveSave = resolve; }));
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    expect(await screen.findByText("Sistema de ventas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    act(() => { useWorkspaceStore.getState().createClass(); });
    expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
    const currentDocument = useWorkspaceStore.getState().document;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(client.saveProject).toHaveBeenCalledWith("project-1", currentDocument, 8));
    expect(screen.getByText("Guardando...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(client.saveProject).toHaveBeenCalledOnce();
    await act(async () => { resolveSave({ ...detail, revision: 9, document: currentDocument }); });
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
  });

  it("usa la revisión devuelta por el servidor en el segundo guardado", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", name: "Sistema de ventas", revision: 8 });
    detail.document.revision = 1;
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    client.saveProject.mockImplementationOnce(async (_id, document) => ({ ...detail, revision: 9, document }));
    client.saveProject.mockImplementationOnce(async (_id, document) => ({ ...detail, revision: 10, document }));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    expect(await screen.findByText("Sistema de ventas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();

    act(() => { useWorkspaceStore.getState().createClass(); });
    expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
    const firstDocument = useWorkspaceStore.getState().document;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(client.saveProject).toHaveBeenNthCalledWith(1, "project-1", firstDocument, 8));
    expect(await screen.findByText("Guardado")).toBeInTheDocument();

    act(() => { useWorkspaceStore.getState().createClass(); });
    expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
    const secondDocument = useWorkspaceStore.getState().document;
    expect(secondDocument.uml.classes).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(client.saveProject).toHaveBeenNthCalledWith(2, "project-1", secondDocument, 9));
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("conserva los cambios locales y ofrece recargar versión ante un conflicto 409", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", name: "Sistema de ventas", revision: 8 });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    client.saveProject.mockRejectedValue(new ApiError(409, "Conflicto"));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    expect(await screen.findByText("Sistema de ventas")).toBeInTheDocument();
    act(() => { useWorkspaceStore.getState().createClass(); });
    const localDocument = useWorkspaceStore.getState().document;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El proyecto tiene una versión más reciente en el servidor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recargar versión" })).toBeInTheDocument();
    expect(client.getProject).toHaveBeenCalledOnce();
    expect(client.saveProject).toHaveBeenCalledWith("project-1", localDocument, 8);
    expect(useWorkspaceStore.getState().document).toEqual(localDocument);
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("mantiene el conflicto y los cambios locales cuando se cancela la recarga", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", name: "Sistema de ventas", revision: 8 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    client.saveProject.mockRejectedValue(new ApiError(409, "Conflicto"));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Sistema de ventas");
    act(() => { useWorkspaceStore.getState().createClass(); });
    const localDocument = useWorkspaceStore.getState().document;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("El proyecto tiene una versión más reciente en el servidor.");
    fireEvent.click(screen.getByRole("button", { name: "Recargar versión" }));

    expect(confirm).toHaveBeenCalledWith("Los cambios locales se perderán.");
    expect(client.getProject).toHaveBeenCalledOnce();
    expect(useWorkspaceStore.getState().document).toEqual(localDocument);
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    expect(screen.getByText("El proyecto tiene una versión más reciente en el servidor.")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("recarga la versión del servidor y usa su revisión en el siguiente guardado", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", name: "Sistema de ventas", revision: 8 });
    const serverDetail = createProjectDetailFixture({ id: "project-1", name: "Proyecto desde servidor", revision: 12 });
    serverDetail.document.uml.classes.push({ id: "22222222-2222-4222-8222-222222222222", name: "ClaseServidor", visibility: "public", attributes: [], operations: [] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValueOnce(detail).mockResolvedValueOnce(serverDetail);
    client.saveProject.mockRejectedValueOnce(new ApiError(409, "Conflicto"));
    client.saveProject.mockImplementationOnce(async (_id, document) => ({ ...serverDetail, revision: 13, document }));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Sistema de ventas");
    act(() => { useWorkspaceStore.getState().createClass(); });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("El proyecto tiene una versión más reciente en el servidor.");
    fireEvent.click(screen.getByRole("button", { name: "Recargar versión" }));

    expect(confirm).toHaveBeenCalledWith("Los cambios locales se perderán.");
    expect(await screen.findByText("Proyecto desde servidor")).toBeInTheDocument();
    expect(client.getProject).toHaveBeenNthCalledWith(2, "project-1");
    expect(useWorkspaceStore.getState().document).toEqual(serverDetail.document);
    expect(useWorkspaceStore.getState().document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["ClaseServidor"]);
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(screen.queryByText("El proyecto tiene una versión más reciente en el servidor.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();

    act(() => { useWorkspaceStore.getState().createClass(); });
    const reloadedDocument = useWorkspaceStore.getState().document;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(client.saveProject).toHaveBeenNthCalledWith(2, "project-1", reloadedDocument, 12));
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("muestra una salida segura cuando el proyecto no existe", async () => {
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockRejectedValue(new ApiError(404, "No encontrado"));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    expect(await screen.findByText("Proyecto no encontrado o no disponible.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Toolbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a proyectos" }));
    expect(routerPush).toHaveBeenCalledWith("/projects");
  });

  it("mantiene el workspace del VIEWER en solo lectura sin mutar el documento", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", accessRole: "VIEWER" });
    detail.document.uml.classes.push({ id: "22222222-2222-4222-8222-222222222222", name: "Clase visible", visibility: "public", attributes: [], operations: [] });
    detail.document.layout.elements.push({ elementId: "22222222-2222-4222-8222-222222222222", x: 100, y: 100 });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    expect(await screen.findByText("Acceso de solo lectura.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clase" })).toBeDisabled();
    act(() => { useWorkspaceStore.getState().createClass(); useWorkspaceStore.getState().undo(); });
    expect(useWorkspaceStore.getState().document).toEqual(detail.document);
    expect(screen.getByRole("button", { name: "Ajustar vista" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Validar" })).toBeEnabled();
    expect(screen.getByTestId("uml-node-Clase visible").closest(".react-flow__node")).not.toHaveClass("draggable");
    fireEvent.click(screen.getByTestId("uml-node-Clase visible"));
    expect(await screen.findByText("Clase Clase visible")).toBeInTheDocument();

    act(() => { useWorkspaceStore.getState().moveElement("22222222-2222-4222-8222-222222222222", 420, 260); });
    expect(useWorkspaceStore.getState().document).toEqual(detail.document);
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(client.saveProject).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "EDITOR"] as const)("permite mover y guardar un nodo para %s", async (accessRole) => {
    const detail = createProjectDetailFixture({ id: "project-1", accessRole });
    detail.document.uml.classes.push({ id: "22222222-2222-4222-8222-222222222222", name: "Clase editable", visibility: "public", attributes: [], operations: [] });
    detail.document.layout.elements.push({ elementId: "22222222-2222-4222-8222-222222222222", x: 100, y: 100 });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    client.saveProject.mockImplementation(async (_id, document) => ({ ...detail, revision: 9, document }));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    expect(screen.getByTestId("uml-node-Clase editable").closest(".react-flow__node")).toHaveClass("draggable");

    act(() => { useWorkspaceStore.getState().moveElement("22222222-2222-4222-8222-222222222222", 420, 260); });
    expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(client.saveProject).toHaveBeenCalledWith("project-1", useWorkspaceStore.getState().document, 8));
  });

  it("reconcilia una mutación prohibida tras el descenso de EDITOR a VIEWER", async () => {
    const editor = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR" });
    const viewer = createProjectDetailFixture({ id: "project-1", accessRole: "VIEWER", revision: 9 });
    viewer.document.uml.classes.push({ id: "22222222-2222-4222-8222-222222222222", name: "Clase del servidor", visibility: "public", attributes: [], operations: [] });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValueOnce(editor).mockResolvedValueOnce(viewer);
    realtime.join.mockImplementation(async (projectId: string) => ({ projectId, revision: editor.revision, document: editor.document, accessRole: "EDITOR", presence: [] }));
    realtime.apply.mockResolvedValue({ operationId: "operation-1", projectId: "project-1", code: "FORBIDDEN", diagnostics: [] });

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    realtime.leave.mockClear();
    realtime.disconnect.mockClear();
    act(() => { useWorkspaceStore.getState().createClass(); });

    await waitFor(() => expect(realtime.apply).toHaveBeenCalledOnce());
    expect(await screen.findByText("Acceso de solo lectura.")).toBeInTheDocument();
    expect(client.getProject).toHaveBeenNthCalledWith(2, "project-1");
    expect(useWorkspaceStore.getState().document).toEqual(viewer.document);
    expect(screen.getByRole("button", { name: "Clase" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.queryByText("El servidor rechazó la operación UML.")).not.toBeInTheDocument();
    expect(realtime.leave).not.toHaveBeenCalled();
    expect(realtime.disconnect).not.toHaveBeenCalled();
  });

  it("sale de forma segura si la reconciliación prohibida confirma que el proyecto ya no existe", async () => {
    const editor = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR" });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValueOnce(editor).mockRejectedValueOnce(new ApiError(404, "No encontrado"));
    realtime.join.mockImplementation(async (projectId: string) => ({ projectId, revision: editor.revision, document: editor.document, accessRole: "EDITOR", presence: [] }));
    realtime.apply.mockResolvedValue({ operationId: "operation-1", projectId: "project-1", code: "FORBIDDEN", diagnostics: [] });

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    realtime.leave.mockClear();
    realtime.disconnect.mockClear();
    act(() => { useWorkspaceStore.getState().createClass(); });

    expect(await screen.findByText("Proyecto no encontrado o no disponible.")).toBeInTheDocument();
    expect(client.getProject).toHaveBeenNthCalledWith(2, "project-1");
    expect(realtime.leave).toHaveBeenCalledWith("project-1");
    expect(realtime.disconnect).toHaveBeenCalled();
  });

  it("convierte el workspace de EDITOR a VIEWER mediante la invalidación de acceso sin salir de la sala", async () => {
    const editor = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR" });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(editor);
    realtime.join.mockResolvedValue({ projectId: editor.id, revision: editor.revision, document: editor.document, accessRole: "EDITOR", presence: [] });

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    realtime.leave.mockClear();
    realtime.disconnect.mockClear();
    const document = useWorkspaceStore.getState().document;

    act(() => { realtime.eventListeners["project.access.changed"]?.({ projectId: "project-1", accessRole: "VIEWER" }); });

    expect(await screen.findByText("Acceso de solo lectura.")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(document);
    expect(screen.getByRole("button", { name: "Clase" })).toBeDisabled();
    act(() => { useWorkspaceStore.getState().createClass(); });
    expect(useWorkspaceStore.getState().document).toEqual(document);
    expect(realtime.leave).not.toHaveBeenCalled();
    expect(realtime.disconnect).not.toHaveBeenCalled();
  });

  it("trata NONE como fatal y limpia documento, historial, presencia y operaciones pendientes", async () => {
    const editor = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR" });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(editor);
    realtime.join.mockResolvedValue({ projectId: editor.id, revision: editor.revision, document: editor.document, accessRole: "EDITOR", presence: [{ userId: "other", displayName: "Otra", avatar: "OT", online: true }] });
    realtime.apply.mockReturnValue(new Promise(() => {}));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    act(() => { useWorkspaceStore.getState().createClass(); });
    await waitFor(() => expect(realtime.apply).toHaveBeenCalledOnce());

    act(() => { realtime.eventListeners["project.access.changed"]?.({ projectId: "project-1", accessRole: "NONE" }); });

    expect(await screen.findByText("El acceso al proyecto fue revocado.")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
    expect(useWorkspaceStore.getState()).toMatchObject({ canUndo: false, canRedo: false, selection: null });
    expect(realtime.leave).toHaveBeenCalledWith("project-1");
    expect(realtime.disconnect).toHaveBeenCalled();
    expect(screen.queryByTestId("remote-cursor-other")).not.toBeInTheDocument();
  });

  it("proyecta presencia efímera remota sin cambiar el documento ni la revisión", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR", revision: 4 });
    detail.document.uml.classes.push({ id: "22222222-2222-4222-8222-222222222222", name: "Clase local", visibility: "public", attributes: [], operations: [] });
    detail.document.layout.elements.push({ elementId: "22222222-2222-4222-8222-222222222222", x: 100, y: 100 });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    realtime.join.mockResolvedValue({ projectId: detail.id, revision: 4, document: detail.document, accessRole: "EDITOR", presence: [] });

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    const documentBefore = structuredClone(useWorkspaceStore.getState().document);
    act(() => { realtime.eventListeners["project.presence.updated"]?.({ projectId: "project-1", presence: { userId: "other", displayName: "Otra", avatar: "OT", online: true, selectionId: "22222222-2222-4222-8222-222222222222", editingElementId: "22222222-2222-4222-8222-222222222222", cursor: { x: 24, y: 48 } } }); });

    expect(screen.getByTestId("remote-cursor-other")).toHaveStyle({ left: "24px", top: "48px" });
    expect(screen.getByTestId("remote-cursor-badge-other")).toHaveTextContent("OT");
    expect(screen.getByTestId("remote-cursor-badge-other")).toHaveStyle({ left: "6px", top: "6px" });
    expect(screen.queryByTestId("remote-cursor-pointer-other")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Colaboradores")).toHaveTextContent("OT");
    expect(useWorkspaceStore.getState().document).toEqual(documentBefore);
    expect(screen.getByText("Realtime connected · revisión confirmada 4")).toBeInTheDocument();

    act(() => { realtime.eventListeners["project.presence.updated"]?.({ projectId: "project-1", presence: { userId: "other", displayName: "Otra", avatar: "OT", online: true, cursor: { x: 60, y: 84 } } }); });

    expect(screen.getByTestId("remote-cursor-other")).toHaveStyle({ left: "60px", top: "84px" });
    expect(screen.getByTestId("remote-cursor-badge-other")).toHaveStyle({ left: "6px", top: "6px" });

    act(() => { realtime.eventListeners["project.presence.updated"]?.({ projectId: "project-1", presence: { userId: "other", displayName: "Otra", avatar: "OT", online: false } }); });
    expect(screen.queryByTestId("remote-cursor-other")).not.toBeInTheDocument();
  });

  it("aplica conflicto realtime con resync explícito y reingresa tras reconectar", async () => {
    const detail = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR", revision: 4 });
    const resynced = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR", revision: 6 });
    resynced.document.uml.classes.push({ id: "22222222-2222-4222-8222-222222222222", name: "Clase remota", visibility: "public", attributes: [], operations: [] });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValueOnce(detail).mockResolvedValueOnce(resynced);
    realtime.join.mockResolvedValueOnce({ projectId: detail.id, revision: 4, document: detail.document, accessRole: "EDITOR", presence: [] }).mockResolvedValueOnce({ projectId: resynced.id, revision: resynced.revision, document: resynced.document, accessRole: "EDITOR", presence: [] });
    realtime.resync.mockResolvedValue({ projectId: resynced.id, revision: resynced.revision, document: resynced.document, accessRole: "EDITOR", presence: [] });

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));
    act(() => { realtime.eventListeners["project.operation.conflict"]?.({ operationId: "stale", projectId: "project-1", code: "STALE_REVISION", revision: 6, requiresResync: true }); });
    expect(await screen.findByText("El proyecto tiene una versión más reciente en el servidor.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recargar versión" }));
    await waitFor(() => expect(client.getProject).toHaveBeenCalledTimes(2));
    expect(useWorkspaceStore.getState().document).toEqual(resynced.document);
    expect(screen.getByText("Realtime conflict · revisión confirmada 6")).toBeInTheDocument();

    act(() => { realtime.eventListeners.disconnect?.({}); realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Sincronizado r6")).toBeInTheDocument();
  });

  it.each([
    {
      name: "clase",
      snapshotKind: "class",
      prepare(document: ProjectDocument) {
        document.uml.classes.push({ id: "10000000-0000-4000-8000-000000000001", name: "Cliente", visibility: "public", attributes: [], operations: [] });
        document.layout.elements.push({ elementId: "10000000-0000-4000-8000-000000000001", x: 100, y: 100 });
      },
      remove() {
        useWorkspaceStore.getState().selectElement("10000000-0000-4000-8000-000000000001");
        useWorkspaceStore.getState().deleteSelectedClass();
      },
    },
    {
      name: "enumeración",
      snapshotKind: "enumeration",
      prepare(document: ProjectDocument) {
        document.uml.enumerations.push({ id: "20000000-0000-4000-8000-000000000001", name: "Estado", visibility: "public", literals: [] });
        document.layout.elements.push({ elementId: "20000000-0000-4000-8000-000000000001", x: 100, y: 100 });
      },
      remove() {
        useWorkspaceStore.getState().selectElement("20000000-0000-4000-8000-000000000001");
        useWorkspaceStore.getState().deleteSelectedEnumeration();
      },
    },
    {
      name: "relación",
      snapshotKind: "relationship",
      prepare(document: ProjectDocument) {
        document.uml.classes.push(
          { id: "30000000-0000-4000-8000-000000000001", name: "Origen", visibility: "public", attributes: [], operations: [] },
          { id: "30000000-0000-4000-8000-000000000002", name: "Destino", visibility: "public", attributes: [], operations: [] },
        );
        document.uml.relationships.push({ id: "30000000-0000-4000-8000-000000000003", type: "Association", sourceId: "30000000-0000-4000-8000-000000000001", targetId: "30000000-0000-4000-8000-000000000002" });
      },
      remove() {
        useWorkspaceStore.getState().selectRelationship("30000000-0000-4000-8000-000000000003");
        useWorkspaceStore.getState().deleteSelectedRelationship();
      },
    },
    {
      name: "atributo",
      snapshotKind: "attribute",
      prepare(document: ProjectDocument) {
        document.uml.classes.push({ id: "40000000-0000-4000-8000-000000000001", name: "Pedido", visibility: "public", attributes: [{ id: "40000000-0000-4000-8000-000000000002", name: "codigo", visibility: "private", type: { kind: "primitive", name: "string" } }], operations: [] });
      },
      remove() {
        useWorkspaceStore.getState().removeAttribute("40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002");
      },
    },
    {
      name: "literal",
      snapshotKind: "literal",
      prepare(document: ProjectDocument) {
        document.uml.enumerations.push({ id: "50000000-0000-4000-8000-000000000001", name: "Estado", visibility: "public", literals: ["NUEVO"] });
      },
      remove() {
        useWorkspaceStore.getState().removeEnumerationLiteral("50000000-0000-4000-8000-000000000001", "NUEVO");
      },
    },
  ])("confirma, deshace y rehace una eliminación colaborativa de $name con operaciones nuevas", async ({ snapshotKind, prepare, remove }) => {
    const detail = createProjectDetailFixture({ id: "project-1", accessRole: "EDITOR", revision: 4 });
    prepare(detail.document);
    const operationIds = ["operation-original", "operation-undo", "operation-redo"];
    const randomUUID = vi.fn(() => operationIds.shift()!);
    vi.stubGlobal("crypto", { randomUUID });
    sessionStorage.setItem("examen-sw1.access-token", "test-token");
    client.me.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    client.getProject.mockResolvedValue(detail);
    realtime.join.mockResolvedValue({ projectId: detail.id, revision: 4, document: detail.document, accessRole: "EDITOR", presence: [] });
    realtime.apply.mockImplementation(async (operationId, projectId, revision, command) => ({ operationId, projectId, revision: revision + 1, command }));

    render(<SessionProvider client={{ login: client.login, register: client.register, me: client.me }}><PersistedWorkspacePage /></SessionProvider>);
    await screen.findByText("Proyecto de prueba");
    act(() => { realtime.connectListener?.(); });
    await waitFor(() => expect(realtime.join).toHaveBeenCalledWith("project-1"));

    act(remove);
    await waitFor(() => expect(realtime.apply).toHaveBeenNthCalledWith(1, "operation-original", "project-1", 4, expect.any(Object)));
    const originalCommand = realtime.apply.mock.calls[0][3];
    const afterOriginal = structuredClone(useWorkspaceStore.getState().document);
    expect(useWorkspaceStore.getState().canUndo).toBe(true);

    // The server echoes the acknowledged local operation; it must not execute twice or clear history.
    act(() => { realtime.eventListeners["project.operation.accepted"]?.({ operationId: "operation-original", projectId: "project-1", revision: 5, command: originalCommand }); });
    expect(useWorkspaceStore.getState().document).toEqual(afterOriginal);
    expect(useWorkspaceStore.getState().canUndo).toBe(true);

    act(() => useWorkspaceStore.getState().undo());
    await waitFor(() => expect(realtime.apply).toHaveBeenNthCalledWith(2, "operation-undo", "project-1", 5, expect.objectContaining({ type: "RestoreDeletionSnapshot", snapshot: expect.objectContaining({ kind: snapshotKind }) })));
    await waitFor(() => expect(useWorkspaceStore.getState().canRedo).toBe(true));

    act(() => useWorkspaceStore.getState().redo());
    await waitFor(() => expect(realtime.apply).toHaveBeenNthCalledWith(3, "operation-redo", "project-1", 6, originalCommand));
    await waitFor(() => expect({ uml: useWorkspaceStore.getState().document.uml, layout: useWorkspaceStore.getState().document.layout }).toEqual({ uml: afterOriginal.uml, layout: afterOriginal.layout }));
    expect(randomUUID).toHaveBeenCalledTimes(3);
  });
});
