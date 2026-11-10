import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { MENTOR_HISTORY_READER } from "./mentor-history.contracts";
import { MentorHistoryController } from "./mentor-history.controller";
import { MentorHistoryService } from "./mentor-history.service";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07. AuthModule is imported because MentorHistoryController uses JwtAuthGuard, which needs JwtService and
// AuthService in this module's scope: ProjectsPersistenceModule imports AuthModule but does not re-export it, so
// without this import Nest fails with "can't resolve dependencies of the JwtAuthGuard" (verified in fase 4; same
// pattern as MentorModule and MentorAnalysisModule). ProjectsPersistenceModule provides the shared
// ProjectAccessService (requireView); PrismaService comes from the global PrismaModule. AssistantModule is
// deliberately not imported: the history never touches the local model.
@Module({
  imports: [AuthModule, ProjectsPersistenceModule],
  controllers: [MentorHistoryController],
  providers: [
    PrismaMentorHistoryReader,
    { provide: MENTOR_HISTORY_READER, useExisting: PrismaMentorHistoryReader },
    MentorHistoryService,
  ],
})
export class MentorHistoryModule {}
