import { Module } from "@nestjs/common";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { MentorInteractionIdentityResolver } from "./mentor-interaction-identity.resolver";

@Module({ imports: [ProjectsPersistenceModule], providers: [MentorInteractionIdentityResolver], exports: [MentorInteractionIdentityResolver] })
export class MentorInteractionIdentityModule {}
