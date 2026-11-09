import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SYNTHETIC_DIAGRAMS, renderCondition } from "./benchmark/vlm-dataset";
import { detectImageFormat, estimateSkewDegrees, preprocessImage } from "./image-preprocessing";
import { VisionError } from "./vision-errors";

const LIMITS = { maxSide: 1024, maxInputPixels: 40_000_000, minSide: 32 };

const solid = (width: number, height: number, color: string) => sharp({ create: { width, height, channels: 3, background: color } });

async function expectVisionError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(VisionError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("preprocessImage", () => {
  it("detecta PNG y JPEG por su firma, no por la extensión", async () => {
    expect(detectImageFormat(await solid(40, 40, "#fff").png().toBuffer())).toBe("png");
    expect(detectImageFormat(await solid(40, 40, "#fff").jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageFormat(await solid(40, 40, "#fff").gif().toBuffer())).toBeUndefined();
    expect(detectImageFormat(Buffer.from("%PDF-1.7"))).toBeUndefined();
  });

  it("convierte a escala de grises y reduce el lado mayor a 1024 px conservando la proporción", async () => {
    const image = await preprocessImage(await solid(2048, 1024, "#3366cc").png().toBuffer(), LIMITS);
    expect([image.width, image.height]).toEqual([1024, 512]);
    expect(image.data).toHaveLength(1024 * 512);
  });

  it("no amplía imágenes pequeñas", async () => {
    const image = await preprocessImage(await solid(300, 200, "#fff").png().toBuffer(), LIMITS);
    expect([image.width, image.height]).toEqual([300, 200]);
  });

  it("aplica la rotación EXIF de las fotos", async () => {
    const photo = await solid(200, 100, "#fff").jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const image = await preprocessImage(photo, LIMITS);
    expect([image.width, image.height]).toEqual([100, 200]);
  });

  it("normaliza el contraste de una imagen apagada", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#969696"/><rect x="20" y="20" width="60" height="60" fill="#646464"/></svg>';
    const image = await preprocessImage(await sharp(Buffer.from(svg)).png().toBuffer(), LIMITS);
    expect(Math.min(...image.data)).toBeLessThan(20);
    expect(Math.max(...image.data)).toBeGreaterThan(235);
  });

  it("rechaza formatos no permitidos, archivos corruptos y dimensiones fuera de límites", async () => {
    await expectVisionError(preprocessImage(await solid(40, 40, "#fff").gif().toBuffer(), LIMITS), "INVALID_FORMAT");
    const png = await solid(40, 40, "#fff").png().toBuffer();
    await expectVisionError(preprocessImage(Buffer.concat([png.subarray(0, 16), Buffer.alloc(32)]), LIMITS), "INVALID_IMAGE");
    await expectVisionError(preprocessImage(await solid(20, 400, "#fff").png().toBuffer(), LIMITS), "INVALID_DIMENSIONS");
    await expectVisionError(preprocessImage(await solid(400, 400, "#fff").png().toBuffer(), { ...LIMITS, maxInputPixels: 100_000 }), "INVALID_DIMENSIONS");
  });

  it("estima la inclinación de un diagrama y la corrige sin tocar imágenes rectas", async () => {
    const diagram = SYNTHETIC_DIAGRAMS["empresa-marcas"]!;
    const straight = await preprocessImage(await renderCondition(diagram, "captura"), LIMITS);
    expect(estimateSkewDegrees(straight)).toBe(0);
    expect([straight.width, straight.height]).toEqual([1000, 420]);

    for (const angle of [3, -4]) {
      const tilted = await sharp(await renderCondition(diagram, "captura")).rotate(angle, { background: "#ffffff" }).png().toBuffer();
      const { data, info } = await sharp(tilted).greyscale().raw().toBuffer({ resolveWithObject: true });
      expect(Math.abs(estimateSkewDegrees({ data, width: info.width, height: info.height }) - angle)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(estimateSkewDegrees(await preprocessImage(tilted, LIMITS)))).toBeLessThan(0.5);
    }
  });
});
