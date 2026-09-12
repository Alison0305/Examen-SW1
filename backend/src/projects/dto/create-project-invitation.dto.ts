import { IsEmail, IsEnum } from "class-validator";
import { Transform } from "class-transformer";
import { ProjectMemberRole } from "@prisma/client";

export class CreateProjectInvitationDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsEmail()
  email!: string;

  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole;
}
