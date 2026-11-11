import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { ProjectRealtimeGateway } from "../realtime/project-realtime.gateway";
import { ATTRIBUTE_ID, AUTHOR, CLIENTE_ID, EDITOR_B, memoryDatabase, newProposal, NOMBRE_ID, OTHER_PROJECT_ID, OUTSIDER, OWNER, PROJECT_ID, PROPOSAL_ID, RECEIPT_AT, VIEWER, type MemoryDatabase } from "./mentor-proposal.test-support";
import { MentorProposalsModule } from "./mentor-proposals.module";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const USERS = new Map([OWNER, AUTHOR, EDITOR_B, VIEWER, OUTSIDER].map((user) => [user.id, user]));
const ROLES = new Map<string, "OWNER" | "EDITOR" | "VIEWER">([[OWNER.id, "OWNER"], [AUTHOR.id, "EDITOR"], [EDITOR_B.id, "EDITOR"], [VIEWER.id, "VIEWER"]]);
const base = `/projects/${PROJECT_ID}/mentor/proposals/${PROPOSAL_ID}`;
const auth = (user: { id: string }) => ({ Authorization: `Bearer ${user.id}` });

let app: NestFastifyApplication | undefined;

// Real MentorProposalsModule (controller, services, Prisma store, ProjectOperationService); only the edges are
// replaced: in-memory database, membership roles, revision lookup, the socket gateway and the JWT guard.
async function setup() {
  const db: MemoryDatabase = memoryDatabase();
  const broadcaster = { broadcastAccepted: vi.fn() };
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      const role = ROLES.get(userId);
      if (!role || (projectId !== PROJECT_ID && projectId !== OTHER_PROJECT_ID)) throw new NotFoundException();
      if (role === "VIEWER") throw new ForbiddenException();
      return role;
    }),
  };
  const projects = { findProject: vi.fn(async (id: string) => (id === db.project.id ? { revision: db.project.revision } : null)) };
  const module = await Test.createTestingModule({ imports: [PrismaModule, MentorProposalsModule] })
    .overrideProvider(PrismaService).useValue(db.prisma)
    .overrideProvider(ProjectAccessService).useValue(access)
    .overrideProvider(ProjectsPersistenceService).useValue(projects)
    .overrideProvider(ProjectRealtimeGateway).useValue(broadcaster)
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: unknown } } }) {
        const incoming = context.switchToHttp().getRequest();
        const user = USERS.get(incoming.headers.authorization?.replace(/^Bearer /, "") ?? "");
        if (!user) throw new UnauthorizedException();
        incoming.authenticatedUser = user;
        return true;
      },
    })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const store = new PrismaMentorProposalStore(db.prisma);
  await store.create(newProposal());
  return { http: request(app.getHttpServer()), db, store, broadcaster };
}

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
  vi.stubEnv("JWT_EXPIRES_IN", "1h");
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe("GET /projects/:projectId/mentor/proposals/:proposalId", () => {
  it("OWNER y EDITOR obtienen 200 con el contrato público", async () => {
    const { http } = await setup();
    for (const user of [OWNER, EDITOR_B]) {
      const response = await http.get(base).set(auth(user));
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: PROPOSAL_ID,
        status: "PENDING",
        baseRevision: 10,
        operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
        preview: { valid: true, diff: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], diagnostics: [] },
        createdAt: "2026-11-10T12:00:00.000Z",
      });
    }
  });

  it("VIEWER 403; sin acceso y propuesta de otro proyecto 404 con el mismo cuerpo", async () => {
    const { http } = await setup();
    expect((await http.get(base).set(auth(VIEWER))).status).toBe(403);
    const outsider = await http.get(base).set(auth(OUTSIDER));
    const otherProject = await http.get(`/projects/${OTHER_PROJECT_ID}/mentor/proposals/${PROPOSAL_ID}`).set(auth(OWNER));
    const missing = await http.get(`/projects/${PROJECT_ID}/mentor/proposals/00000000-0000-4000-8000-0000000000c9`).set(auth(OWNER));
    expect([outsider.status, otherProject.status, missing.status]).toEqual([404, 404, 404]);
    expect(otherProject.body).toEqual(outsider.body);
    expect(missing.body).toEqual(outsider.body);
  });

  it("una propuesta obsoleta se informa como preview inválido con STALE_PROPOSAL", async () => {
    const { http, db } = await setup();
    db.project.revision = 11;
    const response = await http.get(base).set(auth(OWNER));
    expect(response.body).toMatchObject({ status: "PENDING", preview: { valid: false, diagnostics: [{ code: "STALE_PROPOSAL", severity: "error" }] } });
  });
});

describe("POST .../apply", () => {
  it("OWNER aplica: 200 con APPLIED, resolvedAt y resultingRevision, una sola emisión y sin datos internos", async () => {
    const { http, db, broadcaster } = await setup();

    const response = await http.post(`${base}/apply`).set(auth(OWNER));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: PROPOSAL_ID, status: "APPLIED", resultingRevision: 11, resolvedAt: expect.any(String) });
    expect(Object.keys(response.body).sort()).toEqual(["baseRevision", "createdAt", "id", "operation", "preview", "resolvedAt", "resultingRevision", "status"]);
    const serialized = JSON.stringify(response.body);
    for (const hidden of ["command", "projectId", "authorUserId", "resolvedByUserId", "authorEmail", "instruction", "classId", "attributeId", "ack", CLIENTE_ID, ATTRIBUTE_ID, NOMBRE_ID, PROJECT_ID, OWNER.id, AUTHOR.id]) {
      expect(serialized).not.toContain(hidden);
    }
    expect(db.project.revision).toBe(11);
    expect(db.proposals[0]).toMatchObject({ status: "APPLIED", resolvedByUserId: OWNER.id });
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
  });

  it("EDITOR aplica una propuesta de otro autor: 200", async () => {
    const { http, db } = await setup();
    expect((await http.post(`${base}/apply`).set(auth(EDITOR_B))).status).toBe(200);
    expect(db.proposals[0]).toMatchObject({ authorUserId: AUTHOR.id, resolvedByUserId: EDITOR_B.id });
  });

  it("VIEWER 403 sin modificar el modelo", async () => {
    const { http, db } = await setup();
    expect((await http.post(`${base}/apply`).set(auth(VIEWER))).status).toBe(403);
    expect(db.project.revision).toBe(10);
    expect(db.proposals[0]!.status).toBe("PENDING");
  });

  it("obsoleta 409 STALE_PROPOSAL; ya aplicada 409; rechazada 409", async () => {
    const stale = await setup();
    stale.db.project.revision = 11;
    const staleResponse = await stale.http.post(`${base}/apply`).set(auth(OWNER));
    expect(staleResponse.status).toBe(409);
    expect(staleResponse.body).toEqual({ statusCode: 409, error: "Conflict", code: "STALE_PROPOSAL", message: expect.any(String) });
    await app?.close();

    const applied = await setup();
    await applied.http.post(`${base}/apply`).set(auth(OWNER));
    const again = await applied.http.post(`${base}/apply`).set(auth(OWNER));
    expect([again.status, again.body.code]).toEqual([409, "PROPOSAL_ALREADY_APPLIED"]);
    await app?.close();

    const rejected = await setup();
    await rejected.store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: EDITOR_B.id, resolvedAt: RECEIPT_AT });
    const afterReject = await rejected.http.post(`${base}/apply`).set(auth(OWNER));
    expect([afterReject.status, afterReject.body.code]).toEqual([409, "PROPOSAL_REJECTED"]);
  });

  it("inválida 422 INVALID_PROPOSAL con diagnósticos públicos", async () => {
    const { http, db } = await setup();
    (db.project.document.uml as ProjectDocument["uml"]).classes = [];
    (db.project.document.layout as ProjectDocument["layout"]).elements = [];

    const response = await http.post(`${base}/apply`).set(auth(OWNER));

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ statusCode: 422, error: "Unprocessable Entity", code: "INVALID_PROPOSAL", diagnostics: [{ code: "UML_UNKNOWN_REFERENCE", severity: "error" }] });
    for (const diagnostic of response.body.diagnostics) expect(Object.keys(diagnostic).sort()).toEqual(["code", "message", "severity"]);
  });

  it("ignora por completo el cuerpo: baseRevision y command enviados no afectan la operación", async () => {
    const { http, db } = await setup();

    const response = await http.post(`${base}/apply`).set(auth(OWNER)).send({ baseRevision: 999, command: { type: "DeleteClass", classId: CLIENTE_ID }, status: "REJECTED", userId: VIEWER.id });

    expect(response.status).toBe(200);
    expect(db.project.revision).toBe(11);
    expect(db.attributes()).toEqual([NOMBRE_ID, ATTRIBUTE_ID]);
    expect((db.project.document.uml as ProjectDocument["uml"]).classes.map((umlClass) => umlClass.id)).toEqual([CLIENTE_ID]);
    expect(db.proposals[0]).toMatchObject({ status: "APPLIED", resolvedByUserId: OWNER.id });
  });
});

describe("POST .../reject", () => {
  it("OWNER y EDITOR rechazan: 200 REJECTED sin tocar UML", async () => {
    for (const user of [OWNER, EDITOR_B]) {
      const { http, db, broadcaster } = await setup();
      const response = await http.post(`${base}/reject`).set(auth(user)).send({ command: { type: "DeleteClass" } });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: "REJECTED", resolvedAt: expect.any(String) });
      expect(response.body).not.toHaveProperty("resultingRevision");
      expect(db.project.revision).toBe(10);
      expect(broadcaster.broadcastAccepted).not.toHaveBeenCalled();
      await app?.close();
    }
  });

  it("VIEWER 403; ya aplicada 409; ya rechazada 409", async () => {
    const viewer = await setup();
    expect((await viewer.http.post(`${base}/reject`).set(auth(VIEWER))).status).toBe(403);
    await app?.close();

    const applied = await setup();
    await applied.http.post(`${base}/apply`).set(auth(OWNER));
    const afterApply = await applied.http.post(`${base}/reject`).set(auth(OWNER));
    expect([afterApply.status, afterApply.body.code]).toEqual([409, "PROPOSAL_ALREADY_APPLIED"]);
    await app?.close();

    const rejected = await setup();
    await rejected.http.post(`${base}/reject`).set(auth(OWNER));
    const again = await rejected.http.post(`${base}/reject`).set(auth(EDITOR_B));
    expect([again.status, again.body.code]).toEqual([409, "PROPOSAL_REJECTED"]);
  });
});

describe("validación de ruta, autenticación y errores internos", () => {
  it("IDs inválidos 400 y sin JWT 401 en las tres rutas", async () => {
    const { http } = await setup();
    for (const path of [`/projects/no-uuid/mentor/proposals/${PROPOSAL_ID}`, `/projects/${PROJECT_ID}/mentor/proposals/no-uuid`]) {
      expect((await http.get(path).set(auth(OWNER))).status).toBe(400);
      expect((await http.post(`${path}/apply`).set(auth(OWNER))).status).toBe(400);
      expect((await http.post(`${path}/reject`).set(auth(OWNER))).status).toBe(400);
    }
    expect((await http.get(base)).status).toBe(401);
    expect((await http.post(`${base}/apply`)).status).toBe(401);
    expect((await http.post(`${base}/reject`)).status).toBe(401);
  });

  it("datos persistidos corruptos producen un 500 genérico sin filtrar el JSON almacenado", async () => {
    const { http, db } = await setup();
    db.proposals[0]!.command = { type: "DeleteClass", secreto: "valor-interno" } as never;

    const response = await http.get(base).set(auth(OWNER));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/secreto|valor-interno|DeleteClass|command/);
  });
});
