import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceService } from "./projects-persistence.service";
import { ProjectsController } from "./projects.controller";

@Module({ imports: [AuthModule], controllers: [ProjectsController], providers: [ProjectsPersistenceService], exports: [ProjectsPersistenceService] })
export class ProjectsPersistenceModule {}
