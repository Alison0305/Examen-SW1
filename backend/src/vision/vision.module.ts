import { Inject, Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { Florence2OcrEngine } from "./florence2-ocr-engine";
import { QueuedOcrEngine } from "./ocr-engine";
import { getVisionConfig } from "./vision.config";
import { VisionController } from "./vision.controller";
import { VisionProposalService } from "./vision-proposal.service";

export const VISION_OCR_ENGINE = Symbol("VISION_OCR_ENGINE");

function createOcrEngine(): QueuedOcrEngine | undefined {
  const config = getVisionConfig();
  if (!config.modelPath) return undefined;
  return new QueuedOcrEngine(new Florence2OcrEngine({ modelPath: config.modelPath, dtype: config.dtype, threads: config.threads }), { timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });
}

@Module({
  imports: [AuthModule, ProjectsPersistenceModule],
  controllers: [VisionController],
  providers: [
    { provide: VISION_OCR_ENGINE, useFactory: createOcrEngine },
    { provide: VisionProposalService, useFactory: (access: ProjectAccessService, ocr: QueuedOcrEngine | undefined) => new VisionProposalService(access, ocr, getVisionConfig()), inject: [ProjectAccessService, VISION_OCR_ENGINE] },
  ],
})
export class VisionModule implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(VISION_OCR_ENGINE) private readonly ocr: QueuedOcrEngine | undefined) {}

  onModuleInit(): void {
    // Optional preload; a failure is reported on the first recognition instead of blocking startup.
    if (this.ocr && getVisionConfig().preload) void this.ocr.warmup().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.ocr?.dispose();
  }
}
