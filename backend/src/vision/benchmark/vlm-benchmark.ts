// VLM benchmark for image → UML (CU-10, Incremento 3). Runs the production path (Sharp preprocessing,
// QueuedOcrEngine + Florence2OcrEngine and the deterministic analyzer) and records only what was measured.
//
// Usage, from backend/:
//   npm run benchmark:vlm -- --model C:\ruta\Florence-2-base-ft --dtype q8 --photos C:\ruta\fotos --label q8-cpu
// --photos is optional: a folder outside the repository with expected.json (see loadPhotoCases).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import type { UmlImportProposal } from "@examen-sw1/uml-core";
import { analyzeDiagram } from "../diagram-analyzer";
import { Florence2OcrEngine, VISION_MODEL_DTYPES, florence2ModelFiles, type VisionModelDtype } from "../florence2-ocr-engine";
import { preprocessImage } from "../image-preprocessing";
import { QueuedOcrEngine } from "../ocr-engine";
import { getVisionConfig } from "../vision.config";
import { SYNTHETIC_CONDITIONS, SYNTHETIC_DIAGRAMS, expectedFromSynthetic, loadPhotoCases, renderCondition } from "./vlm-dataset";
import { percentile, scoreProposal, summarize, sumScores, type CaseScore, type ExpectedDiagram } from "./vlm-metrics";

// OCR misspellings tolerated in the second scoring (edit distance on normalized names).
const OCR_TOLERANCE = 2;

type BenchmarkCase = Readonly<{ id: string; condition: string; load: () => Promise<Buffer>; expected: ExpectedDiagram }>;
type CaseResult = {
  id: string;
  condition: string;
  ok: boolean;
  error?: string;
  latencyMs?: number;
  ocrLines?: number;
  strict?: CaseScore;
  tolerant?: CaseScore;
  proposal?: Pick<UmlImportProposal, "classes" | "enumerations" | "relationships"> & { diagnostics: string[] };
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function packageVersion(name: string): string {
  try {
    return (JSON.parse(readFileSync(resolve(process.cwd(), "..", "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
  } catch {
    return "N/A";
  }
}

const mib = (bytes: number): number => Number((bytes / 1024 / 1024).toFixed(1));

function cases(photosDirectory: string | undefined): BenchmarkCase[] {
  const synthetic = Object.entries(SYNTHETIC_DIAGRAMS).flatMap(([id, diagram]) => SYNTHETIC_CONDITIONS.map((condition): BenchmarkCase => ({ id: `${id}/${condition}`, condition, load: () => renderCondition(diagram, condition), expected: expectedFromSynthetic(diagram) })));
  const photos = photosDirectory ? loadPhotoCases(photosDirectory).map((entry): BenchmarkCase => ({ id: entry.id, condition: entry.condition, load: async () => readFileSync(entry.file), expected: entry.expected })) : [];
  return [...synthetic, ...photos];
}

function aggregate(results: readonly CaseResult[]) {
  const completed = results.filter((entry) => entry.ok);
  const latencies = completed.map((entry) => entry.latencyMs!);
  return {
    images: results.length,
    failures: results.length - completed.length,
    strict: summarize(sumScores(completed.map((entry) => entry.strict!))),
    tolerant: summarize(sumScores(completed.map((entry) => entry.tolerant!))),
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? Math.max(...latencies) : null },
  };
}

async function main(): Promise<void> {
  const config = getVisionConfig();
  const modelPath = argument("model") ?? config.modelPath;
  const dtype = (argument("dtype") ?? config.dtype) as VisionModelDtype;
  const photosDirectory = argument("photos");
  const label = argument("label") ?? `${dtype}-cpu`;
  if (!modelPath || !existsSync(modelPath)) throw new Error("Indique la carpeta de Florence-2 con --model o VISION_MODEL_PATH.");
  if (!VISION_MODEL_DTYPES.includes(dtype)) throw new Error(`--dtype debe ser uno de: ${VISION_MODEL_DTYPES.join(", ")}.`);
  if (photosDirectory && !existsSync(join(photosDirectory, "expected.json"))) throw new Error("La carpeta de --photos debe contener expected.json.");

  const dataset = cases(photosDirectory);
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
  const rssBaseline = process.memoryUsage().rss;
  // Generous timeout: the benchmark measures latency, it does not enforce the production limit.
  const ocr = new QueuedOcrEngine(new Florence2OcrEngine({ modelPath, dtype }), { timeoutMs: 300_000, maxQueue: 1 });

  const loadStarted = performance.now();
  await ocr.warmup();
  const loadMs = Math.round(performance.now() - loadStarted);
  const rssAfterLoad = process.memoryUsage().rss;
  console.log(`Modelo cargado en ${loadMs} ms (${dtype}). Casos: ${dataset.length}.`);

  const results: CaseResult[] = [];
  for (const entry of dataset) {
    try {
      const input = await entry.load();
      const started = performance.now();
      const image = await preprocessImage(input, { maxSide: config.maxSide, maxInputPixels: config.maxInputPixels, minSide: config.minSide });
      const lines = await ocr.recognize(image);
      const proposal = analyzeDiagram(image, lines);
      const latencyMs = Math.round(performance.now() - started);
      const strict = scoreProposal(proposal, entry.expected, 0);
      const tolerant = scoreProposal(proposal, entry.expected, OCR_TOLERANCE);
      results.push({ id: entry.id, condition: entry.condition, ok: true, latencyMs, ocrLines: lines.length, strict, tolerant, proposal: { classes: proposal.classes, enumerations: proposal.enumerations, relationships: proposal.relationships, diagnostics: proposal.diagnostics.map((diagnostic) => diagnostic.code) } });
      const summary = summarize(tolerant);
      console.log(`${entry.id}: ${latencyMs} ms; clases ${summary.classes.truePositives}/${summary.classes.expected}, relaciones ${summary.relationships.truePositives}/${summary.relationships.expected}`);
    } catch (error) {
      results.push({ id: entry.id, condition: entry.condition, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      console.log(`${entry.id}: ERROR ${results.at(-1)!.error}`);
    }
  }
  clearInterval(sampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  await ocr.dispose();

  const conditions = [...new Set(results.map((entry) => entry.condition))];
  const modelFiles = florence2ModelFiles(dtype);
  const report = {
    benchmark: "vlm-image-to-uml",
    label,
    date: new Date().toISOString(),
    model: {
      id: "onnx-community/Florence-2-base-ft",
      path: modelPath,
      dtype,
      task: "<OCR_WITH_REGION>",
      files: modelFiles.filter((file) => file.endsWith(".onnx")).map((file) => ({ file, sha256: createHash("sha256").update(readFileSync(join(modelPath, file))).digest("hex").slice(0, 16) })),
    },
    runtime: { node: process.version, transformers: packageVersion("@huggingface/transformers"), onnxruntimeNode: packageVersion("onnxruntime-node"), sharp: packageVersion("sharp"), device: "cpu" },
    hardware: { cpu: cpus()[0]?.model ?? "N/A", cores: cpus().length, ramMiB: mib(totalmem()), os: `${platform()} ${release()} ${arch()}`, vram: "N/A: Florence-2 se ejecuta en CPU" },
    dataset: { synthetic: Object.keys(SYNTHETIC_DIAGRAMS).length * SYNTHETIC_CONDITIONS.length, photos: results.filter((entry) => !SYNTHETIC_CONDITIONS.includes(entry.condition as never)).length, photosDirectory: photosDirectory ?? null, ocrTolerance: OCR_TOLERANCE },
    loadMs,
    memory: { rssBaselineMiB: mib(rssBaseline), rssAfterLoadMiB: mib(rssAfterLoad), rssPeakMiB: mib(peakRss) },
    overall: aggregate(results),
    byCondition: Object.fromEntries(conditions.map((condition) => [condition, aggregate(results.filter((entry) => entry.condition === condition))])),
    cases: results,
  };

  const outputDirectory = resolve(process.cwd(), ".benchmark-output");
  mkdirSync(outputDirectory, { recursive: true });
  const outputFile = join(outputDirectory, `vlm-${label}-${report.date.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outputFile, JSON.stringify(report, null, 2));

  console.log("\nCondición | imágenes | fallos | clases P/R (estricto) | clases P/R (tolerante) | atributos R (tol.) | relaciones P/R (tol.) | multiplicidades (tol.) | p50/p95 ms");
  for (const [condition, summary] of Object.entries(report.byCondition)) {
    const t = summary.tolerant;
    console.log(`${condition} | ${summary.images} | ${summary.failures} | ${summary.strict.classes.precision}/${summary.strict.classes.recall} | ${t.classes.precision}/${t.classes.recall} | ${t.attributes.recall} | ${t.relationships.precision}/${t.relationships.recall} | ${t.multiplicities.accuracy} | ${summary.latencyMs.p50}/${summary.latencyMs.p95}`);
  }
  console.log(`\nCarga ${loadMs} ms; RSS pico ${report.memory.rssPeakMiB} MiB. Reporte: ${outputFile}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
