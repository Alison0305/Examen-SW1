import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { MentorInteractionIdentityResolver } from "./mentor-interaction-identity.resolver";

const alice: AuthenticatedUser = { id: "user-alice", email: "alice@example.test" };
const bob: AuthenticatedUser = { id: "user-bob", email: "bob@example.test" };

function resolverFor(role: "OWNER" | "EDITOR" | "VIEWER" = "OWNER") {
  const access = { requireView: vi.fn().mockResolvedValue(role) };
  return { resolver: new MentorInteractionIdentityResolver(access as never), access };
}

describe("MentorInteractionIdentityResolver", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["OWNER", "EDITOR", "VIEWER"] as const)("deriva identidad autorizada para %s", async (accessRole) => {
    const { resolver } = resolverFor(accessRole);

    await expect(resolver.resolve("project-a", alice)).resolves.toMatchObject({ projectId: "project-a", userId: "user-alice", author: { email: "alice@example.test" }, accessRole });
  });

  it("propaga la excepción de requireView sin producir una identidad", async () => {
    const access = { requireView: vi.fn().mockRejectedValue(new NotFoundException()) };
    const resolver = new MentorInteractionIdentityResolver(access as never);

    await expect(resolver.resolve("project-a", alice)).rejects.toBeInstanceOf(NotFoundException);
    expect(access.requireView).toHaveBeenCalledOnce();
  });

  it("no mezcla la identidad de dos usuarios", async () => {
    const { resolver, access } = resolverFor();

    const [forAlice, forBob] = await Promise.all([resolver.resolve("project-a", alice), resolver.resolve("project-a", bob)]);

    expect(forAlice).toMatchObject({ userId: "user-alice", author: { email: "alice@example.test" } });
    expect(forBob).toMatchObject({ userId: "user-bob", author: { email: "bob@example.test" } });
    expect(access.requireView).toHaveBeenCalledWith("project-a", "user-alice");
    expect(access.requireView).toHaveBeenCalledWith("project-a", "user-bob");
  });

  it("no mezcla el ámbito de dos proyectos", async () => {
    const { resolver, access } = resolverFor("EDITOR");

    const [projectA, projectB] = await Promise.all([resolver.resolve("project-a", alice), resolver.resolve("project-b", alice)]);

    expect(projectA).toMatchObject({ projectId: "project-a", accessRole: "EDITOR" });
    expect(projectB).toMatchObject({ projectId: "project-b", accessRole: "EDITOR" });
    expect(access.requireView).toHaveBeenCalledWith("project-a", "user-alice");
    expect(access.requireView).toHaveBeenCalledWith("project-b", "user-alice");
  });

  it("autoriza exactamente el proyecto solicitado para el usuario autenticado", async () => {
    const { resolver, access } = resolverFor("VIEWER");

    await resolver.resolve("project-a", alice);

    expect(access.requireView).toHaveBeenCalledTimes(1);
    expect(access.requireView).toHaveBeenCalledWith("project-a", "user-alice");
  });

  it("genera el timestamp en el servidor después de la autorización", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00.000Z"));
    const access = { requireView: vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-11-09T10:01:00.000Z"));
      return "OWNER";
    }) };
    const resolver = new MentorInteractionIdentityResolver(access as never);

    const identity = await resolver.resolve("project-a", alice);

    expect(identity.occurredAt).toEqual(new Date("2026-11-09T10:01:00.000Z"));
  });

  it("devuelve exclusivamente el contrato aprobado sin secretos ni datos adicionales", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00.000Z"));
    const { resolver } = resolverFor();

    const identity = await resolver.resolve("project-a", alice);

    expect(identity).toEqual({ projectId: "project-a", userId: "user-alice", author: { email: "alice@example.test" }, accessRole: "OWNER", occurredAt: new Date("2026-11-09T10:00:00.000Z") });
    expect(JSON.stringify(identity)).not.toMatch(/passwordHash|token|jwt|secret|uml|provider/i);
  });
});
