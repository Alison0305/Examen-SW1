import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";
import { MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH, type CreateMentorProposalRequest } from "../mentor-proposal.contracts";

// Body of POST /projects/:projectId/mentor/proposals. Only `instruction`: with DtoValidationPipe (whitelist +
// forbidNonWhitelisted) any other property — command, operation, baseRevision, classId, attributeId, status, … — is a
// 400. The value is trimmed before validation, so a blank instruction is rejected too.
export class CreateMentorProposalDto implements CreateMentorProposalRequest {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH)
  instruction!: string;
}
