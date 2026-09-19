import type { AssistantCommand } from "../contract.js";
import type { UmlTextProposal } from "@examen-sw1/uml-core";

export type BenchmarkProfile = "CRUD" | "UML";
export type BenchmarkExpected = { outcome: "ACCEPT"; golden: AssistantCommand | UmlTextProposal } | { outcome: "REJECT" };
export type BenchmarkCase = {
  id: string;
  profile: BenchmarkProfile;
  inputSpanish: string;
  adapterInput: unknown;
  expected: BenchmarkExpected;
  knownClassIds?: readonly string[];
};
export type BenchmarkCaseResult = {
  id: string;
  profile: BenchmarkProfile;
  structuralValid: boolean;
  outcome: "ACCEPT" | "REJECT";
  correct: boolean;
  falsePositive: boolean;
  latencyMs: number;
  failure?: string;
};
export type BenchmarkMetrics = {
  validityRate: number;
  accuracy: number;
  falsePositives: number;
  rejectionRate: number;
  correctRejectionRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
};
export type BenchmarkReport = {
  metadata: { benchmark: "deterministic-parser-adapter"; executedAt: string; totalCases: number };
  modelAvailability: { qwenAvailable: false; inferenceExecuted: false; runtimeInstalled: false; modelDownloaded: false };
  configuration: { targetModel: "Qwen3 1.7B"; quantized: true; format: "GGUF"; runtime: "node-llama-cpp"; provider: "none" };
  hardware: { cpu: string; architecture: string; totalRamBytes: number; freeRamBytes: number; gpu: "N/A" };
  limitations: readonly string[];
  cases: readonly BenchmarkCaseResult[];
  metrics: BenchmarkMetrics;
  memory: { baselineBytes: number; peakBytes: number; deltaBytes: number; label: "RAM del benchmark determinista Node" };
  failures: readonly string[];
};
