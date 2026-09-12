import { IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";
import type { ProjectDocument } from "@examen-sw1/uml-core";

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsObject()
  document!: ProjectDocument;
}
