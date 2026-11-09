import { Body, Controller, HttpCode, HttpException, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { VisionProposalService, type VisionProposalResponse } from "./vision-proposal.service";
import { VISION_ERROR_STATUS, VisionError } from "./vision-errors";

// The image travels as the raw request body (Content-Type image/png, image/jpeg or application/octet-stream).
// The parser accepts up to twice the configured limit so the service can answer TOO_LARGE as a structured diagnostic.
export function registerImageBodyParser(app: NestFastifyApplication, maxBytes: number) {
  const fastify = app.getHttpAdapter().getInstance();
  if (fastify.hasContentTypeParser("application/octet-stream")) return;
  const options = { parseAs: "buffer" as const, bodyLimit: maxBytes * 2 };
  const passThrough = (_request: unknown, body: string | Buffer, done: (error: Error | null, body?: unknown) => void) => done(null, body);
  fastify.addContentTypeParser(/^image\/[\w.+-]+$/, options, passThrough);
  fastify.addContentTypeParser("application/octet-stream", options, passThrough);
}

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class VisionController {
  constructor(@Inject(VisionProposalService) private readonly vision: VisionProposalService) {}

  @Post(":id/vision/uml-proposal")
  @HttpCode(200)
  async propose(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Body() body: unknown): Promise<VisionProposalResponse> {
    const userId = request.authenticatedUser?.id;
    if (!userId) throw new NotFoundException();
    try {
      return await this.vision.propose(projectId, userId, body);
    } catch (error) {
      if (error instanceof VisionError) throw new HttpException({ ok: false, diagnostic: { code: error.code, message: error.message } }, VISION_ERROR_STATUS[error.code]);
      throw error;
    }
  }
}
