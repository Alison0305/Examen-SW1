import "reflect-metadata";
import { createApp, getBackendPort } from "./create-app";

async function bootstrap() {
  const app = await createApp();
  await app.listen(getBackendPort(), "0.0.0.0");
}

void bootstrap();
