import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import sharp from "sharp";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { OcrLine } from "./diagram-analyzer";
import { renderSyntheticDiagram } from "./synthetic-diagram";
import { getVisionConfig } from "./vision.config";
import { registerImageBodyParser, VisionController } from "./vision.controller";
import { VisionProposalService } from "./vision-proposal.service";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const config = { ...getVisionConfig({}), maxBytes: 200_000 };

async function createApp(options: { role?: "EDITOR" | "VIEWER"; ocr?: ((image: unknown) => Promise<OcrLine[]>) | null } = {}) {
  const requireEdit = vi.fn(async () => {
    if (options.role === "VIEWER") throw new ForbiddenException();
    return "EDITOR" as const;
  });
  const recognize = vi.fn(options.ocr ?? (async () => []));
  const service = new VisionProposalService({ requireEdit }, options.ocr === null ? undefined : { recognize }, config);
  const module = await Test.createTestingModule({ controllers: [VisionController], providers: [{ provide: VisionProposalService, useValue: service }] })
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: { id: string } } } }) {
        const incoming = context.switchToHttp().getRequest();
        if (incoming.headers.authorization !== "Bearer valid") throw new UnauthorizedException();
        incoming.authenticatedUser = { id: userId };
        return true;
      },
    }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  registerImageBodyParser(app, config.maxBytes);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, requireEdit, recognize };
}

let current: NestFastifyApplication | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

const url = `/projects/${projectId}/vision/uml-proposal`;
const post = (app: NestFastifyApplication, body: Buffer, type = "image/png") => request(app.getHttpServer()).post(url).set("Authorization", "Bearer valid").set("Content-Type", type).send(body);

// Each test boots a Nest app and decodes real images, which can exceed the default 5 s on a loaded machine.
describe("POST /projects/:id/vision/uml-proposal", { timeout: 30_000 }, () => {
  it("devuelve la propuesta reconocida para un EDITOR sin modificar el proyecto", async () => {
    const { svg, lines } = renderSyntheticDiagram({ width: 800, height: 300, classes: [{ name: "Cliente", x: 40, y: 60, attributes: ["- nombre : String"] }, { name: "Pedido", x: 520, y: 60, attributes: ["- fecha : Date"] }], connectors: [{ from: "Cliente", to: "Pedido", toLabel: "0..*" }] });
    const created = await createApp({ ocr: async () => lines });
    current = created.app;

    const response = await post(created.app, await sharp(Buffer.from(svg)).png().toBuffer()).expect(200);

    expect(created.requireEdit).toHaveBeenCalledWith(projectId, userId);
    expect(response.body).toMatchObject({ ok: true, image: { width: 800, height: 300 }, ocrLines: lines.length, proposal: { source: "image" } });
    expect(response.body.proposal.classes.map((entry: { name: string }) => entry.name)).toEqual(["Cliente", "Pedido"]);
    expect(response.body.proposal.relationships).toEqual([{ key: "R1", type: "Association", source: "C1", target: "C2", targetMultiplicity: { lower: 0, upper: "unbounded" } }]);
  });

  it("acepta JPEG enviado como application/octet-stream", async () => {
    const created = await createApp();
    current = created.app;
    const jpeg = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const response = await post(created.app, jpeg, "application/octet-stream").expect(200);
    expect(response.body.proposal.diagnostics.map((entry: { code: string }) => entry.code)).toEqual(["IMAGE_NO_DIAGRAM"]);
  });

  it("rechaza sin autenticación y a un VIEWER sin procesar la imagen", async () => {
    const created = await createApp({ role: "VIEWER" });
    current = created.app;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
    await request(created.app.getHttpServer()).post(url).set("Content-Type", "image/png").send(png).expect(401);
    await post(created.app, png).expect(403);
    expect(created.recognize).not.toHaveBeenCalled();
  });

  it("rechaza formatos no permitidos y archivos demasiado grandes con diagnóstico estructurado sin cargar el modelo", async () => {
    const created = await createApp();
    current = created.app;
    const gif = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).gif().toBuffer();

    const format = await post(created.app, gif, "image/gif").expect(415);
    expect(format.body).toEqual({ ok: false, diagnostic: { code: "INVALID_FORMAT", message: "La imagen debe ser PNG o JPEG." } });
    const large = await post(created.app, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(config.maxBytes)])).expect(413);
    expect(large.body.diagnostic.code).toBe("TOO_LARGE");
    const tiny = await post(created.app, await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer()).expect(422);
    expect(tiny.body.diagnostic.code).toBe("INVALID_DIMENSIONS");
    expect(created.recognize).not.toHaveBeenCalled();
  });

  it("responde modelo no configurado y errores del motor como diagnósticos", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
    const unconfigured = await createApp({ ocr: null });
    current = unconfigured.app;
    expect((await post(unconfigured.app, png).expect(503)).body.diagnostic.code).toBe("NOT_CONFIGURED");
    await unconfigured.app.close();

    const { VisionError } = await import("./vision-errors");
    const slow = await createApp({ ocr: async () => { throw new VisionError("TIMEOUT"); } });
    current = slow.app;
    expect((await post(slow.app, png).expect(504)).body).toEqual({ ok: false, diagnostic: { code: "TIMEOUT", message: "El reconocimiento de la imagen superó el tiempo máximo." } });
  });
});
