import { Inject, Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { getAssistantConfig } from "./assistant.config";
import { AssistantInterpretController } from "./assistant-interpret.controller";
import { AssistantInterpreterService } from "./assistant-interpreter.service";
import { QueuedLocalTextModel } from "./local-text-model";
import { NodeLlamaCppEngine } from "./node-llama-cpp-engine";

export const ASSISTANT_LOCAL_MODEL = Symbol("ASSISTANT_LOCAL_MODEL");

function createLocalModel(): QueuedLocalTextModel | undefined {
  const config = getAssistantConfig();
  if (!config.modelPath) return undefined;
  const engine = new NodeLlamaCppEngine({ modelPath: config.modelPath, gpu: config.gpu, contextSize: config.contextSize, maxTokens: config.maxTokens });
  return new QueuedLocalTextModel(engine, { timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });
}

@Module({
  controllers: [AssistantInterpretController],
  providers: [
    { provide: ASSISTANT_LOCAL_MODEL, useFactory: createLocalModel },
    { provide: AssistantInterpreterService, useFactory: (model: QueuedLocalTextModel | undefined) => new AssistantInterpreterService(model), inject: [ASSISTANT_LOCAL_MODEL] },
  ],
})
export class AssistantModule implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(ASSISTANT_LOCAL_MODEL) private readonly model: QueuedLocalTextModel | undefined) {}

  onModuleInit(): void {
    // Optional preload; a failure is reported on the first interpretation instead of blocking startup.
    if (this.model && getAssistantConfig().preload) void this.model.warmup().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.model?.dispose();
  }
}
