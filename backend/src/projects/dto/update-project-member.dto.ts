import { IsEnum } from "class-validator";
import { ProjectMemberRole } from "@prisma/client";

export class UpdateProjectMemberDto {
  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole;
}
