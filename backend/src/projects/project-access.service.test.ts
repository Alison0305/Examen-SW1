import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProjectAccessRole, ProjectAccessService } from "./project-access.service";

describe("ProjectAccessService", () => {
  it("resuelve owner, editor, viewer y ausencia de acceso", async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce({ ownerId: "owner", memberships: [] })
      .mockResolvedValueOnce({ ownerId: "owner", memberships: [{ role: "EDITOR" }] })
      .mockResolvedValueOnce({ ownerId: "owner", memberships: [{ role: "VIEWER" }] })
      .mockResolvedValueOnce(null);
    const service = new ProjectAccessService({ project: { findUnique } } as never);

    await expect(service.resolve("project", "owner")).resolves.toBe(ProjectAccessRole.OWNER);
    await expect(service.resolve("project", "editor")).resolves.toBe(ProjectAccessRole.EDITOR);
    await expect(service.resolve("project", "viewer")).resolves.toBe(ProjectAccessRole.VIEWER);
    await expect(service.resolve("project", "none")).resolves.toBe(ProjectAccessRole.NONE);
  });

  it("traduce NONE a 404 y roles conocidos insuficientes a 403", async () => {
    const none = new ProjectAccessService({ project: { findUnique: vi.fn().mockResolvedValue(null) } } as never);
    const viewer = new ProjectAccessService({ project: { findUnique: vi.fn().mockResolvedValue({ ownerId: "owner", memberships: [{ role: "VIEWER" }] }) } } as never);
    const editor = new ProjectAccessService({ project: { findUnique: vi.fn().mockResolvedValue({ ownerId: "owner", memberships: [{ role: "EDITOR" }] }) } } as never);

    await expect(none.requireView("project", "none")).rejects.toBeInstanceOf(NotFoundException);
    await expect(viewer.requireEdit("project", "viewer")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(editor.requireOwner("project", "editor")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
