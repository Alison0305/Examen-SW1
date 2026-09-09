import { IsInt, IsObject, Min } from "class-validator";
import type { ProjectDocument } from "@examen-sw1/uml-core";

export class UpdateProjectDto {
  @IsObject()
  document!: ProjectDocument;

  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
