// Test support for CU-2P-06 (not a test file): fixtures and an in-memory stand-in for the Prisma delegates used by
// the real ProjectOperationService, PrismaMentorProposalStore and the project revision lookup.
import { createProjectDocument, primitiveType, type ProjectDocument } from "@examen-sw1/uml-core";
import type { MentorProposal as MentorProposalRow, ProjectOperationReceipt } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { previewMentorProposal } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";
import { buildNewMentorProposal, type NewMentorProposal } from "./mentor-proposal-store";

export const PROJECT_ID = "00000000-0000-4000-8000-0000000000f1";
export const OTHER_PROJECT_ID = "00000000-0000-4000-8000-0000000000f2";
export const PROPOSAL_ID = "00000000-0000-4000-8000-0000000000c1";
export const CLIENTE_ID = "00000000-0000-4000-8000-000000000010";
export const NOMBRE_ID = "00000000-0000-4000-8000-000000000011";
export const ATTRIBUTE_ID = "00000000-0000-4000-8000-0000000000a1";
export const CREATED_AT = new Date("2026-11-10T12:00:00.000Z");
export const RECEIPT_AT = new Date("2026-11-10T12:04:00.000Z");
export const OWNER = { id: "00000000-0000-4000-8000-0000000000b0", email: "owner@example.test" };
export const AUTHOR = { id: "00000000-0000-4000-8000-0000000000b1", email: "autora@example.test" };
export const EDITOR_B = { id: "00000000-0000-4000-8000-0000000000b2", email: "editor@example.test" };
export const VIEWER = { id: "00000000-0000-4000-8000-0000000000b3", email: "viewer@example.test" };
export const OUTSIDER = { id: "00000000-0000-4000-8000-0000000000b4", email: "outsider@example.test" };

export function projectDocument(): ProjectDocument {
  const document = createProjectDocument({ id: "00000000-0000-4000-8000-000000000001", now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: NOMBRE_ID, name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 });
  return document;
}

// The proposal "Agrega el atributo teléfono de tipo String a Cliente" built through the real resolver and preview.
export function newProposal(overrides: Partial<{ projectId: string; author: { id: string; email: string } }> = {}): NewMentorProposal {
  const document = projectDocument();
  const resolved = resolveMentorProposal(document, { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" }, { uuidFactory: () => ATTRIBUTE_ID });
  if (!resolved.ok) throw new Error("se esperaba una resolución correcta");
  const author = overrides.author ?? AUTHOR;
  const built = buildNewMentorProposal(
    { projectId: overrides.projectId ?? PROJECT_ID, author: { userId: author.id, email: author.email }, instruction: "Agrega el atributo teléfono de tipo String a Cliente", command: resolved.command, operation: resolved.operation, preview: previewMentorProposal(document, resolved.command) },
    { uuidFactory: () => PROPOSAL_ID, nowFactory: () => CREATED_AT },
  );
  if (!built.ok) throw new Error("se esperaba una propuesta");
  return built.proposal;
}

type Where = Record<string, unknown>;

// Equality, plus Prisma's `{ in: [...] }` filter used by the reconciliation UPDATE.
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) return (value as { in: unknown[] }).in.includes(row[key]);
    return row[key] === value;
  });
}

export type MemoryDatabase = ReturnType<typeof memoryDatabase>;

export function memoryDatabase() {
  const project = { id: PROJECT_ID, name: "CRM", revision: 10, document: JSON.parse(JSON.stringify(projectDocument())) as Record<string, unknown> };
  const receipts: ProjectOperationReceipt[] = [];
  const proposals: MentorProposalRow[] = [];
  const receiptFor = (where: { projectId_operationId: { projectId: string; operationId: string } }) => receipts.find((entry) => entry.projectId === where.projectId_operationId.projectId && entry.operationId === where.projectId_operationId.operationId);
  const client = {
    project: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === project.id ? structuredClone(project) : null),
      updateMany: async ({ where, data }: { where: { id: string; revision: number }; data: { document: Record<string, unknown>; revision: { increment: number } } }) => {
        if (where.id !== project.id || where.revision !== project.revision) return { count: 0 };
        project.document = structuredClone(data.document);
        project.revision += data.revision.increment;
        return { count: 1 };
      },
    },
    projectOperationReceipt: {
      findUnique: async ({ where }: { where: { projectId_operationId: { projectId: string; operationId: string } } }) => structuredClone(receiptFor(where) ?? null),
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Omit<ProjectOperationReceipt, "id" | "createdAt"> }) => {
        const row = { id: `receipt-${receipts.length + 1}`, createdAt: RECEIPT_AT, ...structuredClone(data) } as ProjectOperationReceipt;
        receipts.push(row);
        return row;
      },
    },
    mentorProposal: {
      create: async ({ data }: { data: Omit<MentorProposalRow, "resolvedAt" | "resolvedByUserId" | "resultingRevision"> }) => {
        const row = { resolvedAt: null, resolvedByUserId: null, resultingRevision: null, ...structuredClone(data) } as MentorProposalRow;
        proposals.push(row);
        return structuredClone(row);
      },
      findFirst: async ({ where }: { where: Where }) => structuredClone(proposals.find((row) => matches(row, where)) ?? null),
      updateMany: async ({ where, data }: { where: Where; data: Partial<MentorProposalRow> }) => {
        const targets = proposals.filter((row) => matches(row, where));
        targets.forEach((row) => Object.assign(row, data));
        return { count: targets.length };
      },
    },
    $transaction: async <T>(operation: (tx: unknown) => Promise<T>) => operation(client),
  };
  const attributes = () => ((project.document.uml as ProjectDocument["uml"]).classes[0]?.attributes ?? []).map((attribute) => attribute.id);
  const addReceipt = (actorUserId: string, ack: unknown) => receipts.push({ id: "receipt-0", projectId: PROJECT_ID, operationId: PROPOSAL_ID, actorUserId, baseRevision: 10, resultingRevision: 11, fingerprint: "x", ack: ack as never, createdAt: RECEIPT_AT, expiresAt: new Date("2026-11-11T12:04:00.000Z") });
  return { prisma: client as unknown as PrismaService, project, receipts, proposals, attributes, addReceipt };
}
