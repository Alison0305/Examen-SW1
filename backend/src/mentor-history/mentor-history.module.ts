import { Module } from "@nestjs/common";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { MENTOR_HISTORY_READER } from "./mentor-history.contracts";
import { MentorHistoryService } from "./mentor-history.service";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07. ProjectsPersistenceModule is imported only because it exports the shared ProjectAccessService
// (requireView); PrismaService comes from the global PrismaModule. AssistantModule is deliberately not imported: the
// history never touches the local model. The controller (and its JWT guard) arrives in fase 4, and so does the
// registration in AppModule.
@Module({
  imports: [ProjectsPersistenceModule],
  providers: [
    PrismaMentorHistoryReader,
    { provide: MENTOR_HISTORY_READER, useExisting: PrismaMentorHistoryReader },
    MentorHistoryService,
  ],
})
export class MentorHistoryModule {}
