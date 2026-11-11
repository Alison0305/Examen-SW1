import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MentorProposalsModule } from "../mentor-proposals/mentor-proposals.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { MENTOR_HISTORY_READER } from "./mentor-history.contracts";
import { MentorHistoryController } from "./mentor-history.controller";
import { MentorHistoryProposalsService } from "./mentor-history-proposals.service";
import { MentorHistoryService } from "./mentor-history.service";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07. AuthModule is imported because MentorHistoryController uses JwtAuthGuard, which needs JwtService and
// AuthService in this module's scope: ProjectsPersistenceModule imports AuthModule but does not re-export it, so
// without this import Nest fails with "can't resolve dependencies of the JwtAuthGuard" (verified in fase 4; same
// pattern as MentorModule and MentorAnalysisModule). ProjectsPersistenceModule provides the shared
// ProjectAccessService (requireView); PrismaService comes from the global PrismaModule.
// MentorProposalsModule (task 8.1) provides MentorProposalHistoryService, CU-2P-06's read entry point for proposals.
// Nest modules are singletons, so this reuses the same instances the application already has (no second store or
// model). It brings AssistantModule into the graph transitively, but reading the history never uses the local model:
// it works without ASSISTANT_MODEL_PATH (the model is then undefined) and never calls it. AssistantModule itself is
// not imported here.
@Module({
  imports: [AuthModule, ProjectsPersistenceModule, MentorProposalsModule],
  controllers: [MentorHistoryController],
  providers: [
    PrismaMentorHistoryReader,
    { provide: MENTOR_HISTORY_READER, useExisting: PrismaMentorHistoryReader },
    MentorHistoryService,
    MentorHistoryProposalsService,
  ],
})
export class MentorHistoryModule {}
