import type { UmlImportProposal } from "@examen-sw1/uml-core";
import type { ProjectAccessService } from "../projects/project-access.service";
import { analyzeDiagram } from "./diagram-analyzer";
import { detectImageFormat, preprocessImage } from "./image-preprocessing";
import type { QueuedOcrEngine } from "./ocr-engine";
import type { VisionConfig } from "./vision.config";
import { VisionError } from "./vision-errors";

export type VisionProposalResponse = Readonly<{
  ok: true;
  proposal: UmlImportProposal;
  image: Readonly<{ width: number; height: number }>;
  ocrLines: number;
  elapsedMs: number;
}>;

// Image → proposal only: nothing is applied to the project and the image is never stored.
export class VisionProposalService {
  constructor(
    private readonly access: Pick<ProjectAccessService, "requireEdit">,
    private readonly ocr: Pick<QueuedOcrEngine, "recognize"> | undefined,
    private readonly config: VisionConfig,
  ) {}

  async propose(projectId: string, userId: string, body: unknown): Promise<VisionProposalResponse> {
    await this.access.requireEdit(projectId, userId);
    // Input checks run before the model is touched.
    if (!Buffer.isBuffer(body) || body.length === 0) throw new VisionError("INVALID_FORMAT");
    if (body.length > this.config.maxBytes) throw new VisionError("TOO_LARGE");
    if (!detectImageFormat(body)) throw new VisionError("INVALID_FORMAT");
    if (!this.ocr) throw new VisionError("NOT_CONFIGURED");
    const started = performance.now();
    const image = await preprocessImage(body, { maxSide: this.config.maxSide, maxInputPixels: this.config.maxInputPixels, minSide: this.config.minSide });
    const lines = await this.ocr.recognize(image);
    const proposal = analyzeDiagram(image, lines);
    return { ok: true, proposal, image: { width: image.width, height: image.height }, ocrLines: lines.length, elapsedMs: Math.round(performance.now() - started) };
  }
}
