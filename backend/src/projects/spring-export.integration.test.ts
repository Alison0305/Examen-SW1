import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createProjectDocument, UmlCommandBus, type ProjectDocument } from "@examen-sw1/uml-core";
import { strFromU8, unzipSync } from "fflate";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessService } from "./project-access.service";
import { ProjectsPersistenceService } from "./projects-persistence.service";
import { SpringExportController } from "./spring-export.controller";
import { SpringExportService } from "./spring-export.service";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const outputRoot = resolve(process.cwd(), "..", "spring-generator", ".generated-fix-cu06-e2e");

function projectDocument(): ProjectDocument {
  const document = createProjectDocument({ id: projectId, now: new Date("2026-09-22T00:00:00.000Z") });
  const rolId = "33333333-3333-4333-8333-333333333333";
  const usuarioId = "44444444-4444-4444-8444-444444444444";
  document.uml.classes.push(
    {
      id: rolId,
      name: "Rol",
      visibility: "public",
      generationMetadata: { entity: true },
      operations: [],
      attributes: [
        { id: "55555555-5555-4555-8555-555555555555", name: "id", visibility: "private", type: { kind: "primitive", name: "integer" }, generationMetadata: { identifier: true } },
        { id: "66666666-6666-4666-8666-666666666666", name: "nombre", visibility: "private", type: { kind: "primitive", name: "string" }, generationMetadata: { required: true } },
      ],
    },
    {
      id: usuarioId,
      name: "Usuario",
      visibility: "public",
      generationMetadata: { entity: true },
      operations: [],
      attributes: [
        { id: "77777777-7777-4777-8777-777777777777", name: "id", visibility: "private", type: { kind: "primitive", name: "integer" }, generationMetadata: { identifier: true } },
        { id: "88888888-8888-4888-8888-888888888888", name: "email", visibility: "private", type: { kind: "primitive", name: "string" }, generationMetadata: { required: true } },
      ],
    },
  );
  document.uml.relationships.push({ id: "99999999-9999-4999-8999-999999999999", name: "usuarios", type: "Association", sourceId: rolId, targetId: usuarioId, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
  document.layout.elements.push({ elementId: rolId, x: 20, y: 30 }, { elementId: usuarioId, x: 500, y: 400 });
  return document;
}

function workspaceDocument(): ProjectDocument {
  const bus = new UmlCommandBus(createProjectDocument({ id: projectId, now: new Date("2026-09-22T00:00:00.000Z") }));
  const rolId = "33333333-3333-4333-8333-333333333333";
  const usuarioId = "44444444-4444-4444-8444-444444444444";
  const execute = (command: Parameters<UmlCommandBus["execute"]>[0]) => expect(bus.execute(command).success).toBe(true);
  execute({ type: "CreateClass", classId: rolId, name: "Rol", layout: { x: 20, y: 30 } });
  execute({ type: "CreateClass", classId: usuarioId, name: "Usuario", layout: { x: 500, y: 400 } });
  execute({ type: "AddAttribute", classId: rolId, attributeId: "55555555-5555-4555-8555-555555555555", name: "id", attributeType: { kind: "primitive", name: "integer" } });
  execute({ type: "AddAttribute", classId: rolId, attributeId: "66666666-6666-4666-8666-666666666666", name: "nombre", attributeType: { kind: "primitive", name: "string" } });
  execute({ type: "AddAttribute", classId: usuarioId, attributeId: "77777777-7777-4777-8777-777777777777", name: "id", attributeType: { kind: "primitive", name: "integer" } });
  execute({ type: "AddAttribute", classId: usuarioId, attributeId: "88888888-8888-4888-8888-888888888888", name: "email", attributeType: { kind: "primitive", name: "string" } });
  execute({ type: "CreateRelationship", relationshipId: "99999999-9999-4999-8999-999999999999", relationshipType: "Association", sourceId: rolId, targetId: usuarioId, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
  return bus.document;
}

async function writeZipContents(files: Record<string, Uint8Array>): Promise<void> {
  await rm(outputRoot, { recursive: true, force: true });
  for (const [path, content] of Object.entries(files)) {
    const destination = join(outputRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

function filesFrom(zip: Buffer): Record<string, Uint8Array> {
  return unzipSync(zip);
}

describe("Spring export persisted ProjectDocument integration", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => { await app?.close(); });

  it("persiste UML, genera el ZIP del endpoint y conserva la semántica frente a layout o cambios UML", async () => {
    let stored: Record<string, unknown> | null = null;
    const prisma = {
      project: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = { ...data, id: projectId, revision: 1, createdAt: new Date(), updatedAt: new Date() };
          return stored;
        }),
        findUnique: vi.fn(async () => stored),
      },
    };
    const persistence = new ProjectsPersistenceService(prisma as never);
    const access = { requireView: vi.fn().mockResolvedValue("VIEWER") };
    const exporter = new SpringExportService(persistence, access as never);
    const document = projectDocument();
    await persistence.createProject(userId, "Roles", document);

    const module = await Test.createTestingModule({
      controllers: [SpringExportController],
      providers: [SpringExportService, { provide: ProjectsPersistenceService, useValue: persistence }, { provide: ProjectAccessService, useValue: access }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { authenticatedUser?: { id: string } } } }) {
        context.switchToHttp().getRequest().authenticatedUser = { id: userId };
        return true;
      },
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).send({ basePackage: "com.example.generated" }).buffer(true).parse((source, callback) => {
      const chunks: Buffer[] = [];
      source.on("data", (chunk: Buffer) => chunks.push(chunk));
      source.on("end", () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
    const original = filesFrom(response.body);
    await writeZipContents(original);

    const rolePath = "src/main/java/com/example/generated/entities/Rol.java";
    const userPath = "src/main/java/com/example/generated/entities/Usuario.java";
    expect(Object.keys(original)).toEqual(expect.arrayContaining(["build.gradle", "settings.gradle", "src/main/resources/application.properties", rolePath, userPath, "src/main/java/com/example/generated/repositories/RolRepository.java", "src/main/java/com/example/generated/repositories/UsuarioRepository.java", "src/main/java/com/example/generated/services/RolService.java", "src/main/java/com/example/generated/services/UsuarioService.java", "src/main/java/com/example/generated/controllers/RolController.java", "src/main/java/com/example/generated/controllers/UsuarioController.java"]));
    expect(strFromU8(original[rolePath]!)).toContain("private String nombre;");
    expect(strFromU8(original[userPath]!)).toContain("private String email;");
    expect(strFromU8(original[rolePath]!)).toContain('@OneToMany(mappedBy = "rolId")');
    expect(strFromU8(original[userPath]!)).toContain("@ManyToOne");
    expect(strFromU8(original[userPath]!)).toContain('@JoinColumn(name = "rol_id", referencedColumnName = "id", nullable = false)');
    expect(access.requireView).toHaveBeenCalledWith(projectId, userId);

    const layoutChanged = structuredClone(document);
    layoutChanged.layout.elements = [{ elementId: "33333333-3333-4333-8333-333333333333", x: -900, y: 1400 }, { elementId: "44444444-4444-4444-8444-444444444444", x: 1200, y: -600 }];
    await persistence.createProject(userId, "Roles", layoutChanged);
    expect(filesFrom((await exporter.exportProject(projectId, userId, "com.example.generated")).zip)).toEqual(original);

    const changedUml = structuredClone(document);
    changedUml.uml.classes[0]!.attributes.push({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "descripcion", visibility: "private", type: { kind: "primitive", name: "string" } });
    await persistence.createProject(userId, "Roles", changedUml);
    const changed = filesFrom((await exporter.exportProject(projectId, userId, "com.example.generated")).zip);
    expect(strFromU8(changed[rolePath]!)).toContain("private String descripcion;");
    expect(strFromU8(changed[rolePath]!)).not.toEqual(strFromU8(original[rolePath]!));
  });

  it("exporta el shape creado por el workspace sin usar layout como semántica", async () => {
    let stored: Record<string, unknown> | null = null;
    const prisma = {
      project: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = { ...data, id: projectId, revision: 1, createdAt: new Date(), updatedAt: new Date() };
          return stored;
        }),
        findUnique: vi.fn(async () => stored),
      },
    };
    const persistence = new ProjectsPersistenceService(prisma as never);
    const access = { requireView: vi.fn().mockResolvedValue("OWNER") };
    const document = workspaceDocument();
    expect(document.uml.classes.map((item) => item.generationMetadata)).toEqual([undefined, undefined]);
    expect(document.uml.classes.flatMap((item) => item.attributes).map((item) => item.generationMetadata)).toEqual([undefined, undefined, undefined, undefined]);
    await persistence.createProject(userId, "Workspace real", document);

    const module = await Test.createTestingModule({
      controllers: [SpringExportController],
      providers: [SpringExportService, { provide: ProjectsPersistenceService, useValue: persistence }, { provide: ProjectAccessService, useValue: access }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { authenticatedUser?: { id: string } } } }) {
        context.switchToHttp().getRequest().authenticatedUser = { id: userId };
        return true;
      },
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).send({ basePackage: "com.example.workspace" }).buffer(true).parse((source, callback) => {
      const chunks: Buffer[] = [];
      source.on("data", (chunk: Buffer) => chunks.push(chunk));
      source.on("end", () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
    const files = filesFrom(response.body);
    const rolePath = "src/main/java/com/example/workspace/entities/Rol.java";
    const userPath = "src/main/java/com/example/workspace/entities/Usuario.java";
    expect(Object.keys(files)).toEqual(expect.arrayContaining([rolePath, userPath]));
    expect(strFromU8(files[rolePath]!)).toContain('@OneToMany(mappedBy = "rolId")');
    expect(strFromU8(files[userPath]!)).toContain('@JoinColumn(name = "rol_id", referencedColumnName = "id", nullable = false)');
    expect(document.layout.elements).toHaveLength(2);
  });
});
