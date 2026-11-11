import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { PROJECT_OPERATION_BROADCASTER } from "./project-operation-broadcaster";
import { ProjectRealtimeGateway } from "./project-realtime.gateway";
import { ProjectOperationService } from "./project-operation.service";

@Module({
  imports: [AuthModule, ProjectsPersistenceModule],
  providers: [ProjectRealtimeGateway, ProjectOperationService, { provide: PROJECT_OPERATION_BROADCASTER, useExisting: ProjectRealtimeGateway }],
  // Exported for CU-2P-06: confirmed proposals are applied through the same authoritative operation path and room.
  exports: [ProjectOperationService, PROJECT_OPERATION_BROADCASTER],
})
export class RealtimeModule {}
