import { parseUmlTextProposal, type UmlTextProposal } from "@examen-sw1/uml-core";
import { arch, cpus, freemem, totalmem } from "node:os";
import { parseStructuredAssistantOutput } from "../local-model-spike.js";
import { validateAssistantCommand } from "../validator.js";
import { BENCHMARK_MANIFEST } from "./corpus.js";
import type { BenchmarkCase, BenchmarkCaseResult, BenchmarkMetrics, BenchmarkReport } from "./types.js";

export function runDeterministicBenchmark(corpus: readonly BenchmarkCase[], now: () => string = () => new Date().toISOString()): BenchmarkReport {
  const baselineBytes = process.memoryUsage().rss;
  let peakBytes = baselineBytes;
  const cases = corpus.map((item) => {
    const result = runCase(item);
    peakBytes = Math.max(peakBytes, process.memoryUsage().rss);
    return result;
  });
  const failures = cases.flatMap((item) => item.failure ? [`${item.id}: ${item.failure}`] : []);
  return {
    metadata: { benchmark: "deterministic-parser-adapter", executedAt: now(), totalCases: corpus.length },
    modelAvailability: { qwenAvailable: false, inferenceExecuted: false, runtimeInstalled: false, modelDownloaded: false },
    configuration: { targetModel: "Qwen3 1.7B", quantized: true, format: "GGUF", runtime: "node-llama-cpp", provider: "none" },
    hardware: { cpu: cpus()[0]?.model ?? "N/A", architecture: arch(), totalRamBytes: totalmem(), freeRamBytes: freemem(), gpu: "N/A" },
    limitations: ["Qwen3 1.7B no estuvo disponible durante este benchmark.", "Las métricas corresponden al parser/adaptador determinista, no a inferencia Qwen.", "VRAM, carga del modelo, latencia y RAM de Qwen: N/A."],
    cases,
    metrics: calculateBenchmarkMetrics(cases),
    memory: { baselineBytes, peakBytes, deltaBytes: peakBytes - baselineBytes, label: "RAM del benchmark determinista Node" },
    failures,
  };
}

export function calculateBenchmarkMetrics(cases: readonly BenchmarkCaseResult[]): BenchmarkMetrics {
  const total = cases.length || 1;
  const rejected = cases.filter((item) => item.outcome === "REJECT");
  const expectedRejections = cases.filter((item) => item.id.includes("unknown") || item.id.includes("ambiguous") || item.id.includes("missing") || item.id.includes("out-of-domain") || item.id.includes("unsupported"));
  const latencies = cases.map((item) => item.latencyMs).sort((left, right) => left - right);
  return {
    validityRate: percent(cases.filter((item) => item.structuralValid).length, total),
    accuracy: percent(cases.filter((item) => item.correct).length, total),
    falsePositives: cases.filter((item) => item.falsePositive).length,
    rejectionRate: percent(rejected.length, total),
    correctRejectionRate: percent(expectedRejections.filter((item) => item.correct && item.outcome === "REJECT").length, expectedRejections.length || 1),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
  };
}

function runCase(item: BenchmarkCase): BenchmarkCaseResult {
  const startedAt = process.hrtime.bigint();
  const evaluation = item.profile === "CRUD" ? evaluateCrud(item) : evaluateUml(item);
  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const correct = item.expected.outcome === evaluation.outcome && (item.expected.outcome === "REJECT" || sameStructure(evaluation.output, item.expected.golden));
  return { id: item.id, profile: item.profile, structuralValid: evaluation.structuralValid, outcome: evaluation.outcome, correct, falsePositive: item.expected.outcome === "REJECT" && evaluation.outcome === "ACCEPT", latencyMs, ...(correct ? {} : { failure: "El resultado no coincide con el golden esperado." }) };
}

function evaluateCrud(item: BenchmarkCase): { structuralValid: boolean; outcome: "ACCEPT" | "REJECT"; output?: unknown } {
  const parsed = parseStructuredAssistantOutput(item.adapterInput);
  if (!parsed.ok) return { structuralValid: false, outcome: "REJECT" };
  const valid = validateAssistantCommand(parsed.command, BENCHMARK_MANIFEST);
  return valid.ok ? { structuralValid: true, outcome: "ACCEPT", output: parsed.command } : { structuralValid: true, outcome: "REJECT" };
}

function evaluateUml(item: BenchmarkCase): { structuralValid: boolean; outcome: "ACCEPT" | "REJECT"; output?: UmlTextProposal } {
  const parsed = parseUmlTextProposal(String(item.adapterInput));
  if (!parsed.success) return { structuralValid: false, outcome: "REJECT" };
  const targetId = parsed.proposal.type === "CREATE_CLASS" ? undefined : parsed.proposal.targetId;
  return targetId && !item.knownClassIds?.includes(targetId) ? { structuralValid: true, outcome: "REJECT" } : { structuralValid: true, outcome: "ACCEPT", output: parsed.proposal };
}

function sameStructure(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function percent(value: number, total: number): number { return Number(((value / total) * 100).toFixed(2)); }
function percentile(values: readonly number[], ratio: number): number { return values.length === 0 ? 0 : values[Math.ceil(values.length * ratio) - 1]; }
