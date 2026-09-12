import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "./page";
import { SessionProvider } from "../auth/session";
import { createProjectDocument } from "@examen-sw1/uml-core";
import { ApiError } from "../auth/api";

const router = { push: vi.fn(), replace: vi.fn() };
const api = {
  login: vi.fn(), register: vi.fn(), me: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.test" }),
  listProjects: vi.fn(), createProject: vi.fn(), renameProject: vi.fn(), deleteProject: vi.fn(), getProject: vi.fn(), saveProject: vi.fn(),
};

vi.mock("next/navigation", () => ({ usePathname: () => "/projects", useSearchParams: () => new URLSearchParams(), useRouter: () => router }));
vi.mock("../auth/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../auth/api")>()), createApiClient: () => api }));

const summary = { id: "11111111-1111-4111-8111-111111111111", name: "Proyecto UML", accessRole: "OWNER" as const, revision: 3, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" };
function renderPage() { sessionStorage.setItem("examen-sw1.access-token", "token"); return render(<SessionProvider client={api}><ProjectsPage /></SessionProvider>); }
afterEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
beforeEach(() => { api.me.mockResolvedValue({ id: "user-1", email: "user@example.test" }); });

describe("gestión de proyectos", () => {
  it("muestra loading y el estado vacío", async () => {
    let resolveProjects!: (projects: typeof summary[]) => void;
    api.listProjects.mockReturnValue(new Promise<typeof summary[]>((resolve) => { resolveProjects = resolve; }));
    renderPage();
    expect(await screen.findByLabelText("Cargando proyectos")).toBeInTheDocument();
    resolveProjects([]);
    expect(await screen.findByText("No tienes proyectos todavía.")).toBeInTheDocument();
  });

  it("muestra un error y permite reintentar la carga", async () => {
    api.listProjects.mockRejectedValueOnce(new ApiError(500, "Error"));
    api.listProjects.mockResolvedValueOnce([summary]);
    renderPage();

    expect(await screen.findByText("No fue posible cargar los proyectos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Proyecto UML")).toBeInTheDocument();
  });

  it("muestra el estado vacío sin cards fantasma", async () => {
    api.listProjects.mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText("No tienes proyectos todavía.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nuevo proyecto" })).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument();
  });

  it("lista proyectos sin exponer el documento ni ownership", async () => {
    const second = { ...summary, id: "22222222-2222-4222-8222-222222222222", name: "Proyecto dos", updatedAt: "2026-09-03T00:00:00.000Z" };
    api.listProjects.mockResolvedValue([summary, second]);
    renderPage();

    expect(await screen.findByText("Proyecto UML")).toBeInTheDocument();
    expect(screen.getByText("Proyecto dos")).toBeInTheDocument();
    expect(screen.getAllByText(/Última modificación:/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Abrir" })).toHaveLength(2);
    expect(screen.queryByText(/ownerId|document/i)).not.toBeInTheDocument();
  });

  it("muestra roles amigables y reserva acciones administrativas al propietario", async () => {
    api.listProjects.mockResolvedValue([{ ...summary, accessRole: "EDITOR" }, { ...summary, id: "22222222-2222-4222-8222-222222222222", name: "Solo lectura", accessRole: "VIEWER" }]);
    renderPage();
    expect(await screen.findByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Lector")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Abrir" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Renombrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compartir" })).not.toBeInTheDocument();
  });

  it("crea un proyecto con nombre trim y navega al workspace", async () => {
    api.listProjects.mockResolvedValue([]);
    api.createProject.mockResolvedValue({ ...summary, id: "22222222-2222-4222-8222-222222222222", document: createProjectDocument() });
    api.renameProject.mockResolvedValue({ ...summary, name: "Proyecto nuevo", document: {} });
    api.deleteProject.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo proyecto" }));
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "  Mi proyecto UML  " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith("Mi proyecto UML", expect.objectContaining({ id: expect.any(String), revision: 1, uml: { classes: [], enumerations: [], packages: [], relationships: [] }, layout: { elements: [] } })));
    expect(router.push).toHaveBeenCalledWith("/projects/22222222-2222-4222-8222-222222222222/workspace");
  });

  it("bloquea nombres vacíos, espacios y mayores de 100 caracteres", async () => {
    api.listProjects.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo proyecto" }));
    const name = screen.getByLabelText("Nombre");

    fireEvent.change(name, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
    fireEvent.change(name, { target: { value: "a".repeat(101) } });
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("renombra un proyecto existente", async () => {
    api.listProjects.mockResolvedValue([summary]);
    api.renameProject.mockResolvedValue({ ...summary, name: "Proyecto nuevo", document: {} });
    renderPage();
    expect(await screen.findByText("Proyecto UML")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renombrar" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "  Proyecto nuevo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.renameProject).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "Proyecto nuevo"));
    expect(await screen.findByText("Proyecto nuevo")).toBeInTheDocument();
  });

  it("cancela la eliminación de un proyecto", async () => {
    api.listProjects.mockResolvedValue([summary]);
    api.deleteProject.mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText("Proyecto UML")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(screen.getByText("Proyecto UML")).toBeInTheDocument();
  });

  it("elimina el último proyecto tras confirmar", async () => {
    api.listProjects.mockResolvedValue([summary]);
    api.deleteProject.mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText("Proyecto UML")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
    expect(await screen.findByText("No tienes proyectos todavía.")).toBeInTheDocument();
  });

  it("abre el workspace persistido", async () => {
    api.listProjects.mockResolvedValue([summary]);
    renderPage();
    expect(await screen.findByText("Proyecto UML")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(router.push).toHaveBeenCalledWith("/projects/11111111-1111-4111-8111-111111111111/workspace");
  });

  it("cierra la sesión y permite que el guard redirija a login", async () => {
    api.listProjects.mockResolvedValue([]);
    renderPage();
    await screen.findByText("No tienes proyectos todavía.");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?returnTo=%2Fprojects"));
  });
});
