import request from "supertest";
import * as argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../create-app";
import { PrismaService } from "../prisma/prisma.service";

const email = "cu03-auth-integration@example.test";
const password = "password-123";

describe("auth PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "auth-integration-test-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registra, verifica Argon2id, autentica y recupera la sesión", async () => {
    const registration = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "  CU03-AUTH-INTEGRATION@EXAMPLE.TEST  ", password })
      .expect(201);

    expect(registration.body).toMatchObject({ email });
    expect(registration.body).not.toHaveProperty("passwordHash");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(argon2.verify(user.passwordHash, password)).resolves.toBe(true);

    await request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(409);
    await request(app.getHttpServer()).post("/auth/register").send({ email: "not-an-email", password }).expect(400);
    await request(app.getHttpServer()).post("/auth/register").send({ email: "short@example.test", password: "short" }).expect(400);

    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: " CU03-AUTH-INTEGRATION@EXAMPLE.TEST ", password }).expect(201);
    expect(login.body).toMatchObject({ tokenType: "Bearer", accessToken: expect.any(String) });
    await request(app.getHttpServer()).post("/auth/login").send({ email, password: "wrong-password" }).expect(401);
    await request(app.getHttpServer()).post("/auth/login").send({ email, password: "bad" }).expect(401);
    await request(app.getHttpServer()).post("/auth/login").send({ email: "missing@example.test", password }).expect(401);

    const me = await request(app.getHttpServer()).get("/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ id: user.id, email });
    expect(me.body).not.toHaveProperty("passwordHash");
    await request(app.getHttpServer()).get("/auth/me").expect(401);
    await request(app.getHttpServer()).get("/auth/me").set("Authorization", "Basic token").expect(401);
    await request(app.getHttpServer()).get("/auth/me").set("Authorization", "Bearer invalid-token").expect(401);

    const expired = await app.get(JwtService).signAsync({ sub: user.id }, { secret: process.env.JWT_SECRET, expiresIn: -1 });
    await request(app.getHttpServer()).get("/auth/me").set("Authorization", `Bearer ${expired}`).expect(401);
    await prisma.user.delete({ where: { id: user.id } });
    await request(app.getHttpServer()).get("/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`).expect(401);
  });
});
