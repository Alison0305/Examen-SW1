import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectAccessService } from "./project-access.service";
import { ProjectAccessInvalidationService } from "./project-access-invalidation.service";
import { InvitationsController } from "./invitations.controller";
import { ProjectInvitationsController } from "./project-invitations.controller";
import { ProjectInvitationsService } from "./project-invitations.service";
import { ProjectsPersistenceService } from "./projects-persistence.service";
import { ProjectsController } from "./projects.controller";
import { SpringExportController } from "./spring-export.controller";
import { SpringExportService } from "./spring-export.service";

@Module({ imports: [AuthModule], controllers: [ProjectsController, ProjectInvitationsController, InvitationsController, SpringExportController], providers: [ProjectAccessService, ProjectAccessInvalidationService, ProjectInvitationsService, ProjectsPersistenceService, SpringExportService], exports: [ProjectAccessService, ProjectAccessInvalidationService, ProjectInvitationsService, ProjectsPersistenceService] })
export class ProjectsPersistenceModule {}
