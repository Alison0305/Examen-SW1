import { IsString, MaxLength, MinLength } from "class-validator";

export class MentorQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;
}
