import { IsOptional, IsString, Matches } from "class-validator";

const basePackage = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

export class ExportSpringDto {
  @IsOptional()
  @IsString()
  @Matches(basePackage)
  basePackage?: string;
}
