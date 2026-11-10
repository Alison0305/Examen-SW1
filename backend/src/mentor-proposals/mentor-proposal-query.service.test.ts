import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import { describe, expect, it, vi } from "vitest";
import { MentorProposalQueryService } from "./mentor-proposal-query.service";
import { STALE_PROPOSAL_DIAGNOSTIC } from "./mentor-proposal-response";
import { ATTRIBUTE_ID, AUTHOR, CLIENTE_ID, EDITOR_B, memoryDatabase, newProposal, NOMBRE_ID, OTHER_PROJECT_ID, PROJECT_ID, PROPOSAL_ID, RECEIPT_AT, VIEWER } from "./mentor-proposal.test-support";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const FORBIDDEN_PROJECT_ID = "00000000-0000-4000-8000-0000000000f3";
const OPERATION = { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } };
const DIFF = [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }];

async function setup() {
  const db = memoryDatabase();
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      if (projectId === FORBIDDEN_PROJECT_ID) throw new NotFoundException();
      if (userId === VIEWER.id) throw new ForbiddenException();
      return "EDITOR" as const;
    }),
  };
  const store = new PrismaMentorProposalStore(db.prisma);
  const findByProjectAndId = vi.spyOn(store, "findByProjectAndId");
  const projects = { findProject: vi.fn(async (id: string) => (id === db.project.id ? { revision: db.project.revision } : null)) };
  const service = new MentorProposalQueryService(access as never, store, projects as never);
  await store.create(newProposal());
  return { db, store, service, findByProjectAndId, projects };
}

describe("MentorProposalQueryService", () => {
  it("Q-01 PENDING con la misma revisión: preview válido con el diff y los diagnósticos almacenados", async () => {
    const { service } = await setup();
    expect(await service.get(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({
      id: PROPOSAL_ID,
      status: "PENDING",
      baseRevision: 10,
      operation: OPERATION,
      preview: { valid: true, diff: DIFF, diagnostics: [] },
      createdAt: "2026-11-10T12:00:00.000Z",
    });
  });

  it("Q-02 PENDING obsoleta: preview inválido con STALE_PROPOSAL añadido a los diagnósticos almacenados", async () => {
    const { db, service } = await setup();
    db.proposals[0]!.diagnostics = [{ code: "UML_NOTE", severity: "warning", message: "Aviso almacenado." }] as never;
    db.project.revision = 11;

    const response = await service.get(PROJECT_ID, PROPOSAL_ID, EDITOR_B);

    expect(response?.status).toBe("PENDING");
    expect(response?.preview).toEqual({ valid: false, diff: DIFF, diagnostics: [{ code: "UML_NOTE", severity: "warning", message: "Aviso almacenado." }, STALE_PROPOSAL_DIAGNOSTIC] });
  });

  it("Q-03/Q-04/Q-05 usa solo los snapshots: no recalcula diff, operación ni diagnósticos desde el UML actual", async () => {
    const { db, service } = await setup();
    (db.project.document.uml as ProjectDocument["uml"]).classes = [];
    db.proposals[0]!.summary = [{ kind: "added", element: "attribute", label: "Snapshot.diff: string" }] as never;
    db.proposals[0]!.operation = { kind: "ADD_ATTRIBUTE", target: { className: "Snapshot" }, change: { attributeName: "x", attributeType: "integer", multiplicity: "0..1" } } as never;
    db.proposals[0]!.diagnostics = [{ code: "SNAPSHOT", severity: "warning", message: "Del snapshot." }] as never;

    const response = await service.get(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(response?.preview.diff).toEqual([{ kind: "added", element: "attribute", label: "Snapshot.diff: string" }]);
    expect(response?.operation).toEqual({ kind: "ADD_ATTRIBUTE", target: { className: "Snapshot" }, change: { attributeName: "x", attributeType: "integer", multiplicity: "0..1" } });
    expect(response?.preview.diagnostics).toEqual([{ code: "SNAPSHOT", severity: "warning", message: "Del snapshot." }]);
  });

  it("Q-06/Q-07 no expone comando, autor, instrucción, proyecto ni identificadores internos", async () => {
    const { service, store } = await setup();
    await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: EDITOR_B.id, resolvedAt: RECEIPT_AT, resultingRevision: 11 });

    const response = await service.get(PROJECT_ID, PROPOSAL_ID, AUTHOR);
    const serialized = JSON.stringify(response);

    expect(Object.keys(response!).sort()).toEqual(["baseRevision", "createdAt", "id", "operation", "preview", "resolvedAt", "resultingRevision", "status"]);
    for (const hidden of ["command", "projectId", "authorUserId", "resolvedByUserId", "authorEmail", "instruction", "classId", "attributeId", CLIENTE_ID, ATTRIBUTE_ID, NOMBRE_ID, PROJECT_ID, AUTHOR.id, EDITOR_B.id, AUTHOR.email]) {
      expect(serialized).not.toContain(hidden);
    }
  });

  it("Q-08 APPLIED conserva su preview aunque el proyecto haya avanzado", async () => {
    const { db, service, store } = await setup();
    await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: EDITOR_B.id, resolvedAt: RECEIPT_AT, resultingRevision: 11 });
    db.project.revision = 15;

    expect(await service.get(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toMatchObject({ status: "APPLIED", resultingRevision: 11, resolvedAt: RECEIPT_AT.toISOString(), preview: { valid: true, diff: DIFF, diagnostics: [] } });
  });

  it("Q-09 REJECTED conserva su preview y no tiene resultingRevision", async () => {
    const { db, service, store } = await setup();
    await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: EDITOR_B.id, resolvedAt: RECEIPT_AT });
    db.project.revision = 15;

    const response = await service.get(PROJECT_ID, PROPOSAL_ID, AUTHOR);
    expect(response).toMatchObject({ status: "REJECTED", resolvedAt: RECEIPT_AT.toISOString(), preview: { valid: true, diff: DIFF, diagnostics: [] } });
    expect(response).not.toHaveProperty("resultingRevision");
  });

  it("autoriza antes de buscar: sin acceso 404 y VIEWER 403; otro proyecto o id inexistente no se encuentran", async () => {
    const { service, findByProjectAndId } = await setup();
    await expect(service.get(FORBIDDEN_PROJECT_ID, PROPOSAL_ID, AUTHOR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(PROJECT_ID, PROPOSAL_ID, VIEWER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findByProjectAndId).not.toHaveBeenCalled();
    expect(await service.get(OTHER_PROJECT_ID, PROPOSAL_ID, AUTHOR)).toBeUndefined();
    expect(await service.get(PROJECT_ID, "00000000-0000-4000-8000-0000000000c9", AUTHOR)).toBeUndefined();
  });
});
