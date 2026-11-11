import "reflect-metadata";
import { Module } from "@nestjs/common";
import { AssistantModule } from "./assistant/assistant.module";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsPersistenceModule } from "./projects/projects-persistence.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SpeechRecognitionController } from "./speech/speech-recognition.controller";
import { MentorModule } from "./mentor/mentor.module";
import { MentorAnalysisModule } from "./mentor-analysis/mentor-analysis.module";
import { MentorHistoryModule } from "./mentor-history/mentor-history.module";
import { MentorProposalsModule } from "./mentor-proposals/mentor-proposals.module";
import { VisionModule } from "./vision/vision.module";

@Module({
  imports: [PrismaModule, ProjectsPersistenceModule, AuthModule, RealtimeModule, AssistantModule, VisionModule, MentorModule, MentorAnalysisModule, MentorProposalsModule, MentorHistoryModule],
  controllers: [HealthController, SpeechRecognitionController],
})
export class AppModule {}
