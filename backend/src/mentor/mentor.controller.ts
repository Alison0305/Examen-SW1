import { Body, Controller, Inject, Logger, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { DtoValidationPipe } from "../auth/dto/dto-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MentorQueryDto } from "./dto/mentor-query.dto";
import { MentorRecommendationDto } from "./dto/mentor-recommendation.dto";
import type { MentorQueryResponse, MentorRecommendationResponse } from "./mentor.contracts";
import { MentorService } from "./mentor.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class MentorController {
  private readonly logger = new Logger(MentorController.name);

  constructor(@Inject(MentorService) private readonly mentor: MentorService) {}

  @Post(":id/mentor/query")
  query(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Body(new DtoValidationPipe(MentorQueryDto)) dto: MentorQueryDto): Promise<MentorQueryResponse> {
    const authenticatedUser = request.authenticatedUser;
    if (!authenticatedUser) throw new NotFoundException();
    return this.mentor.query(projectId, authenticatedUser, dto.question);
  }

  @Post(":id/mentor/recommendations")
  recommendations(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Body(new DtoValidationPipe(MentorRecommendationDto)) dto: MentorRecommendationDto): Promise<MentorRecommendationResponse> {
    const authenticatedUser = request.authenticatedUser;
    if (!authenticatedUser) throw new NotFoundException();
    this.logger.log("recommendation:controller-entered");
    return this.mentor.recommend(projectId, authenticatedUser, dto);
  }
}
