import "reflect-metadata";
import { existsSync } from "node:fs";
import { createApp, getBackendPort } from "./create-app";

async function bootstrap() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const app = await createApp();
  await app.listen(getBackendPort(), "0.0.0.0");
}

void bootstrap();
