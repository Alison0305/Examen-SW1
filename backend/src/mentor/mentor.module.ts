import { Module } from "@nestjs/common";
import { AssistantModule, ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { QueuedLocalTextModel } from "../assistant/local-text-model";
import { AuthModule } from "../auth/auth.module";
import { MentorInteractionIdentityModule } from "../mentor-identity/mentor-interaction-identity.module";
import { ProjectsPersistenceModule } from "../projects/projects-persistence.module";
import { MentorController } from "./mentor.controller";
import { MentorContextBuilder } from "./mentor-context.builder";
import { MENTOR_AI_PROVIDER, MENTOR_INTERACTION_MEMORY, MENTOR_INTERACTION_RECORDER } from "./mentor.contracts";
import { PrismaMentorInteractionMemory, PrismaMentorInteractionRecorder } from "./mentor-interaction-recorder";
import { LocalQwenMentorProvider } from "./local-qwen-mentor.provider";
import { MentorService } from "./mentor.service";

@Module({
  imports: [AssistantModule, AuthModule, ProjectsPersistenceModule, MentorInteractionIdentityModule],
  controllers: [MentorController],
  providers: [
    MentorContextBuilder,
    MentorService,
    PrismaMentorInteractionRecorder,
    PrismaMentorInteractionMemory,
    { provide: MENTOR_AI_PROVIDER, useFactory: (model: QueuedLocalTextModel | undefined) => new LocalQwenMentorProvider(model), inject: [ASSISTANT_LOCAL_MODEL] },
    { provide: MENTOR_INTERACTION_RECORDER, useExisting: PrismaMentorInteractionRecorder },
    { provide: MENTOR_INTERACTION_MEMORY, useExisting: PrismaMentorInteractionMemory },
  ],
  // CU-2P-08: the project chat answers @mentor mentions through the same query flow (context, memory, recorder).
  exports: [MentorService],
})
export class MentorModule {}
