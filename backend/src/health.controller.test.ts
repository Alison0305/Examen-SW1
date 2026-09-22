import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, getAllowedOrigins, getBackendPort, getFrontendOrigin } from "./create-app";

describe("backend base application", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    delete process.env.BACKEND_PORT;
    delete process.env.FRONTEND_ORIGIN;
    process.env.JWT_SECRET = "health-test-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
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
    expect(getAllowedOrigins()).toEqual(["http://localhost:3000", "http://localhost", "https://localhost"]);
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

  it("allows Capacitor Android origins but not arbitrary origins", async () => {
    const capacitor = await request(app.getHttpServer()).get("/health").set("Origin", "http://localhost").expect(200);
    const capacitorHttps = await request(app.getHttpServer()).get("/health").set("Origin", "https://localhost").expect(200);
    const arbitrary = await request(app.getHttpServer()).get("/health").set("Origin", "http://evil.example").expect(200);

    expect(capacitor.headers["access-control-allow-origin"]).toBe("http://localhost");
    expect(capacitorHttps.headers["access-control-allow-origin"]).toBe("https://localhost");
    expect(arbitrary.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows the HTTPS Capacitor preflight for speech recognition", async () => {
    const response = await request(app.getHttpServer())
      .options("/speech/recognize")
      .set("Origin", "https://localhost")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("https://localhost");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("content-type");
  });

  it("preserves a configured web origin alongside Capacitor", async () => {
    await app.close();
    process.env.FRONTEND_ORIGIN = "http://frontend.example.test";
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const web = await request(app.getHttpServer()).get("/health").set("Origin", "http://frontend.example.test").expect(200);
    const capacitor = await request(app.getHttpServer()).get("/health").set("Origin", "http://localhost").expect(200);
    const capacitorHttps = await request(app.getHttpServer()).get("/health").set("Origin", "https://localhost").expect(200);
    const arbitrary = await request(app.getHttpServer()).get("/health").set("Origin", "http://evil.example").expect(200);

    expect(web.headers["access-control-allow-origin"]).toBe("http://frontend.example.test");
    expect(capacitor.headers["access-control-allow-origin"]).toBe("http://localhost");
    expect(capacitorHttps.headers["access-control-allow-origin"]).toBe("https://localhost");
    expect(arbitrary.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it.each(["PUT", "PATCH", "DELETE"])("allows CORS preflight for %s project requests", async (method) => {
    const response = await request(app.getHttpServer())
      .options("/projects/11111111-1111-4111-8111-111111111111")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", method)
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-methods"]).toContain(method);
    expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("authorization");
    expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("content-type");
  });
});
