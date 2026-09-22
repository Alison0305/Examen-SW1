import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

export const DEFAULT_BACKEND_PORT = 3001;
export const DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000";

export function getBackendPort() {
  const configuredPort = Number.parseInt(process.env.BACKEND_PORT ?? "", 10);
  return Number.isNaN(configuredPort) ? DEFAULT_BACKEND_PORT : configuredPort;
}

export function getFrontendOrigin() {
  return process.env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN;
}

export function getAllowedOrigins() {
  return [...new Set([getFrontendOrigin(), "http://localhost", "https://localhost"])];
}

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  app.enableCors({
    origin: getAllowedOrigins(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  return app;
}
