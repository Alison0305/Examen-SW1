import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProjectOperationService } from "../realtime/project-operation.service";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import type { MentorProposalStore } from "./mentor-proposal-store";
import { MentorProposalRejectionService } from "./mentor-proposal-rejection.service";
import { AUTHOR, EDITOR_B, memoryDatabase, newProposal, OTHER_PROJECT_ID, PROJECT_ID, PROPOSAL_ID, RECEIPT_AT, VIEWER } from "./mentor-proposal.test-support";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const REJECTED_AT = new Date("2026-11-10T12:06:00.000Z");
const FORBIDDEN_PROJECT_ID = "00000000-0000-4000-8000-0000000000f3";

async function setup(options: { receiptAfterReject?: boolean } = {}) {
  const db = memoryDatabase();
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      if (projectId === FORBIDDEN_PROJECT_ID) throw new NotFoundException();
      if (userId === VIEWER.id) throw new ForbiddenException();
      return "EDITOR" as const;
    }),
  };
  const operations = new ProjectOperationService(db.prisma, access as never);
  const prismaStore = new PrismaMentorProposalStore(db.prisma);
  const store: MentorProposalStore = {
    create: (proposal) => prismaStore.create(proposal),
    findByProjectAndId: vi.fn((projectId: string, proposalId: string) => prismaStore.findByProjectAndId(projectId, proposalId)),
    reject: vi.fn(async (input: Parameters<MentorProposalStore["reject"]>[0]) => {
      const result = await prismaStore.reject(input);
      // RC-03: an accepted operation lands right after the rejection and before the second receipt check.
      if (options.receiptAfterReject) db.addReceipt(AUTHOR.id, { operationId: PROPOSAL_ID, projectId: PROJECT_ID, revision: 11, command: (await prismaStore.findByProjectAndId(PROJECT_ID, PROPOSAL_ID))!.command });
      return result;
    }),
    markApplied: (input) => prismaStore.markApplied(input),
    reconcileAcceptedOperation: vi.fn((input: Parameters<MentorProposalStore["reconcileAcceptedOperation"]>[0]) => prismaStore.reconcileAcceptedOperation(input)),
  };
  const service = new MentorProposalRejectionService(access as never, store, operations, () => REJECTED_AT);
  const created = await prismaStore.create(newProposal());
  return { db, store, service, created, prismaStore };
}

describe("MentorProposalRejectionService", () => {
  it("RC-01 PENDING con recibo aceptado: se reconcilia como APPLIED y responde PROPOSAL_ALREADY_APPLIED", async () => {
    const { db, store, service, created } = await setup();
    db.addReceipt(EDITOR_B.id, { operationId: PROPOSAL_ID, projectId: PROJECT_ID, revision: 11, command: created.command });

    expect(await service.reject(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "PROPOSAL_ALREADY_APPLIED" });
    expect(store.reject).not.toHaveBeenCalled();
    expect(db.proposals[0]).toMatchObject({ status: "APPLIED", resolvedByUserId: EDITOR_B.id, resolvedAt: RECEIPT_AT, resultingRevision: 11 });
  });

  it("RC-02 PENDING sin recibo: queda REJECTED con quien rechaza, sin tocar UML", async () => {
    const { db, service, created } = await setup();
    const document = structuredClone(db.project.document);

    const result = await service.reject(PROJECT_ID, PROPOSAL_ID, EDITOR_B);

    expect(result).toEqual({ ok: true, proposal: { ...created, status: "REJECTED", resolvedAt: REJECTED_AT, resolvedByUserId: EDITOR_B.id } });
    expect(db.project.document).toEqual(document);
    expect(db.project.revision).toBe(10);
  });

  it("RC-03 un recibo que aparece tras el rechazo y antes del segundo chequeo gana: REJECTED → APPLIED", async () => {
    const { db, store, service } = await setup({ receiptAfterReject: true });

    expect(await service.reject(PROJECT_ID, PROPOSAL_ID, EDITOR_B)).toEqual({ ok: false, code: "PROPOSAL_ALREADY_APPLIED" });
    expect(store.reject).toHaveBeenCalledTimes(1);
    expect(store.reconcileAcceptedOperation).toHaveBeenCalledTimes(1);
    expect(db.proposals[0]).toMatchObject({ status: "APPLIED", resolvedByUserId: AUTHOR.id, resultingRevision: 11 });
  });

  it("RC-04 el rechazo completo mientras apply está en vuelo lo corrige el servicio de aplicación a APPLIED", async () => {
    const { db, store, service: rejection } = await setup();
    const access = { requireEdit: vi.fn(async () => "EDITOR" as const) };
    const operations = new ProjectOperationService(db.prisma, access as never);
    const original = operations.apply.bind(operations);
    vi.spyOn(operations, "apply").mockImplementationOnce(async (userId, dto) => {
      // The rejection runs entirely (both receipt checks see nothing) before the operation commits.
      expect(await rejection.reject(PROJECT_ID, PROPOSAL_ID, EDITOR_B)).toMatchObject({ ok: true });
      return original(userId, dto);
    });
    const application = new MentorProposalApplicationService(access as never, store, operations, { broadcastAccepted: vi.fn() }, () => REJECTED_AT);

    const result = await application.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(result).toMatchObject({ ok: true, reconciled: true, proposal: { status: "APPLIED", resolvedByUserId: AUTHOR.id, resultingRevision: 11 } });
    expect(db.proposals[0]).toMatchObject({ status: "APPLIED", resultingRevision: 11 });
    expect(db.project.revision).toBe(11);
  });

  it("RC-05 una propuesta REJECTED sin recibo sigue REJECTED", async () => {
    const { db, store, service } = await setup();
    await service.reject(PROJECT_ID, PROPOSAL_ID, EDITOR_B);

    expect(await service.reject(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "PROPOSAL_REJECTED" });
    expect(store.reject).toHaveBeenCalledTimes(1);
    expect(db.proposals[0]).toMatchObject({ status: "REJECTED", resolvedByUserId: EDITOR_B.id });
  });

  it("RC-06 una propuesta APPLIED no llega al store de rechazo", async () => {
    const { store, service, prismaStore } = await setup();
    await prismaStore.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: AUTHOR.id, resolvedAt: RECEIPT_AT, resultingRevision: 11 });

    expect(await service.reject(PROJECT_ID, PROPOSAL_ID, EDITOR_B)).toEqual({ ok: false, code: "PROPOSAL_ALREADY_APPLIED" });
    expect(store.reject).not.toHaveBeenCalled();
    expect(store.reconcileAcceptedOperation).not.toHaveBeenCalled();
  });

  it("autoriza antes de revelar la propuesta: sin acceso 404, VIEWER 403, otro proyecto NOT_FOUND", async () => {
    const { store, service } = await setup();
    await expect(service.reject(FORBIDDEN_PROJECT_ID, PROPOSAL_ID, AUTHOR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reject(PROJECT_ID, PROPOSAL_ID, VIEWER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.findByProjectAndId).not.toHaveBeenCalled();
    expect(await service.reject(OTHER_PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});
