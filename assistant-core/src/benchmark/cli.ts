import { mkdir, writeFile } from "node:fs/promises";
import { BENCHMARK_CORPUS } from "./corpus.js";
import { renderBenchmarkJson, renderBenchmarkMarkdown } from "./report.js";
import { runDeterministicBenchmark } from "./runner.js";

const outputDirectory = new URL("../../.benchmark-output/", import.meta.url);
const report = runDeterministicBenchmark(BENCHMARK_CORPUS);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL("report.json", outputDirectory), renderBenchmarkJson(report));
await writeFile(new URL("report.md", outputDirectory), renderBenchmarkMarkdown(report));
console.log(JSON.stringify({ metrics: report.metrics, memory: report.memory, failures: report.failures }, null, 2));
