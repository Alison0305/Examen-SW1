import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { UmlCommandBus, deserializeProjectDocument, serializeProjectDocument, type Diagnostic, type UmlCommand } from "@examen-sw1/uml-core";
import { Prisma, type ProjectOperationReceipt } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import type { ApplyProjectOperationDto, ApplyProjectOperationResult, ProjectOperationAck, ProjectOperationConflict, ProjectOperationRejected, ProjectRealtimeState } from "./realtime.contracts";

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ProjectOperationService {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectAccessService) private readonly access: ProjectAccessService,
  ) {}

  async getState(projectId: string, userId: string): Promise<ProjectRealtimeState> {
    const accessRole = await this.access.requireView(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("PROJECT_UNAVAILABLE");
    return { projectId, revision: project.revision, document: deserialize(project.document), accessRole, presence: [] };
  }

  async apply(userId: string, dto: ApplyProjectOperationDto): Promise<ApplyProjectOperationResult> {
    await this.access.requireEdit(dto.projectId, userId);
    return this.serialized(dto.projectId, async () => this.applyAuthorized(userId, dto));
  }

  private async applyAuthorized(userId: string, dto: ApplyProjectOperationDto): Promise<ApplyProjectOperationResult> {
    const fingerprint = fingerprintFor(userId, dto);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.projectOperationReceipt.findUnique({
          where: { projectId_operationId: { projectId: dto.projectId, operationId: dto.operationId } },
        });
        if (existing) {
          if (existing.expiresAt > now) return replayOrCollision(existing, fingerprint, dto);
          await tx.projectOperationReceipt.deleteMany({ where: { id: existing.id, expiresAt: { lte: now } } });
        }
        await tx.projectOperationReceipt.deleteMany({
          where: {
            expiresAt: { lt: now },
            NOT: { projectId: dto.projectId, operationId: dto.operationId },
          },
        });

        const project = await tx.project.findUnique({ where: { id: dto.projectId } });
        if (!project || project.revision !== dto.baseRevision) return conflict(dto, project?.revision ?? dto.baseRevision);

        const executed = execute(deserialize(project.document), dto.command);
        if (!executed.success) return rejected(dto, executed.diagnostics);

        const document = JSON.parse(serializeProjectDocument(executed.document)) as Prisma.InputJsonValue;
        const updated = await tx.project.updateMany({
          where: { id: dto.projectId, revision: dto.baseRevision },
          data: { document, revision: { increment: 1 } },
        });
        if (!updated.count) {
          const current = await tx.project.findUnique({ where: { id: dto.projectId }, select: { revision: true } });
          return conflict(dto, current?.revision ?? dto.baseRevision);
        }

        const ack: ProjectOperationAck = { operationId: dto.operationId, projectId: dto.projectId, revision: dto.baseRevision + 1, command: dto.command };
        await tx.projectOperationReceipt.create({
          data: {
            projectId: dto.projectId,
            operationId: dto.operationId,
            actorUserId: userId,
            baseRevision: dto.baseRevision,
            resultingRevision: ack.revision,
            fingerprint,
            ack: ack as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
          },
        });
        return ack;
      });
    } catch (error) {
      if (!isUniqueReceiptError(error)) throw error;
      const winner = await this.prisma.projectOperationReceipt.findUnique({ where: { projectId_operationId: { projectId: dto.projectId, operationId: dto.operationId } } });
      if (!winner) throw error;
      return replayOrCollision(winner, fingerprint, dto);
    }
  }

  private async serialized<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.queues.set(projectId, tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.queues.get(projectId) === tail) this.queues.delete(projectId);
    }
  }
}

function execute(document: ReturnType<typeof deserializeProjectDocument>, command: UmlCommand) {
  try { return new UmlCommandBus(document, { historyLimit: 0 }).execute(command); }
  catch { return { success: false as const, diagnostics: invalidDiagnostics() }; }
}

function replayOrCollision(receipt: ProjectOperationReceipt, fingerprint: string, dto: ApplyProjectOperationDto): ApplyProjectOperationResult {
  if (receipt.fingerprint !== fingerprint) return rejected(dto, invalidDiagnostics("El operationId ya fue utilizado para otra intención."));
  return receipt.ack as unknown as ProjectOperationAck;
}

function rejected(dto: ApplyProjectOperationDto, diagnostics: Diagnostic[]): ProjectOperationRejected {
  return { operationId: dto.operationId, projectId: dto.projectId, code: "INVALID_OPERATION", diagnostics };
}

function conflict(dto: ApplyProjectOperationDto, revision: number): ProjectOperationConflict {
  return { operationId: dto.operationId, projectId: dto.projectId, code: "STALE_REVISION", revision, requiresResync: true };
}

function invalidDiagnostics(message = "El comando UML no es válido."): Diagnostic[] {
  return [{ severity: "error", code: "UML_INVALID_TYPE", message, path: "command" }];
}

function fingerprintFor(userId: string, dto: ApplyProjectOperationDto): string {
  return createHash("sha256").update(canonicalize({ actorUserId: userId, projectId: dto.projectId, baseRevision: dto.baseRevision, command: dto.command })).digest("hex");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deserialize(value: Prisma.JsonValue) {
  return deserializeProjectDocument(JSON.stringify(value));
}

function isUniqueReceiptError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
