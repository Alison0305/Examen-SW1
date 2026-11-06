import { describe, expect, it } from "vitest";
import { buildDataInterpretationSchema, buildUmlInterpretationSchema } from "../interpretation.js";
import { calculateModelBenchmarkMetrics, evaluateModelBenchmarkCase, MODEL_BENCHMARK_CLASSES, MODEL_BENCHMARK_CORPUS, MODEL_BENCHMARK_MANIFEST, type ModelBenchmarkCase } from "./model-benchmark.js";

const find = (id: string): ModelBenchmarkCase => MODEL_BENCHMARK_CORPUS.find((item) => item.id === id)!;

describe("corpus del benchmark con modelo", () => {
  it("tiene ids únicos, cubre todas las categorías y ambos modos", () => {
    expect(new Set(MODEL_BENCHMARK_CORPUS.map((item) => item.id)).size).toBe(MODEL_BENCHMARK_CORPUS.length);
    expect(new Set(MODEL_BENCHMARK_CORPUS.map((item) => item.category))).toEqual(new Set(["base", "sinonimo", "error-stt", "mayusculas-acentos", "fuera-de-dominio"]));
    expect(MODEL_BENCHMARK_CORPUS.filter((item) => item.mode === "uml").length).toBeGreaterThan(0);
    expect(MODEL_BENCHMARK_CORPUS.filter((item) => item.mode === "data").length).toBeGreaterThan(0);
  });

  it("solo espera ids de clases y entidades que existen en el contexto del benchmark", () => {
    const ids = new Set(MODEL_BENCHMARK_CLASSES.map((item) => item.id));
    for (const item of MODEL_BENCHMARK_CORPUS) {
      if (item.expected.outcome !== "ACCEPT") continue;
      if ("proposal" in item.expected && item.expected.proposal.type !== "CREATE_CLASS") expect(ids.has(item.expected.proposal.targetId)).toBe(true);
      if ("command" in item.expected) expect(item.expected.command.entity).toBe("usuario");
    }
    expect(JSON.stringify(buildUmlInterpretationSchema(MODEL_BENCHMARK_CLASSES))).toContain('"enum":["Paciente","Doctor"]');
    expect(JSON.stringify(buildDataInterpretationSchema(MODEL_BENCHMARK_MANIFEST))).toContain('"const":"usuario"');
  });
});

describe("evaluación de casos con modelo", () => {
  it("acepta propuestas UML exactas y compara datos sin distinguir mayúsculas", () => {
    expect(evaluateModelBenchmarkCase(find("uml-create-001"), { ok: true, mode: "uml", source: "model", proposal: { type: "CREATE_CLASS", name: "Cita" } }, 10)).toMatchObject({ outcome: "ACCEPT", correct: true, falsePositive: false });
    expect(evaluateModelBenchmarkCase(find("uml-create-001"), { ok: true, mode: "uml", source: "model", proposal: { type: "CREATE_CLASS", name: "cita" } }, 10)).toMatchObject({ correct: false });
    expect(evaluateModelBenchmarkCase(find("data-search-001"), { ok: true, mode: "data", source: "model", command: { operation: "SEARCH", entity: "usuario", criteria: { query: "Ana" } } }, 10)).toMatchObject({ correct: true });
  });

  it("distingue falsos positivos, rechazos correctos y fallos estructurales", () => {
    expect(evaluateModelBenchmarkCase(find("uml-reject-005"), { ok: true, mode: "uml", source: "model", proposal: { type: "DELETE_CLASS", targetId: "22222222-2222-4222-8222-222222222222" } }, 10)).toMatchObject({ outcome: "ACCEPT", correct: false, falsePositive: true });
    expect(evaluateModelBenchmarkCase(find("uml-reject-001"), { ok: false, mode: "uml", diagnostic: { code: "OUT_OF_DOMAIN", message: "x" } }, 10)).toMatchObject({ outcome: "REJECT", correct: true, structuralValid: true });
    expect(evaluateModelBenchmarkCase(find("uml-create-001"), { ok: false, mode: "uml", diagnostic: { code: "TIMEOUT", message: "x" } }, 10)).toMatchObject({ outcome: "REJECT", correct: false, structuralValid: false });
  });

  it("calcula accuracy, rechazos correctos, aceptaciones erróneas y percentiles", () => {
    const corpus = [find("uml-create-001"), find("uml-reject-001"), find("uml-reject-005"), find("data-list-001")];
    const results = [
      evaluateModelBenchmarkCase(corpus[0]!, { ok: true, mode: "uml", source: "model", proposal: { type: "CREATE_CLASS", name: "Cita" } }, 100),
      evaluateModelBenchmarkCase(corpus[1]!, { ok: false, mode: "uml", diagnostic: { code: "OUT_OF_DOMAIN", message: "x" } }, 200),
      evaluateModelBenchmarkCase(corpus[2]!, { ok: true, mode: "uml", source: "model", proposal: { type: "DELETE_CLASS", targetId: "22222222-2222-4222-8222-222222222222" } }, 300),
      evaluateModelBenchmarkCase(corpus[3]!, { ok: true, mode: "data", source: "model", command: { operation: "COUNT", entity: "usuario" } }, 400),
    ];
    expect(calculateModelBenchmarkMetrics(results, corpus)).toEqual({
      totalCases: 4, accuracy: 50, structuralValidity: 100, falsePositives: 1, correctRejections: 50, wrongAcceptances: 1, latencyP50Ms: 200, latencyP95Ms: 400,
      byCategory: { base: { total: 2, correct: 1 }, "fuera-de-dominio": { total: 2, correct: 1 } },
    });
  });
});
