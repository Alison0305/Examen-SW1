import type { BenchmarkReport } from "./types.js";

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  return `# Benchmark determinista\n\n> Qwen3 1.7B no estuvo disponible durante este benchmark.\n>\n> Las métricas corresponden al parser/adaptador determinista, no a inferencia Qwen.\n\n- Casos: ${report.metadata.totalCases}\n- Validez estructurada: ${report.metrics.validityRate}%\n- Accuracy: ${report.metrics.accuracy}%\n- False positives: ${report.metrics.falsePositives}\n- Rechazos correctos: ${report.metrics.correctRejectionRate}%\n- Latencia p50/p95: ${report.metrics.latencyP50Ms.toFixed(3)} / ${report.metrics.latencyP95Ms.toFixed(3)} ms\n- RAM baseline/pico/delta: ${report.memory.baselineBytes} / ${report.memory.peakBytes} / ${report.memory.deltaBytes} bytes\n- VRAM: N/A\n- Model load time: N/A\n- Fallos: ${report.failures.length}\n`;
}

export function renderBenchmarkJson(report: BenchmarkReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
