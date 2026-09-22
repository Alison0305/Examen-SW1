import { Body, Controller, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DtoValidationPipe } from "../auth/dto/dto-validation.pipe";
import { ExportSpringDto } from "./dto/export-spring.dto";
import { SpringExportService } from "./spring-export.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class SpringExportController {
  constructor(@Inject(SpringExportService) private readonly exports: SpringExportService) {}

  @Post(":id/exports/spring")
  async export(@Req() request: AuthenticatedRequest, @Res() response: FastifyReply, @Param("id", new ParseUUIDPipe()) projectId: string, @Body(new DtoValidationPipe(ExportSpringDto)) dto: ExportSpringDto): Promise<void> {
    const userId = request.authenticatedUser?.id;
    if (!userId) throw new NotFoundException();
    const { zip } = await this.exports.exportProject(projectId, userId, dto.basePackage);
    response.code(200).header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="spring-backend-${projectId}.zip"`).send(zip);
  }
}
