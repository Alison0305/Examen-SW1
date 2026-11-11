import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { PROJECT_CHAT_BROADCASTER } from "./project-chat-broadcaster";
import { PROJECT_OPERATION_BROADCASTER } from "./project-operation-broadcaster";
import { ProjectRealtimeGateway } from "./project-realtime.gateway";
import { ProjectOperationService } from "./project-operation.service";

@Module({
  imports: [AuthModule, ProjectsPersistenceModule],
  providers: [
    ProjectRealtimeGateway,
    ProjectOperationService,
    { provide: PROJECT_OPERATION_BROADCASTER, useExisting: ProjectRealtimeGateway },
    { provide: PROJECT_CHAT_BROADCASTER, useExisting: ProjectRealtimeGateway },
  ],
  // Exported for CU-2P-06: confirmed proposals are applied through the same authoritative operation path and room.
  // Exported for CU-2P-08: the project chat is delivered through the same room.
  exports: [ProjectOperationService, PROJECT_OPERATION_BROADCASTER, PROJECT_CHAT_BROADCASTER],
})
export class RealtimeModule {}
