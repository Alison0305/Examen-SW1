import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InvitePage from "./page";
import { SessionProvider } from "../../auth/session";
import { ApiError } from "../../auth/api";

const router = { replace: vi.fn() };
const api = { login: vi.fn(), register: vi.fn(), me: vi.fn(), getInvitation: vi.fn(), acceptInvitation: vi.fn(), rejectInvitation: vi.fn() };
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "invite-token" }), useRouter: () => router, usePathname: () => "/invite/invite-token", useSearchParams: () => new URLSearchParams() }));
vi.mock("../../auth/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../auth/api")>()), createApiClient: () => api }));

function renderPage() { sessionStorage.setItem("examen-sw1.access-token", "token"); api.me.mockResolvedValue({ id: "user-1", email: "invitee@example.test" }); return render(<SessionProvider client={api}><InvitePage /></SessionProvider>); }
afterEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });

describe("ruta de invitación", () => {
  it("consulta y acepta la invitación autenticada para volver a proyectos", async () => {
    api.getInvitation.mockResolvedValue({ id: "invite-1", projectId: "project-1", invitedById: "owner-1", email: "invitee@example.test", role: "EDITOR", status: "PENDING", expiresAt: "2026-09-20T00:00:00.000Z", createdAt: "2026-09-13T00:00:00.000Z", resolvedAt: null });
    api.acceptInvitation.mockResolvedValue({});
    renderPage();
    expect(await screen.findByText("Has sido invitado como Editor.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    await waitFor(() => expect(api.acceptInvitation).toHaveBeenCalledWith("invite-token"));
    expect(router.replace).toHaveBeenCalledWith("/projects");
  });

  it("muestra el mismo estado no disponible para un token rechazado", async () => {
    api.getInvitation.mockRejectedValue(new ApiError(404, "No encontrado"));
    renderPage();
    expect(await screen.findByText("La invitación no está disponible.")).toBeInTheDocument();
  });
});
