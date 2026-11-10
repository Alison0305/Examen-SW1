import { Module } from "@nestjs/common";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { MENTOR_PROPOSAL_STORE } from "./mentor-proposal-store";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

// CU-2P-06. No controller yet: the HTTP API is added in phase 6, together with its registration in AppModule.
@Module({
  imports: [ProjectsPersistenceModule, RealtimeModule],
  providers: [{ provide: MENTOR_PROPOSAL_STORE, useClass: PrismaMentorProposalStore }, MentorProposalApplicationService],
  exports: [MentorProposalApplicationService, MENTOR_PROPOSAL_STORE],
})
export class MentorProposalsModule {}
