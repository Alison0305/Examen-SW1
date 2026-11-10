import { Body, Controller, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { toUmlAnalysisFocus, UmlAnalysisBodyPipe, type UmlAnalysisDto } from "./dto/uml-analysis.dto";
import { UmlAnalysisService, type UmlAnalysisResponse } from "./uml-analysis.service";

// CU-2P-04: HTTP transport only. Authorization (requireView), project loading, analysis and the AI call all live in
// UmlAnalysisService; its exceptions (404, 422, 503) propagate unchanged.
@Controller("projects")
@UseGuards(JwtAuthGuard)
export class UmlAnalysisController {
  constructor(@Inject(UmlAnalysisService) private readonly analysis: UmlAnalysisService) {}

  // 200 like the other read-only AI actions (POST /assistant/interpret, POST /projects/:id/vision/uml-proposal):
  // the analysis creates nothing.
  @Post(":id/mentor/analysis")
  @HttpCode(200)
  analyze(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Body(new UmlAnalysisBodyPipe()) dto: UmlAnalysisDto): Promise<UmlAnalysisResponse> {
    // The user always comes from the verified token, never from the body.
    const userId = request.authenticatedUser?.id;
    if (!userId) throw new NotFoundException();
    return this.analysis.analyze(projectId, userId, toUmlAnalysisFocus(dto));
  }
}
