import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MentorProposalHistoryService } from "./mentor-proposal-history.service";
import { toMentorProposalHistoryProjection } from "./mentor-proposal-response";
import type { StoredMentorProposal } from "./mentor-proposal-store";
import { ATTRIBUTE_ID, AUTHOR, CLIENTE_ID, CREATED_AT, newProposal, OWNER, PROJECT_ID, PROPOSAL_ID, RECEIPT_AT, VIEWER } from "./mentor-proposal.test-support";

const pending = (): StoredMentorProposal => ({ ...newProposal(), status: "PENDING" });
const rejected = (): StoredMentorProposal => ({ ...newProposal(), status: "REJECTED", resolvedAt: RECEIPT_AT, resolvedByUserId: OWNER.id });
const applied = (): StoredMentorProposal => ({ ...newProposal(), status: "APPLIED", resolvedAt: RECEIPT_AT, resolvedByUserId: OWNER.id, resultingRevision: 11 });

const PUBLIC = {
  proposalId: PROPOSAL_ID,
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
  summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }],
  baseRevision: 10,
  createdAt: CREATED_AT.toISOString(),
};

describe("toMentorProposalHistoryProjection (CU-2P-07, tarea 11.1)", () => {
  it("representa PENDING sin resolución ni revisión resultante", () => {
    expect(toMentorProposalHistoryProjection(pending())).toEqual({ ...PUBLIC, status: "PENDING" });
  });

  it("representa REJECTED con resolvedAt y sin resultingRevision", () => {
    expect(toMentorProposalHistoryProjection(rejected())).toEqual({ ...PUBLIC, status: "REJECTED", resolvedAt: RECEIPT_AT.toISOString() });
  });

  it("representa APPLIED con resolvedAt y resultingRevision", () => {
    expect(toMentorProposalHistoryProjection(applied())).toEqual({ ...PUBLIC, status: "APPLIED", resolvedAt: RECEIPT_AT.toISOString(), resultingRevision: 11 });
  });

  it("no filtra comando, identificadores UML, autor, resolutor, proyecto, instrucción ni diagnósticos", () => {
    for (const proposal of [pending(), rejected(), applied()]) {
      const projection = toMentorProposalHistoryProjection(proposal);
      const serialized = JSON.stringify(projection);
      expect(Object.keys(projection).sort()).toEqual(Object.keys({ ...PUBLIC, status: 0, ...(proposal.status !== "PENDING" ? { resolvedAt: 0 } : {}), ...(proposal.status === "APPLIED" ? { resultingRevision: 0 } : {}) }).sort());
      for (const hidden of ["command", "AddAttribute", CLIENTE_ID, ATTRIBUTE_ID, AUTHOR.id, AUTHOR.email, OWNER.id, PROJECT_ID, "instruction", "Agrega el atributo", "diagnostics", "resolvedByUserId", "authorEmail"]) {
        expect(serialized).not.toContain(hidden);
      }
    }
  });

  it("es determinista y serializable (JSON de ida y vuelta sin pérdidas)", () => {
    const projection = toMentorProposalHistoryProjection(applied());
    expect(toMentorProposalHistoryProjection(applied())).toEqual(projection);
    expect(JSON.parse(JSON.stringify(projection))).toEqual(projection);
  });
});

describe("MentorProposalHistoryService.list", () => {
  function setup(rows: StoredMentorProposal[] = [applied()], denied?: Error) {
    const sequence: string[] = [];
    const access = { requireView: vi.fn(async () => { sequence.push("requireView"); if (denied) throw denied; return "VIEWER" as const; }) };
    const store = { listByProject: vi.fn(async (projectId: string, limit: number) => { void projectId; void limit; sequence.push("store"); return rows; }) };
    return { service: new MentorProposalHistoryService(access, store), access, store, sequence };
  }

  it("autoriza con requireView (también VIEWER) antes de leer, filtra por proyecto y devuelve la proyección pública", async () => {
    const { service, access, store, sequence } = setup([applied(), pending()]);
    const result = await service.list(PROJECT_ID, VIEWER.id);

    expect(access.requireView).toHaveBeenCalledExactlyOnceWith(PROJECT_ID, VIEWER.id);
    expect(store.listByProject).toHaveBeenCalledExactlyOnceWith(PROJECT_ID, 20);
    expect(sequence).toEqual(["requireView", "store"]);
    expect(result).toEqual([toMentorProposalHistoryProjection(applied()), toMentorProposalHistoryProjection(pending())]);
  });

  it("sin acceso propaga el 404 existente y no lee nada", async () => {
    const denied = new NotFoundException();
    const { service, store } = setup([applied()], denied);

    await expect(service.list(PROJECT_ID, "outsider")).rejects.toBe(denied);
    expect(store.listByProject).not.toHaveBeenCalled();
  });

  it.each([0, 51, 1.5, Number.NaN])("un límite inválido (%s) se rechaza sin leer", async (limit) => {
    const { service, store } = setup();
    await expect(service.list(PROJECT_ID, OWNER.id, limit)).rejects.toBeInstanceOf(RangeError);
    expect(store.listByProject).not.toHaveBeenCalled();
  });

  it("respeta el límite explícito y un proyecto sin propuestas devuelve una lista vacía", async () => {
    const { service, store } = setup([]);
    await expect(service.list(PROJECT_ID, OWNER.id, 50)).resolves.toEqual([]);
    expect(store.listByProject).toHaveBeenCalledWith(PROJECT_ID, 50);
  });
});
