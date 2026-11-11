import { Body, Controller, Get, HttpCode, HttpStatus, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { DtoValidationPipe } from "../auth/dto/dto-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateMentorProposalDto } from "./dto/create-mentor-proposal.dto";
import type { MentorProposalResponse } from "./mentor-proposal.contracts";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { MentorProposalCreationService } from "./mentor-proposal-creation.service";
import { toMentorProposalHttpException, toSafeMentorProposalError } from "./mentor-proposal-http-errors";
import { MentorProposalQueryService } from "./mentor-proposal-query.service";
import { MentorProposalRejectionService } from "./mentor-proposal-rejection.service";
import { toMentorProposalResponse } from "./mentor-proposal-response";

// CU-2P-06 lifecycle API. Identity comes only from the JWT; apply and reject read no body at all, so command,
// baseRevision, status or user ids sent by a client can never reach the operation. Every route uses requireEdit
// inside its service before revealing whether a proposal exists. Creation (phase 7) reads only `instruction`; the
// operation, command, ids and base revision are decided by the server.
@Controller("projects")
@UseGuards(JwtAuthGuard)
export class MentorProposalController {
  constructor(
    @Inject(MentorProposalQueryService) private readonly query: MentorProposalQueryService,
    @Inject(MentorProposalApplicationService) private readonly application: MentorProposalApplicationService,
    @Inject(MentorProposalRejectionService) private readonly rejection: MentorProposalRejectionService,
    @Inject(MentorProposalCreationService) private readonly creation: MentorProposalCreationService,
  ) {}

  // 201 with the PENDING proposal. The project is not modified: applying it is the separate apply route.
  @Post(":projectId/mentor/proposals")
  async create(@Req() request: AuthenticatedRequest, @Param("projectId", new ParseUUIDPipe()) projectId: string, @Body(new DtoValidationPipe(CreateMentorProposalDto)) dto: CreateMentorProposalDto): Promise<MentorProposalResponse> {
    const user = authenticated(request);
    let result;
    try {
      result = await this.creation.create(projectId, user, dto.instruction);
    } catch (error) {
      throw toSafeMentorProposalError(error);
    }
    if (!result.ok) throw toMentorProposalHttpException(creationFailureCode(result.error.code), result.error.diagnostics);
    return toMentorProposalResponse(result.proposal, result.currentRevision);
  }

  @Get(":projectId/mentor/proposals/:proposalId")
  async detail(@Req() request: AuthenticatedRequest, @Param("projectId", new ParseUUIDPipe()) projectId: string, @Param("proposalId", new ParseUUIDPipe()) proposalId: string): Promise<MentorProposalResponse> {
    const user = authenticated(request);
    try {
      const response = await this.query.get(projectId, proposalId, user);
      if (!response) throw new NotFoundException();
      return response;
    } catch (error) {
      throw toSafeMentorProposalError(error);
    }
  }

  @Post(":projectId/mentor/proposals/:proposalId/apply")
  @HttpCode(HttpStatus.OK)
  async apply(@Req() request: AuthenticatedRequest, @Param("projectId", new ParseUUIDPipe()) projectId: string, @Param("proposalId", new ParseUUIDPipe()) proposalId: string): Promise<MentorProposalResponse> {
    const user = authenticated(request);
    let result;
    try {
      result = await this.application.apply(projectId, proposalId, user);
    } catch (error) {
      throw toSafeMentorProposalError(error);
    }
    if (!result.ok) throw toMentorProposalHttpException(result.code, result.diagnostics);
    return toMentorProposalResponse(result.proposal);
  }

  @Post(":projectId/mentor/proposals/:proposalId/reject")
  @HttpCode(HttpStatus.OK)
  async reject(@Req() request: AuthenticatedRequest, @Param("projectId", new ParseUUIDPipe()) projectId: string, @Param("proposalId", new ParseUUIDPipe()) proposalId: string): Promise<MentorProposalResponse> {
    const user = authenticated(request);
    let result;
    try {
      result = await this.rejection.reject(projectId, proposalId, user);
    } catch (error) {
      throw toSafeMentorProposalError(error);
    }
    if (!result.ok) throw toMentorProposalHttpException(result.code);
    return toMentorProposalResponse(result.proposal);
  }
}

// The creation flow (intent validation, resolver, preview, builder) only returns these four codes; all are 422.
// Anything else would be a programming error and is reported as the generic INVALID_PROPOSAL.
const CREATION_FAILURE_CODES = ["INVALID_PROPOSAL", "UNSUPPORTED_OPERATION", "ELEMENT_NOT_FOUND", "UNKNOWN_TYPE"] as const;
function creationFailureCode(code: string): (typeof CREATION_FAILURE_CODES)[number] {
  return (CREATION_FAILURE_CODES as readonly string[]).includes(code) ? (code as (typeof CREATION_FAILURE_CODES)[number]) : "INVALID_PROPOSAL";
}

function authenticated(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.authenticatedUser) throw new NotFoundException();
  return request.authenticatedUser;
}
