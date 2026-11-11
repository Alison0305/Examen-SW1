import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { MentorProposalHistoryProjection } from "../mentor-proposals/mentor-proposal.contracts";
import { MentorHistoryProposalsService } from "./mentor-history-proposals.service";

// CU-2P-07, task 8.1: MentorHistoryProposalsService with doubles for its two edges (the shared project access policy and
// CU-2P-06's MentorProposalHistoryService). Both append to one sequence so the order is observable.

const PROJECT = "d7035000-0000-4000-8000-0000000000aa";
const USER = "d7035000-0000-4000-8000-0000000000bb";
const ITEMS: MentorProposalHistoryProjection[] = [
  { proposalId: "d7035000-0000-4000-8000-0000000000d2", status: "APPLIED", operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } }, summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], baseRevision: 4, createdAt: "2026-11-10T10:00:00.000Z", resolvedAt: "2026-11-10T10:05:00.000Z", resultingRevision: 5 },
  { proposalId: "d7035000-0000-4000-8000-0000000000d1", status: "PENDING", operation: { kind: "ADD_ATTRIBUTE", target: { className: "Pedido" }, change: { attributeName: "total", attributeType: "number" } }, summary: [{ kind: "added", element: "attribute", label: "Pedido.total: number" }], baseRevision: 3, createdAt: "2026-11-10T09:00:00.000Z" },
];

function setup(options: { access?: () => Promise<unknown>; list?: () => Promise<MentorProposalHistoryProjection[]> } = {}) {
  const sequence: string[] = [];
  const access = { requireView: vi.fn(async (projectId: string, userId: string) => { sequence.push("requireView"); void projectId; void userId; return options.access ? options.access() : "VIEWER"; }) };
  // Like the real MentorProposalHistoryService, it authorizes before reading.
  const proposals = { list: vi.fn(async (projectId: string, userId: string, limit?: number) => { sequence.push("proposals.list"); void projectId; void userId; void limit; if (options.access) await options.access(); return options.list ? options.list() : ITEMS; }) };
  return { service: new MentorHistoryProposalsService(access, proposals), access, proposals, sequence };
}

describe("MentorHistoryProposalsService.list (tarea 8.1)", () => {
  it("con query válida delega en MentorProposalHistoryService.list(projectId, userId, limit) y devuelve su proyección sin tocarla", async () => {
    const { service, proposals, access, sequence } = setup();

    const result = await service.list(PROJECT, USER, { limit: "2" });

    expect(proposals.list).toHaveBeenCalledExactlyOnceWith(PROJECT, USER, 2);
    expect(result).toEqual({ ok: true, list: { items: ITEMS } });
    // Same array and objects: no reordering, filtering or re-projection.
    expect(result.ok && result.list.items).toBe(ITEMS);
    // CU-2P-06 already checks requireView: access is checked once, inside it.
    expect(access.requireView).not.toHaveBeenCalled();
    expect(sequence).toEqual(["proposals.list"]);
  });

  it("sin limit usa el valor por defecto de CU-2P-06 (20)", async () => {
    const { service, proposals } = setup();

    await service.list(PROJECT, USER, {});

    expect(proposals.list).toHaveBeenCalledWith(PROJECT, USER, 20);
  });

  it("un proyecto sin propuestas es { items: [] }, no un error", async () => {
    const { service } = setup({ list: async () => [] });

    await expect(service.list(PROJECT, USER, {})).resolves.toEqual({ ok: true, list: { items: [] } });
  });

  it.each([[{ limit: "0" }, "INVALID_LIMIT"], [{ limit: "51" }, "INVALID_LIMIT"], [{ limit: "abc" }, "INVALID_LIMIT"], [{ cursor: "x" }, "UNKNOWN_PARAMETER"]] as const)(
    "query inválida %j: autoriza primero, devuelve %s y nunca lee propuestas",
    async (raw, code) => {
      const { service, proposals, access, sequence } = setup();

      const result = await service.list(PROJECT, USER, raw);

      expect(result).toEqual({ ok: false, error: expect.objectContaining({ code }) });
      expect(access.requireView).toHaveBeenCalledExactlyOnceWith(PROJECT, USER);
      expect(proposals.list).not.toHaveBeenCalled();
      expect(sequence).toEqual(["requireView"]);
    },
  );

  it("sin acceso: la NotFoundException de requireView se propaga tal cual, también con una query inválida (sin revelar nada)", async () => {
    const notFound = new NotFoundException();
    const denied = () => Promise.reject(notFound);

    await expect(setup({ access: denied }).service.list(PROJECT, USER, {})).rejects.toBe(notFound);
    const invalid = setup({ access: denied });
    await expect(invalid.service.list(PROJECT, USER, { limit: "0" })).rejects.toBe(notFound);
    expect(invalid.proposals.list).not.toHaveBeenCalled();
  });

  it("un error de lectura de CU-2P-06 se propaga: nunca se convierte en una lista vacía", async () => {
    const failure = new Error("fallo de infraestructura");

    await expect(setup({ list: () => Promise.reject(failure) }).service.list(PROJECT, USER, {})).rejects.toBe(failure);
  });
});
