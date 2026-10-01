import { Controller, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FrontendExportService } from "./frontend-export.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class FrontendExportController {
  constructor(@Inject(FrontendExportService) private readonly exports: FrontendExportService) {}
  @Post(":id/exports/frontend")
  async export(@Req() request: AuthenticatedRequest, @Res() response: FastifyReply, @Param("id", new ParseUUIDPipe()) projectId: string): Promise<void> { const userId = request.authenticatedUser?.id; if (!userId) throw new NotFoundException(); const { zip } = await this.exports.exportProject(projectId, userId); response.code(200).header("Content-Type", "application/zip").header("Content-Disposition", "attachment; filename=\"frontend.zip\"").send(zip); }
}
