import { IsObject } from "class-validator";
import type { ProjectDocument } from "@examen-sw1/uml-core";

export class CreateProjectDto {
  @IsObject()
  document!: ProjectDocument;
}
