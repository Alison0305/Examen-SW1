// LLM benchmark for the local interpreter (fix-cu-08-qwen-local-runtime, Incremento 3).
// Runs MODEL_BENCHMARK_CORPUS through the production path (AssistantInterpreterService +
// QueuedLocalTextModel + NodeLlamaCppEngine) and records what was actually measured.
//
// Usage, from backend/:
//   npm run benchmark:llm -- --model C:\ruta\Qwen3-1.7B-Q8_0.gguf --gpu auto --label q8-gpu
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { arch, cpus, totalmem } from "node:os";
import { basename, join, resolve } from "node:path";
import { calculateModelBenchmarkMetrics, INTERPRETATION_PROMPT_VERSION, evaluateModelBenchmarkCase, MODEL_BENCHMARK_CLASSES, MODEL_BENCHMARK_CORPUS, MODEL_BENCHMARK_MANIFEST, type InterpretationResponse, type ModelBenchmarkCaseResult } from "@examen-sw1/assistant-core";
import { getAssistantConfig } from "./assistant.config";
import { AssistantInterpreterService } from "./assistant-interpreter.service";
import { QueuedLocalTextModel } from "./local-text-model";
import { NodeLlamaCppEngine, type AssistantGpuMode } from "./node-llama-cpp-engine";

const GPU_MODES: readonly AssistantGpuMode[] = ["auto", "vulkan", "cuda", "cpu"];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

// nvidia-smi reports the whole GPU, so VRAM is recorded as a before/after delta of the device.
function nvidiaSmi(query: string): string | undefined {
  try {
    return execFileSync("nvidia-smi", [`--query-gpu=${query}`, "--format=csv,noheader,nounits"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/)[0];
  } catch {
    return undefined;
  }
}
const gpuUsedMiB = (): number | undefined => {
  const value = Number(nvidiaSmi("memory.used"));
  return Number.isFinite(value) ? value : undefined;
};

function runtimeVersion(): string {
  try {
    return (JSON.parse(readFileSync(resolve(process.cwd(), "..", "node_modules", "node-llama-cpp", "package.json"), "utf8")) as { version: string }).version;
  } catch {
    return "N/A";
  }
}

const quantizationOf = (file: string): string => /(Q\d+_[A-Z0-9_]+)\.gguf$/i.exec(file)?.[1]?.toUpperCase() ?? "N/A";
const mib = (bytes: number): number => Number((bytes / 1024 / 1024).toFixed(1));

async function main(): Promise<void> {
  const modelPath = argument("model") ?? getAssistantConfig().modelPath;
  const gpu = (argument("gpu") ?? "auto") as AssistantGpuMode;
  const label = argument("label") ?? `${quantizationOf(modelPath ?? "")}-${gpu}`.toLowerCase();
  if (!modelPath || !existsSync(modelPath)) throw new Error("Indique un modelo GGUF existente con --model o ASSISTANT_MODEL_PATH.");
  if (!GPU_MODES.includes(gpu)) throw new Error(`--gpu debe ser uno de: ${GPU_MODES.join(", ")}.`);
  const config = getAssistantConfig();

  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
  const rssBaseline = process.memoryUsage().rss;
  const vramBeforeMiB = gpuUsedMiB();

  const engine = new NodeLlamaCppEngine({ modelPath, gpu, contextSize: config.contextSize, maxTokens: config.maxTokens });
  const model = new QueuedLocalTextModel(engine, { timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });
  const interpreter = new AssistantInterpreterService(model);

  const loadStarted = performance.now();
  await model.warmup();
  const loadMs = performance.now() - loadStarted;
  const rssAfterLoad = process.memoryUsage().rss;
  const vramAfterLoadMiB = gpuUsedMiB();
  const runtime = await engine.runtimeInfo();
  console.log(`[${label}] modelo cargado en ${(loadMs / 1000).toFixed(1)} s con ${runtime.gpu}`);

  const results: ModelBenchmarkCaseResult[] = [];
  for (const item of MODEL_BENCHMARK_CORPUS) {
    const started = performance.now();
    const response: InterpretationResponse = item.mode === "uml" ? await interpreter.interpretUml(item.text, MODEL_BENCHMARK_CLASSES) : await interpreter.interpretData(item.text, MODEL_BENCHMARK_MANIFEST);
    const result = evaluateModelBenchmarkCase(item, response, performance.now() - started);
    results.push(result);
    console.log(`[${label}] ${result.correct ? "OK " : "ERR"} ${item.id} ${result.latencyMs.toFixed(0)} ms ${result.diagnosticCode ?? JSON.stringify(result.output)}`);
  }
  const vramPeakMiB = gpuUsedMiB();
  clearInterval(sampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  await model.dispose();

  const metrics = calculateModelBenchmarkMetrics(results);
  const report = {
    metadata: { benchmark: "llm-local-interpreter", label, executedAt: new Date().toISOString(), corpusCases: MODEL_BENCHMARK_CORPUS.length },
    configuration: {
      promptVersion: INTERPRETATION_PROMPT_VERSION, modelFile: basename(modelPath), modelBytes: statSync(modelPath).size, quantization: quantizationOf(modelPath), runtime: "node-llama-cpp", runtimeVersion: runtimeVersion(),
      gpuRequested: gpu, gpuEffective: runtime.gpu, contextSize: config.contextSize, maxOutputTokens: config.maxTokens, temperature: 0, thoughtTokens: 0, inferenceTimeoutMs: config.timeoutMs,
    },
    hardware: { cpu: cpus()[0]?.model.trim() ?? "N/A", logicalCores: cpus().length, architecture: arch(), totalRamBytes: totalmem(), gpu: nvidiaSmi("name") ?? "N/A", gpuDriver: nvidiaSmi("driver_version") ?? "N/A", node: process.version },
    loadTimeMs: Number(loadMs.toFixed(0)),
    ram: { baselineMiB: mib(rssBaseline), afterLoadMiB: mib(rssAfterLoad), peakMiB: mib(peakRss), deltaPeakMiB: mib(peakRss - rssBaseline), note: "RSS del proceso Node; con mmap, parte del modelo puede no contarse como RSS." },
    vram: vramBeforeMiB === undefined ? "N/A: nvidia-smi no disponible" : { beforeMiB: vramBeforeMiB, afterLoadMiB: vramAfterLoadMiB, afterRunMiB: vramPeakMiB, deltaLoadMiB: vramAfterLoadMiB === undefined ? null : vramAfterLoadMiB - vramBeforeMiB, note: "memoria usada de toda la GPU según nvidia-smi" },
    metrics,
    failures: results.filter((item) => !item.correct).map((item) => ({ id: item.id, outcome: item.outcome, diagnosticCode: item.diagnosticCode, output: item.output })),
    cases: results,
  };
  const outputDirectory = resolve(process.cwd(), ".benchmark-output");
  mkdirSync(outputDirectory, { recursive: true });
  const target = join(outputDirectory, `llm-${label}.json`);
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ label, gpu: runtime.gpu, loadTimeMs: report.loadTimeMs, ram: report.ram, vram: report.vram, metrics }, null, 2));
  console.log(`reporte: ${target}`);
}

main().then(() => process.exit(0), (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
