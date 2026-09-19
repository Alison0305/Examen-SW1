import { describe, expect, it } from "vitest";
import { BENCHMARK_CORPUS } from "./corpus.js";
import { renderBenchmarkJson, renderBenchmarkMarkdown } from "./report.js";
import { calculateBenchmarkMetrics, runDeterministicBenchmark } from "./runner.js";

describe("benchmark determinista", () => {
  it("mantiene 19 casos con IDs únicos y no ejecuta mutaciones", () => {
    const report = runDeterministicBenchmark(BENCHMARK_CORPUS, () => "2026-09-18T00:00:00.000Z");
    expect(BENCHMARK_CORPUS).toHaveLength(19);
    expect(new Set(BENCHMARK_CORPUS.map((item) => item.id)).size).toBe(19);
    expect(report.cases.every((item) => item.latencyMs >= 0)).toBe(true);
    expect(report.metrics.latencyP95Ms).toBeGreaterThanOrEqual(report.metrics.latencyP50Ms);
    expect(report.modelAvailability).toEqual({ qwenAvailable: false, inferenceExecuted: false, runtimeInstalled: false, modelDownloaded: false });
  });

  it("calcula false positives y rechazos correctos", () => {
    const metrics = calculateBenchmarkMetrics([
      { id: "unknown-1", profile: "CRUD", structuralValid: true, outcome: "REJECT", correct: true, falsePositive: false, latencyMs: 1 },
      { id: "unknown-2", profile: "CRUD", structuralValid: true, outcome: "ACCEPT", correct: false, falsePositive: true, latencyMs: 2 },
    ]);
    expect(metrics).toMatchObject({ falsePositives: 1, correctRejectionRate: 50, rejectionRate: 50, accuracy: 50 });
  });

  it("renderiza JSON y Markdown con el disclaimer de Qwen", () => {
    const report = runDeterministicBenchmark(BENCHMARK_CORPUS);
    expect(JSON.parse(renderBenchmarkJson(report)).limitations).toContain("Qwen3 1.7B no estuvo disponible durante este benchmark.");
    expect(renderBenchmarkMarkdown(report)).toContain("Las métricas corresponden al parser/adaptador determinista, no a inferencia Qwen.");
  });
});
