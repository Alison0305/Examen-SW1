import "reflect-metadata";
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsPersistenceModule } from "./projects/projects-persistence.module";

@Module({
  imports: [PrismaModule, ProjectsPersistenceModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
