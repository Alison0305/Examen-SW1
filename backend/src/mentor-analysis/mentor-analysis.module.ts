import { Module } from "@nestjs/common";
import { AssistantModule, ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { LocalModelError, type QueuedLocalTextModel } from "../assistant/local-text-model";
import { AuthModule } from "../auth/auth.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { LocalQwenUmlAnalysisProvider } from "./local-qwen-uml-analysis.provider";
import { UML_ANALYSIS_AI_PROVIDER, type UmlAnalysisAiProvider, type UmlAnalysisTextGenerator } from "./uml-analysis-ai.contracts";
import { UmlAnalysisController } from "./uml-analysis.controller";
import { UmlAnalysisService } from "./uml-analysis.service";

// ASSISTANT_LOCAL_MODEL is undefined when ASSISTANT_MODEL_PATH is not configured. The analysis then fails the same
// way the shared queue does for an engine without text generation (NOT_CONFIGURED), which the service turns into
// the usual 503. No second model is created.
const unconfiguredLocalModel: UmlAnalysisTextGenerator = {
  generateText: () => Promise.reject(new LocalModelError("NOT_CONFIGURED")),
};

// The shared QueuedLocalTextModel satisfies UmlAnalysisTextGenerator structurally and is passed as is.
export function createUmlAnalysisAiProvider(model: QueuedLocalTextModel | undefined): UmlAnalysisAiProvider {
  return new LocalQwenUmlAnalysisProvider(model ?? unconfiguredLocalModel);
}

// CU-2P-04. It shares AssistantModule (the single local model and its queue) with CU-2P-01 and CU-08, not the
// mentor contract: MentorModule is not imported.
@Module({
  imports: [AssistantModule, AuthModule, ProjectsPersistenceModule],
  controllers: [UmlAnalysisController],
  providers: [
    UmlAnalysisService,
    { provide: UML_ANALYSIS_AI_PROVIDER, useFactory: createUmlAnalysisAiProvider, inject: [ASSISTANT_LOCAL_MODEL] },
  ],
})
export class MentorAnalysisModule {}
