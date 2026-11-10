import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class MentorRecommendationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  focus?: string;
}
