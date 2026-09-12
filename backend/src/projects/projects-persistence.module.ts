import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectAccessService } from "./project-access.service";
import { InvitationsController } from "./invitations.controller";
import { ProjectInvitationsController } from "./project-invitations.controller";
import { ProjectInvitationsService } from "./project-invitations.service";
import { ProjectsPersistenceService } from "./projects-persistence.service";
import { ProjectsController } from "./projects.controller";

@Module({ imports: [AuthModule], controllers: [ProjectsController, ProjectInvitationsController, InvitationsController], providers: [ProjectAccessService, ProjectInvitationsService, ProjectsPersistenceService], exports: [ProjectAccessService, ProjectInvitationsService, ProjectsPersistenceService] })
export class ProjectsPersistenceModule {}
