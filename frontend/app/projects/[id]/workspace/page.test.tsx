import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PersistedWorkspacePage from "./page";
import { ApiError } from "../../../auth/api";
import { SessionProvider } from "../../../auth/session";
import { createProjectDetailFixture, resetPersistedWorkspaceTest } from "../../../workspace/persisted-workspace-test-harness";
import { useWorkspaceStore } from "../../../workspace/workspace-store";

const routerPush = vi.fn();
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

afterEach(() => { sessionStorage.clear(); vi.clearAllMocks(); resetPersistedWorkspaceTest(); });

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
});
