import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, getBackendPort, getFrontendOrigin } from "./create-app";

describe("backend base application", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    delete process.env.BACKEND_PORT;
    delete process.env.FRONTEND_ORIGIN;
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("uses Fastify as the NestJS HTTP adapter", () => {
    expect(app.getHttpAdapter().getType()).toBe("fastify");
  });

  it("uses CU-00 default environment values", () => {
    expect(getBackendPort()).toBe(3001);
    expect(getFrontendOrigin()).toBe("http://localhost:3000");
  });

  it("responds to GET /health", async () => {
    await request(app.getHttpServer()).get("/health").expect(200).expect({ status: "ok" });
  });

  it("allows the configured frontend origin through CORS", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("Origin", "http://localhost:3000")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
