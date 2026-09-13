import { describe, expect, it, vi } from "vitest";
import { ProjectRealtimeGateway } from "./project-realtime.gateway";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test" };
const projectId = "22222222-2222-4222-8222-222222222222";

function socket(token = "token"): { handshake: { auth: { token: string }; headers: Record<string, string> }; data: { user?: typeof user }; rooms: Set<string>; emit: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; join: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn> } {
  return { handshake: { auth: { token }, headers: {} }, data: {}, rooms: new Set([`project:${projectId}`]), emit: vi.fn(), disconnect: vi.fn(), join: vi.fn(), leave: vi.fn() };
}

function gateway() {
  const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: user.id }) };
  const auth = { findAuthenticatedUser: vi.fn().mockResolvedValue(user) };
  const access = { requireView: vi.fn().mockResolvedValue("OWNER") };
  const operations = { getState: vi.fn().mockResolvedValue({ projectId, revision: 1, document: {}, accessRole: "OWNER" }), apply: vi.fn() };
  const accessInvalidations = { subscribe: vi.fn().mockReturnValue(vi.fn()) };
  const instance = new ProjectRealtimeGateway(jwt as never, auth as never, access as never, accessInvalidations as never, operations as never);
  const roomEmit = vi.fn();
  const server = { to: vi.fn().mockReturnValue({ emit: roomEmit }), use: vi.fn() };
  instance.server = server as never;
  instance.afterInit(server as never);
  const middleware = server.use.mock.calls[0]?.[0] as (client: ReturnType<typeof socket>, next: (error?: Error & { data?: { code: string } }) => void) => void;
  return { instance, jwt, auth, access, operations, middleware, roomEmit };
}

describe("ProjectRealtimeGateway", () => {
  it("acepta el JWT existente durante el handshake sin identidad del cliente", async () => {
    const { middleware } = gateway();
    const client = socket();
    await new Promise<void>((resolve, reject) => middleware(client, (error) => error ? reject(error) : resolve()));
    expect(client.data.user).toEqual(user);
  });

  it("rechaza uniformemente un handshake sin token válido", async () => {
    const { middleware, jwt } = gateway();
    jwt.verifyAsync.mockRejectedValueOnce(new Error("bad token"));
    const client = socket();
    await expect(new Promise<void>((resolve, reject) => middleware(client, (error) => error ? reject(error) : resolve()))).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
  });

  it("permite observar a un VIEWER, pero no filtra estado a quien no tiene acceso", async () => {
    const { instance, access, operations } = gateway();
    const client = socket();
    client.data.user = user;
    access.requireView.mockResolvedValueOnce("VIEWER");
    await expect(instance.join(client as never, { projectId })).resolves.toMatchObject({ projectId, revision: 1 });
    expect(client.join).toHaveBeenCalledWith(`project:${projectId}`);

    access.requireView.mockRejectedValueOnce(new Error("no access"));
    await expect(instance.join(client as never, { projectId })).resolves.toEqual({ code: "UNAUTHORIZED" });
    expect(operations.getState).toHaveBeenCalledTimes(1);
  });

  it("difunde solo una operación aceptada a su sala y devuelve rechazo de VIEWER", async () => {
    const { instance, operations } = gateway();
    const client = socket();
    client.data.user = user;
    operations.apply.mockResolvedValueOnce({ operationId: "33333333-3333-4333-8333-333333333333", projectId, revision: 2, command: { type: "CreateClass", name: "Cliente" } });
    await expect(instance.apply(client as never, { operationId: "33333333-3333-4333-8333-333333333333", projectId, baseRevision: 1, command: { type: "CreateClass", name: "Cliente" } })).resolves.toMatchObject({ revision: 2 });
    expect(instance.server.to).toHaveBeenCalledWith(`project:${projectId}`);

    operations.apply.mockRejectedValueOnce(new Error("viewer"));
    await expect(instance.apply(client as never, { operationId: "44444444-4444-4444-8444-444444444444", projectId, baseRevision: 2, command: { type: "CreateClass", name: "Pedido" } })).resolves.toMatchObject({ code: "FORBIDDEN" });
  });

  it("mantiene presencia efímera, inmediata y cursor coalescido sin ejecutar operaciones UML", async () => {
    vi.useFakeTimers();
    const { instance, roomEmit, operations } = gateway();
    const client = socket();
    client.data.user = user;
    await instance.join(client as never, { projectId });
    roomEmit.mockClear();

    await instance.updatePresence(client as never, { projectId, selectionId: "class-1", editingElementId: "class-1", activity: true });
    for (let index = 0; index < 50; index += 1) await instance.updatePresence(client as never, { projectId, cursor: { x: index, y: index } });
    await vi.runAllTimersAsync();

    const updates = roomEmit.mock.calls.filter(([event]) => event === "project.presence.updated");
    expect(updates.length).toBeLessThanOrEqual(3);
    expect(updates.at(-1)?.[1]).toMatchObject({ presence: { cursor: { x: 49, y: 49 }, selectionId: "class-1", editingElementId: "class-1" } });
    expect(operations.apply).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
