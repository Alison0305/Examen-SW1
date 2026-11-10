import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { MentorProposalController } from "./mentor-proposal.controller";
import { MentorProposalQueryService } from "./mentor-proposal-query.service";
import { MentorProposalRejectionService } from "./mentor-proposal-rejection.service";
import { MENTOR_PROPOSAL_STORE } from "./mentor-proposal-store";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

// CU-2P-06. AuthModule provides what JwtAuthGuard needs. No proposal generation provider yet (phase 7).
@Module({
  imports: [AuthModule, ProjectsPersistenceModule, RealtimeModule],
  controllers: [MentorProposalController],
  providers: [{ provide: MENTOR_PROPOSAL_STORE, useClass: PrismaMentorProposalStore }, MentorProposalApplicationService, MentorProposalRejectionService, MentorProposalQueryService],
  exports: [MentorProposalApplicationService, MENTOR_PROPOSAL_STORE],
})
export class MentorProposalsModule {}
