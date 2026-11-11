import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MentorModule } from "../mentor/mentor.module";
import { MentorService } from "../mentor/mentor.service";
import { MentorProposalCreationService } from "../mentor-proposals/mentor-proposal-creation.service";
import { MentorProposalsModule } from "../mentor-proposals/mentor-proposals.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PROJECT_CHAT_MENTOR, PROJECT_CHAT_PROPOSALS, PROJECT_CHAT_STORE } from "./project-chat.contracts";
import { ProjectChatController } from "./project-chat.controller";
import { ProjectChatService } from "./project-chat.service";
import { PrismaProjectChatStore } from "./prisma-project-chat.store";

// CU-2P-08. AuthModule for JwtAuthGuard; ProjectsPersistenceModule for requireView/requireEdit; RealtimeModule for the
// project room (PROJECT_CHAT_BROADCASTER is the existing gateway); MentorModule for the existing MentorService (query and
// recommendation) and MentorProposalsModule for the existing proposal creation. Nest modules are singletons: the same
// services, memory, recorder and single shared local model; no second model is created.
@Module({
  imports: [AuthModule, ProjectsPersistenceModule, RealtimeModule, MentorModule, MentorProposalsModule],
  controllers: [ProjectChatController],
  providers: [
    { provide: PROJECT_CHAT_STORE, useClass: PrismaProjectChatStore },
    { provide: PROJECT_CHAT_MENTOR, useExisting: MentorService },
    { provide: PROJECT_CHAT_PROPOSALS, useExisting: MentorProposalCreationService },
    ProjectChatService,
  ],
})
export class ProjectChatModule {}
