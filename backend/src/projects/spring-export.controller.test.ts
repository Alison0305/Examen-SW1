import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { strToU8, unzipSync, zipSync } from "fflate";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SpringExportController } from "./spring-export.controller";
import { SpringExportService } from "./spring-export.service";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("SpringExportController", () => {
  let app: NestFastifyApplication;
  let exportProject: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    exportProject = vi.fn().mockResolvedValue({ zip: Buffer.from(zipSync({ "build.gradle": strToU8("plugins {}\n"), "settings.gradle": strToU8("rootProject.name = 'roles'\n"), "src/main/java/com/example/generated/entities/Rol.java": strToU8("class Rol {}\n"), "src/main/java/com/example/generated/entities/Usuario.java": strToU8("class Usuario {}\n") })) });
    const module = await Test.createTestingModule({
      controllers: [SpringExportController],
      providers: [{ provide: SpringExportService, useValue: { exportProject } }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: { id: string } } } }) {
        const request = context.switchToHttp().getRequest();
        if (request.headers.authorization !== "Bearer valid") throw new UnauthorizedException();
        request.authenticatedUser = { id: "22222222-2222-4222-822222222222" };
        return true;
      },
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => { await app.close(); });

  it("requiere autenticación y devuelve ZIP seguro para una exportación autorizada", async () => {
    await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).send({}).expect(401);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/exports/spring`)
      .set("Authorization", "Bearer valid")
      .send({ basePackage: "com.example.rol" })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(exportProject).toHaveBeenCalledWith(projectId, "22222222-2222-4222-822222222222", "com.example.rol");
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="spring-backend-${projectId}.zip"`);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(Object.keys(unzipSync(response.body))).toEqual(expect.arrayContaining(["build.gradle", "settings.gradle", "src/main/java/com/example/generated/entities/Rol.java", "src/main/java/com/example/generated/entities/Usuario.java"]));
    expect(() => JSON.parse(response.body.toString("utf8"))).toThrow();
  });

  it("mantiene errores de autorización, proyecto y validación como respuestas HTTP", async () => {
    exportProject.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).set("Authorization", "Bearer valid").send({}).expect(403);

    exportProject.mockRejectedValueOnce(new NotFoundException());
    await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).set("Authorization", "Bearer valid").send({}).expect(404);
    await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).set("Authorization", "Bearer valid").send({ basePackage: "../unsafe" }).expect(400);

    exportProject.mockRejectedValueOnce(new Error("detalle interno"));
    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/exports/spring`).set("Authorization", "Bearer valid").send({}).expect(500);
    expect(response.text).not.toContain("detalle interno");
  });
});
