import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PrismaProjectChatStore } from "./prisma-project-chat.store";

const PROJECT = "00000000-0000-4000-8000-0000000000f1";
const ID = "00000000-0000-4000-8000-0000000000c1";
const AT = new Date("2026-11-11T12:00:00.000Z");
const row = { id: ID, projectId: PROJECT, kind: "USER", authorUserId: "00000000-0000-4000-8000-0000000000b1", authorEmail: "ana@example.test", body: "hola", mentionsMentor: false, replyToId: null, proposalId: null, createdAt: AT };

function setup() {
  const delegate = { create: vi.fn(async () => row), findMany: vi.fn(async () => [row]) };
  return { delegate, store: new PrismaProjectChatStore({ projectChatMessage: delegate } as unknown as PrismaService) };
}

describe("PrismaProjectChatStore", () => {
  it("lista por proyecto con orden keyset (createdAt DESC, id DESC) y take", async () => {
    const { delegate, store } = setup();
    await store.list(PROJECT, 31);
    expect(delegate.findMany).toHaveBeenCalledWith({ where: { projectId: PROJECT }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31 });
  });

  it("con cursor filtra estrictamente después: fecha anterior, o misma fecha con id menor, siempre dentro del proyecto", async () => {
    const { delegate, store } = setup();
    await store.list(PROJECT, 11, { createdAt: AT, id: ID });
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT, OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: ID } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 11,
    });
  });

  it("crea con los campos explícitos y devuelve el registro de dominio", async () => {
    const { delegate, store } = setup();
    const stored = await store.create({ ...row, kind: "USER" });
    expect(delegate.create).toHaveBeenCalledWith({ data: { ...row } });
    expect(stored).toEqual(row);
  });
});
