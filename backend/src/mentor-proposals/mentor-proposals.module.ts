import { Module } from "@nestjs/common";
import { AssistantModule, ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import type { QueuedLocalTextModel } from "../assistant/local-text-model";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { LocalQwenMentorProposalIntentProvider, MENTOR_PROPOSAL_INTENT_GENERATOR } from "./local-qwen-mentor-proposal-intent.provider";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { MentorProposalCreationService } from "./mentor-proposal-creation.service";
import { MentorProposalHistoryService } from "./mentor-proposal-history.service";
import { MentorProposalController } from "./mentor-proposal.controller";
import { MentorProposalQueryService } from "./mentor-proposal-query.service";
import { MentorProposalRejectionService } from "./mentor-proposal-rejection.service";
import { MENTOR_PROPOSAL_HISTORY_STORE, MENTOR_PROPOSAL_STORE } from "./mentor-proposal-store";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

// CU-2P-06. AuthModule provides what JwtAuthGuard needs. AssistantModule provides the single shared local model
// (ASSISTANT_LOCAL_MODEL, undefined without ASSISTANT_MODEL_PATH); no second model is created here.
@Module({
  imports: [AssistantModule, AuthModule, ProjectsPersistenceModule, RealtimeModule],
  controllers: [MentorProposalController],
  providers: [
    { provide: MENTOR_PROPOSAL_STORE, useClass: PrismaMentorProposalStore },
    // Same Prisma store instance, read side only (task 11.1).
    { provide: MENTOR_PROPOSAL_HISTORY_STORE, useExisting: MENTOR_PROPOSAL_STORE },
    { provide: MENTOR_PROPOSAL_INTENT_GENERATOR, useFactory: (model: QueuedLocalTextModel | undefined) => new LocalQwenMentorProposalIntentProvider(model), inject: [ASSISTANT_LOCAL_MODEL] },
    MentorProposalApplicationService,
    MentorProposalRejectionService,
    MentorProposalQueryService,
    MentorProposalCreationService,
    MentorProposalHistoryService,
  ],
  // MentorProposalHistoryService is the read entry point prepared for CU-2P-07. MentorProposalCreationService is used by
  // the CU-2P-08 chat to create PENDING proposals through the same flow (requireEdit, Qwen intent, resolver, preview).
  exports: [MentorProposalApplicationService, MENTOR_PROPOSAL_STORE, MentorProposalHistoryService, MentorProposalCreationService],
})
export class MentorProposalsModule {}
