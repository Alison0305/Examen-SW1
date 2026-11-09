import sharp, { type Metadata } from "sharp";
import type { GrayImage } from "./diagram-analyzer";
import { VisionError } from "./vision-errors";

export type ImageLimits = Readonly<{ maxSide: number; maxInputPixels: number; minSide: number }>;
export type ImageFormat = "png" | "jpeg";

// Format is decided from the file signature, never from the client's Content-Type.
export function detectImageFormat(buffer: Buffer): ImageFormat | undefined {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  return undefined;
}

// EXIF rotation, grayscale, contrast normalization and resize; OCR and analysis share these pixels.
export async function preprocessImage(input: Buffer, limits: ImageLimits): Promise<GrayImage> {
  const format = detectImageFormat(input);
  if (!format) throw new VisionError("INVALID_FORMAT");
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new VisionError("INVALID_IMAGE");
  }
  if (metadata.format !== format) throw new VisionError("INVALID_FORMAT");
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;
  if (imageWidth < limits.minSide || imageHeight < limits.minSide || imageWidth * imageHeight > limits.maxInputPixels) throw new VisionError("INVALID_DIMENSIONS");
  try {
    const { data, info } = await sharp(input, { limitInputPixels: limits.maxInputPixels })
      .rotate()
      .flatten({ background: "#ffffff" })
      .grayscale()
      .normalise()
      .resize({ width: limits.maxSide, height: limits.maxSide, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 1) throw new Error("unexpected channels");
    const image: GrayImage = { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
    return await deskew(image, limits.maxSide);
  } catch {
    throw new VisionError("INVALID_IMAGE");
  }
}

const MAX_SKEW_DEGREES = 8;
const SKEW_STEP_DEGREES = 0.25;
const MIN_CORRECTED_SKEW_DEGREES = 0.5;
const SKEW_INK_LEVEL = 128;

// Skew of horizontal structure (class borders, separators, text rows): the angle whose row projection of
// dark pixels is sharpest. Positive means lines descend to the right.
export function estimateSkewDegrees(image: GrayImage): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[y * image.width + x]! < SKEW_INK_LEVEL) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length === 0) return 0;
  const margin = Math.ceil(image.width * Math.tan((MAX_SKEW_DEGREES * Math.PI) / 180)) + 1;
  const bins = new Float64Array(image.height + 2 * margin);
  let best = 0;
  let bestScore = -1;
  for (let degrees = -MAX_SKEW_DEGREES; degrees <= MAX_SKEW_DEGREES + 1e-9; degrees += SKEW_STEP_DEGREES) {
    const slope = Math.tan((degrees * Math.PI) / 180);
    bins.fill(0);
    for (let index = 0; index < xs.length; index += 1) bins[Math.round(ys[index]! - xs[index]! * slope) + margin]! += 1;
    let score = 0;
    for (const count of bins) score += count * count;
    // Ties keep the angle closest to zero, so a straight image is never rotated.
    if (score > bestScore * (1 + 1e-9) || (Math.abs(score - bestScore) <= bestScore * 1e-9 && Math.abs(degrees) < Math.abs(best))) {
      best = degrees;
      bestScore = score;
    }
  }
  return Number(best.toFixed(2));
}

// Small rotations (tilted photos or scans) break the axis-aligned box detection, so they are undone here.
async function deskew(image: GrayImage, maxSide: number): Promise<GrayImage> {
  const skew = estimateSkewDegrees(image);
  if (Math.abs(skew) < MIN_CORRECTED_SKEW_DEGREES) return image;
  const { data, info } = await sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), { raw: { width: image.width, height: image.height, channels: 1 } })
    .rotate(-skew, { background: { r: 255, g: 255, b: 255 } })
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error("unexpected channels");
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
}
