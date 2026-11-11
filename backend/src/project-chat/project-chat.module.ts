import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MentorModule } from "../mentor/mentor.module";
import { MentorService } from "../mentor/mentor.service";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PROJECT_CHAT_MENTOR, PROJECT_CHAT_STORE } from "./project-chat.contracts";
import { ProjectChatController } from "./project-chat.controller";
import { ProjectChatService } from "./project-chat.service";
import { PrismaProjectChatStore } from "./prisma-project-chat.store";

// CU-2P-08. AuthModule for JwtAuthGuard; ProjectsPersistenceModule for requireView; RealtimeModule for the project
// room (PROJECT_CHAT_BROADCASTER is the existing gateway); MentorModule for the existing MentorService (Nest modules are
// singletons: the same service, memory, recorder and single shared local model; no second model is created).
@Module({
  imports: [AuthModule, ProjectsPersistenceModule, RealtimeModule, MentorModule],
  controllers: [ProjectChatController],
  providers: [
    { provide: PROJECT_CHAT_STORE, useClass: PrismaProjectChatStore },
    { provide: PROJECT_CHAT_MENTOR, useExisting: MentorService },
    ProjectChatService,
  ],
})
export class ProjectChatModule {}
