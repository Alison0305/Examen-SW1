import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantModule, ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PROJECT_OPERATION_BROADCASTER } from "../realtime/project-operation-broadcaster";
import { ProjectOperationService } from "../realtime/project-operation.service";
import { ProjectRealtimeGateway } from "../realtime/project-realtime.gateway";
import { LocalQwenMentorProposalIntentProvider, MENTOR_PROPOSAL_INTENT_GENERATOR } from "./local-qwen-mentor-proposal-intent.provider";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { MentorProposalCreationService } from "./mentor-proposal-creation.service";
import { MENTOR_PROPOSAL_STORE } from "./mentor-proposal-store";
import { MentorProposalsModule } from "./mentor-proposals.module";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

describe("MentorProposalsModule", () => {
  beforeEach(() => {
    // AuthModule (imported by RealtimeModule) registers JwtModule from these variables; no token is verified here.
    vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
    vi.stubEnv("JWT_EXPIRES_IN", "1h");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resuelve el servicio de aplicación con el ProjectOperationService y el gateway reales del RealtimeModule", async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule, MentorProposalsModule] })
      .overrideProvider(PrismaService).useValue({})
      .compile();

    expect(module.get(MentorProposalApplicationService)).toBeInstanceOf(MentorProposalApplicationService);
    expect(module.get(MENTOR_PROPOSAL_STORE)).toBeInstanceOf(PrismaMentorProposalStore);
    // The broadcaster is the gateway itself (useExisting): one emission path, no second socket server.
    expect(module.get(PROJECT_OPERATION_BROADCASTER, { strict: false })).toBe(module.get(ProjectRealtimeGateway, { strict: false }));
    expect(module.get(ProjectOperationService, { strict: false })).toBeInstanceOf(ProjectOperationService);
    await module.close();
  });

  it("fase 7: el servicio de creación usa el proveedor Qwen sobre el único ASSISTANT_LOCAL_MODEL compartido", async () => {
    const sharedModel = { generateStructured: vi.fn(), warmup: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    let created = 0;
    const module = await Test.createTestingModule({ imports: [PrismaModule, MentorProposalsModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(ASSISTANT_LOCAL_MODEL).useFactory({ factory: () => { created += 1; return sharedModel; } })
      .compile();

    expect(Reflect.getMetadata("imports", MentorProposalsModule)).toContain(AssistantModule);
    expect(module.get(MentorProposalCreationService)).toBeInstanceOf(MentorProposalCreationService);
    const generator = module.get(MENTOR_PROPOSAL_INTENT_GENERATOR);
    expect(generator).toBeInstanceOf(LocalQwenMentorProposalIntentProvider);
    expect((generator as unknown as { model: unknown }).model).toBe(sharedModel);
    expect(module.select(AssistantModule).get(ASSISTANT_LOCAL_MODEL)).toBe(sharedModel);
    expect(created).toBe(1);
    await module.close();
  });
});
