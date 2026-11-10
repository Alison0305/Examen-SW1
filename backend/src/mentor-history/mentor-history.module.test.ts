import { Module } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantModule, ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { MENTOR_HISTORY_READER } from "./mentor-history.contracts";
import { MentorHistoryController } from "./mentor-history.controller";
import { MentorHistoryModule } from "./mentor-history.module";
import { MentorHistoryService } from "./mentor-history.service";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07, fases 3 y 4: wiring of MentorHistoryModule without a database (PrismaService is replaced by a plain object) and
// without any local model. The services read their dependencies through private fields; the casts below only look.

type Internals = { access: unknown; reader: unknown; prisma: unknown };
const internals = (instance: object) => instance as unknown as Internals;

let opened: TestingModule[] = [];

async function compile(): Promise<TestingModule> {
  const module = await Test.createTestingModule({ imports: [PrismaModule, MentorHistoryModule] })
    .overrideProvider(PrismaService).useValue({ marker: "prisma-unico" })
    .compile();
  opened.push(module);
  return module;
}

beforeEach(() => {
  // ProjectsPersistenceModule imports AuthModule, whose JwtModule reads these variables when it is built.
  vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
  vi.stubEnv("JWT_EXPIRES_IN", "1h");
});

afterEach(async () => {
  for (const module of opened) await module.close();
  opened = [];
  vi.unstubAllEnvs();
});

describe("MentorHistoryModule: wiring", () => {
  it("resuelve MentorHistoryService y MENTOR_HISTORY_READER apunta a la única instancia de PrismaMentorHistoryReader", async () => {
    const module = await compile();
    const service = module.get(MentorHistoryService, { strict: false });
    const reader = module.get(MENTOR_HISTORY_READER, { strict: false });

    expect(service).toBeInstanceOf(MentorHistoryService);
    expect(reader).toBeInstanceOf(PrismaMentorHistoryReader);
    // useExisting: the token and the class are the same object, and that is what the service received.
    expect(reader).toBe(module.get(PrismaMentorHistoryReader, { strict: false }));
    expect(internals(service).reader).toBe(reader);
  });

  it("reutiliza el ProjectAccessService exportado por ProjectsPersistenceModule y el PrismaService global, sin copias", async () => {
    const module = await compile();
    const service = module.get(MentorHistoryService, { strict: false });
    const sharedAccess = module.select(ProjectsPersistenceModule).get(ProjectAccessService);
    const prisma = module.get(PrismaService, { strict: false });

    expect(internals(service).access).toBe(sharedAccess);
    expect(internals(sharedAccess).prisma).toBe(prisma);
    expect(internals(module.get(PrismaMentorHistoryReader, { strict: false })).prisma).toBe(prisma);
    expect(prisma).toEqual({ marker: "prisma-unico" });
  });

  it("declara solo lo necesario: AuthModule y ProjectsPersistenceModule, un controlador, un reader, el puerto y el servicio", () => {
    const imports = Reflect.getMetadata("imports", MentorHistoryModule) as unknown[];
    const providers = Reflect.getMetadata("providers", MentorHistoryModule) as unknown[];

    expect(imports).toEqual([AuthModule, ProjectsPersistenceModule]);
    expect(imports).not.toContain(AssistantModule);
    expect(providers).toEqual([PrismaMentorHistoryReader, { provide: MENTOR_HISTORY_READER, useExisting: PrismaMentorHistoryReader }, MentorHistoryService]);
    expect(Reflect.getMetadata("controllers", MentorHistoryModule)).toEqual([MentorHistoryController]);
  });

  it("resuelve el controlador y su JwtAuthGuard dentro del módulo (AuthModule es necesario: ProjectsPersistenceModule no lo reexporta)", async () => {
    const module = await compile();

    expect(module.get(MentorHistoryController, { strict: false })).toBeInstanceOf(MentorHistoryController);
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await expect(app.init()).resolves.toBe(app);
    await app.close();
  });

  it("sin AuthModule el grafo no compila: JwtAuthGuard no encuentra JwtService", async () => {
    @Module({ imports: [ProjectsPersistenceModule], controllers: [MentorHistoryController], providers: [PrismaMentorHistoryReader, { provide: MENTOR_HISTORY_READER, useExisting: PrismaMentorHistoryReader }, MentorHistoryService] })
    class WithoutAuthModule {}

    await expect(Test.createTestingModule({ imports: [PrismaModule, WithoutAuthModule] }).overrideProvider(PrismaService).useValue({}).compile()).rejects.toThrow(/JwtAuthGuard/);
  });

  it("compila sin ASSISTANT_MODEL_PATH y el modelo local no forma parte de su grafo", async () => {
    vi.stubEnv("ASSISTANT_MODEL_PATH", undefined);
    const module = await compile();

    expect(module.get(MentorHistoryService, { strict: false })).toBeInstanceOf(MentorHistoryService);
    expect(() => module.get(ASSISTANT_LOCAL_MODEL, { strict: false })).toThrow();
    expect(() => module.select(AssistantModule)).toThrow();
  });
});
