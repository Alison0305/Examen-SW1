import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { ProjectRealtimeGateway } from "./project-realtime.gateway";
import { ProjectOperationService } from "./project-operation.service";

@Module({
  imports: [AuthModule, ProjectsPersistenceModule],
  providers: [ProjectRealtimeGateway, ProjectOperationService],
})
export class RealtimeModule {}
