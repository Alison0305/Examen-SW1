import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "../page";
import ProjectsPage from "../projects/page";
import { createApiClient } from "./api";
import { AuthForm } from "./auth-form";
import { ProtectedPage } from "./protected-page";
import { safeReturnPath, SessionProvider, useSession } from "./session";

const navigation = {
  pathname: "/projects",
  search: "",
  replace: vi.fn(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: navigation.replace }),
}));

const user = { id: "user-1", email: "student@example.test" };

function createClient(overrides: Partial<ReturnType<typeof fakeClient>> = {}) {
  return { ...fakeClient(), ...overrides };
}

function fakeClient() {
  return {
    login: vi.fn().mockResolvedValue("jwt-value"),
    register: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue(user),
  };
}

function Probe() {
  const { status, user: currentUser, logout } = useSession();
  return <><span>{status}</span><span>{currentUser?.email}</span><button onClick={logout}>Salir</button></>;
}

afterEach(() => {
  sessionStorage.clear();
  navigation.pathname = "/projects";
  navigation.search = "";
  vi.clearAllMocks();
});

describe("cliente API y sesión", () => {
  it("lista y resuelve invitaciones internas autenticadas sin enviar tokens", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 200, ok: true, json: vi.fn().mockResolvedValue([]) });
    const client = createApiClient({ getToken: () => "secret-token", onUnauthorized: vi.fn(), fetcher, apiBaseUrl: "http://api.test" });

    await client.listMyInvitations();
    await client.acceptInvitationById("invite id");
    await client.rejectInvitationById("invite id");

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://api.test/invitations",
      "http://api.test/invitations/by-id/invite%20id/accept",
      "http://api.test/invitations/by-id/invite%20id/reject",
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect((init.headers as Headers).get("Authorization")).toBe("Bearer secret-token");
      expect(init.body).toBeUndefined();
    }
  });
  it("adjunta Bearer y notifica para limpiar sesión ante 401", async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({ status: 401, ok: false, json: vi.fn().mockResolvedValue({ message: "No autorizado" }) });
    const client = createApiClient({ getToken: () => "secret-token", onUnauthorized, fetcher, apiBaseUrl: "http://api.test" });

    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("http://api.test/auth/me", expect.objectContaining({ headers: expect.any(Headers) }));
    expect((fetcher.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("envía Content-Type solo en solicitudes con JSON y conserva DELETE sin body", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ status: 204, ok: true })
      .mockResolvedValueOnce({ status: 200, ok: true, json: vi.fn().mockResolvedValue({ id: "project-1" }) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: vi.fn().mockResolvedValue({ id: "project-1" }) });
    const client = createApiClient({ getToken: () => "secret-token", onUnauthorized: vi.fn(), fetcher, apiBaseUrl: "http://api.test" });

    await client.deleteProject("project-1");
    await client.createProject("Proyecto", { id: "11111111-1111-4111-8111-111111111111", revision: 1, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z", uml: { classes: [], enumerations: [], packages: [], relationships: [] }, layout: { elements: [] } });
    await client.saveProject("project-1", { id: "11111111-1111-4111-8111-111111111111", revision: 1, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z", uml: { classes: [], enumerations: [], packages: [], relationships: [] }, layout: { elements: [] } }, 1);

    const deleteInit = fetcher.mock.calls[0][1] as RequestInit;
    expect(deleteInit.method).toBe("DELETE");
    expect(deleteInit.body).toBeUndefined();
    expect((deleteInit.headers as Headers).get("Authorization")).toBe("Bearer secret-token");
    expect((deleteInit.headers as Headers).get("Content-Type")).toBeNull();
    for (const call of fetcher.mock.calls.slice(1)) {
      const init = call[1] as RequestInit;
      expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
      expect(init.body).toBeTruthy();
    }
  });

  it("exporta Spring como Blob autenticado y usa un nombre ZIP seguro", async () => {
    const onUnauthorized = vi.fn();
    const blob = new Blob(["zip"], { type: "application/zip" });
    const fetcher = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: new Headers({ "Content-Disposition": 'attachment; filename="spring-backend-project-1.zip"' }),
    });
    const client = createApiClient({ getToken: () => "secret-token", onUnauthorized, fetcher, apiBaseUrl: "http://api.test" });

    await expect(client.exportSpring("project-1", "bo.edu.examen")).resolves.toEqual({ blob, filename: "spring-backend-project-1.zip" });
    expect(fetcher).toHaveBeenCalledWith("http://api.test/projects/project-1/exports/spring", expect.objectContaining({ method: "POST", body: JSON.stringify({ basePackage: "bo.edu.examen" }) }));
    expect((fetcher.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer secret-token");
    expect((fetcher.mock.calls[0][1].headers as Headers).get("Content-Type")).toBe("application/json");

    fetcher.mockResolvedValueOnce({ status: 401, ok: false, json: vi.fn().mockResolvedValue({ message: "No autorizado" }) });
    await expect(client.exportSpring("project-1", "bo.edu.examen")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();

    fetcher.mockResolvedValueOnce({ status: 201, ok: true, blob: vi.fn().mockResolvedValue(blob), headers: new Headers({ "Content-Disposition": 'attachment; filename="../inseguro.zip"' }) });
    await expect(client.exportSpring("project-1", "bo.edu.examen")).resolves.toEqual({ blob, filename: "spring-backend-project-1.zip" });

    fetcher.mockRejectedValueOnce(new TypeError("NetworkError"));
    await expect(client.exportSpring("project-1", "bo.edu.examen")).rejects.toThrow("NetworkError");
  });

  it("usa los endpoints de membresías e invitaciones sin exponer secretos en tipos públicos", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 204, ok: true });
    const client = createApiClient({ getToken: () => "secret-token", onUnauthorized: vi.fn(), fetcher, apiBaseUrl: "http://api.test" });
    await client.removeMember("project-1", "user-1");
    await client.revokeInvitation("project-1", "invite-1");
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(["http://api.test/projects/project-1/members/user-1", "http://api.test/projects/project-1/invitations/invite-1"]);
    expect((fetcher.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
  });

  it("restaura /auth/me y elimina una sesión no válida", async () => {
    sessionStorage.setItem("examen-sw1.access-token", "stored-token");
    const client = createClient();
    render(<SessionProvider client={client}><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(client.me).toHaveBeenCalledOnce();

    sessionStorage.setItem("examen-sw1.access-token", "expired-token");
    render(<SessionProvider client={createClient({ me: vi.fn().mockRejectedValue(new Error("401")) })}><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getAllByText("anonymous")).toHaveLength(1));
    expect(sessionStorage.getItem("examen-sw1.access-token")).toBeNull();
  });
});

describe("landing y autenticación", () => {
  it("renderiza landing pública con CTAs responsive", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    render(<SessionProvider client={createClient()}><Home /></SessionProvider>);
    expect(screen.getByRole("heading", { name: /Diseña modelos UML/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/register");
    expect(screen.getAllByRole("link", { name: "Iniciar sesión" })[0]).toHaveAttribute("href", "/login");
  });

  it("redirige desde auth cuando ya existe una sesión restaurada", async () => {
    sessionStorage.setItem("examen-sw1.access-token", "stored-token");
    render(<SessionProvider client={createClient()}><AuthForm mode="login" /></SessionProvider>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/projects"));
  });

  it("inicia sesión válida y vuelve solo a una ruta interna segura", async () => {
    navigation.search = "returnTo=%2Fprojects%3Fview%3Drecent";
    const client = createClient();
    render(<SessionProvider client={client}><AuthForm mode="login" /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: "valid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/projects?view=recent"));
    expect(sessionStorage.getItem("examen-sw1.access-token")).toBe("jwt-value");
  });

  it("muestra error de login inválido sin token", async () => {
    const client = createClient({ login: vi.fn().mockRejectedValue(new Error("Credenciales inválidas.")) });
    render(<SessionProvider client={client}><AuthForm mode="login" /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("No fue posible completar la solicitud.")).toBeInTheDocument();
    expect(sessionStorage.getItem("examen-sw1.access-token")).toBeNull();
  });

  it("registra, inicia sesión y redirige; muestra errores de registro", async () => {
    const client = createClient();
    render(<SessionProvider client={client}><AuthForm mode="register" /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: "valid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(client.register).toHaveBeenCalledWith(user.email, "valid-password"));
    expect(client.login).toHaveBeenCalledWith(user.email, "valid-password");
    expect(navigation.replace).toHaveBeenCalledWith("/projects");

    const failingClient = createClient({ register: vi.fn().mockRejectedValue(new Error("Email inválido")) });
    render(<SessionProvider client={failingClient}><AuthForm mode="register" /></SessionProvider>);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Crear cuenta" })[1]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: "Crear cuenta" })[1]);
    expect(await screen.findByText("No fue posible completar la solicitud.")).toBeInTheDocument();
  });
});

describe("protección de rutas", () => {
  it("redirige visitante anónimo a login con retorno interno y rechaza destinos externos", async () => {
    navigation.pathname = "/projects";
    navigation.search = "tab=all";
    render(<SessionProvider client={createClient()}><ProtectedPage><p>Privado</p></ProtectedPage></SessionProvider>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?returnTo=%2Fprojects%3Ftab%3Dall"));
    expect(safeReturnPath("https://attacker.test")).toBe("/projects");
    expect(safeReturnPath("//attacker.test")).toBe("/projects");
    expect(safeReturnPath("/projects")).toBe("/projects");
  });

  it("muestra el placeholder protegido y logout elimina la sesión", async () => {
    sessionStorage.setItem("examen-sw1.access-token", "stored-token");
    render(<SessionProvider client={createClient()}><ProjectsPage /></SessionProvider>);
    expect(await screen.findByRole("heading", { name: "Tus proyectos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(sessionStorage.getItem("examen-sw1.access-token")).toBeNull());
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?returnTo=%2Fprojects"));
  });
});
