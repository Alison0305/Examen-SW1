import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UmlImportProposal } from "@examen-sw1/uml-core";
import { describe, expect, it } from "vitest";
import { analyzeDiagram } from "../diagram-analyzer";
import { detectImageFormat, preprocessImage } from "../image-preprocessing";
import { renderSyntheticDiagram } from "../synthetic-diagram";
import { SYNTHETIC_CONDITIONS, SYNTHETIC_DIAGRAMS, expectedFromSynthetic, loadPhotoCases, renderCondition } from "./vlm-dataset";
import { expectedMultiplicity, matchNames, percentile, scoreProposal, summarize, sumScores, type ExpectedDiagram } from "./vlm-metrics";

const expected: ExpectedDiagram = {
  classes: [{ name: "Empresa", attributes: ["ruc", "nombre"] }, { name: "Empleado", attributes: ["sueldo"] }],
  enumerations: [{ name: "Estado" }],
  relationships: [
    { type: "Composition", source: "Empresa", target: "Empleado", sourceMultiplicity: "1", targetMultiplicity: "1..*" },
    { type: "Association", source: "Empleado", target: "Estado" },
  ],
};

const proposal: UmlImportProposal = {
  source: "image",
  classes: [
    { key: "C1", name: "Empressa", attributes: [{ key: "a", name: "ruc", type: "String" }, { key: "b", name: "telefono", type: "String" }] },
    { key: "C2", name: "Empleado", attributes: [{ key: "c", name: "sueido", type: "double" }] },
    { key: "C3", name: "Nota", attributes: [] },
  ],
  enumerations: [],
  relationships: [
    { key: "R1", type: "Composition", source: "C1", target: "C2", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    { key: "R2", type: "Association", source: "C3", target: "C2" },
  ],
  diagnostics: [],
};

describe("métricas del benchmark VLM", () => {
  it("empareja nombres uno a uno, exactos primero y luego con tolerancia de OCR", () => {
    expect([...matchNames(["Empresa", "Empleado"], ["empleado", "Empressa"], 0)]).toEqual([[1, 0]]);
    expect([...matchNames(["Empresa", "Empleado"], ["empleado", "Empressa"], 2)]).toEqual([[1, 0], [0, 1]]);
    expect([...matchNames(["Año"], ["ano"], 0)]).toEqual([[0, 0]]);
  });

  it("estricto: los errores de OCR en un nombre arrastran sus atributos y relaciones", () => {
    const summary = summarize(scoreProposal(proposal, expected, 0));
    expect(summary.classes).toMatchObject({ truePositives: 1, predicted: 3, expected: 3, falsePositives: 2, precision: 0.3333, recall: 0.3333 });
    expect(summary.attributes).toMatchObject({ truePositives: 0, predicted: 3, expected: 3 });
    expect(summary.relationships).toMatchObject({ truePositives: 0, predicted: 2, expected: 2, precision: 0, recall: 0 });
    expect(summary.multiplicities).toEqual({ accuracy: 0, correct: 0, expected: 2 });
  });

  it("con tolerancia: cuenta estructura, atributos y multiplicidades por extremo", () => {
    const summary = summarize(scoreProposal(proposal, expected, 2));
    expect(summary.classes).toMatchObject({ truePositives: 2, falsePositives: 1, recall: 0.6667 });
    expect(summary.attributes).toMatchObject({ truePositives: 2, predicted: 3, expected: 3 });
    expect(summary.relationships).toMatchObject({ truePositives: 1, predicted: 2, expected: 2, precision: 0.5, recall: 0.5 });
    expect(summary.multiplicities).toEqual({ accuracy: 0.5, correct: 1, expected: 2 });
  });

  it("la asociación coincide en cualquier sentido y conserva cada multiplicidad en su extremo", () => {
    const association: ExpectedDiagram = { classes: [{ name: "A", attributes: [] }, { name: "B", attributes: [] }], relationships: [{ type: "Association", source: "A", target: "B", sourceMultiplicity: "1", targetMultiplicity: "0..*" }] };
    const reversed: UmlImportProposal = { source: "image", classes: [{ key: "K1", name: "B", attributes: [] }, { key: "K2", name: "A", attributes: [] }], enumerations: [], relationships: [{ key: "R", type: "Association", source: "K1", target: "K2", sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 1, upper: 1 } }], diagnostics: [] };
    expect(summarize(scoreProposal(reversed, association)).multiplicities).toEqual({ accuracy: 1, correct: 2, expected: 2 });
    const generalization: ExpectedDiagram = { ...association, relationships: [{ type: "Generalization", source: "A", target: "B" }] };
    const wrongDirection = { ...reversed, relationships: [{ key: "R", type: "Generalization" as const, source: "K1", target: "K2" }] };
    expect(summarize(scoreProposal(wrongDirection, generalization)).relationships.truePositives).toBe(0);
  });

  it("lee las multiplicidades esperadas con la notación de la imagen", () => {
    expect(expectedMultiplicity("1...*")).toEqual({ lower: 1, upper: "unbounded" });
    expect(expectedMultiplicity("1...1")).toEqual({ lower: 1, upper: 1 });
    expect(expectedMultiplicity("n")).toEqual({ lower: 0, upper: "unbounded" });
    expect(expectedMultiplicity("*(pedido, único)")).toEqual({ lower: 0, upper: "unbounded" });
    expect(expectedMultiplicity("0..1 {ordered}")).toEqual({ lower: 0, upper: 1 });
  });

  it("agrega casos y calcula percentiles; sin datos reporta null en lugar de inventar", () => {
    const total = sumScores([scoreProposal(proposal, expected, 2), scoreProposal(proposal, expected, 2)]);
    expect(total.classes).toEqual({ truePositives: 4, predicted: 6, expected: 6 });
    expect(summarize(sumScores([])).classes.precision).toBeNull();
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("dataset del benchmark VLM", () => {
  it("con OCR ideal, el analizador reconoce por completo cada captura sintética", async () => {
    for (const diagram of Object.values(SYNTHETIC_DIAGRAMS)) {
      const image = await preprocessImage(await renderCondition(diagram, "captura"), { maxSide: 1024, maxInputPixels: 40_000_000, minSide: 32 });
      const summary = summarize(scoreProposal(analyzeDiagram(image, renderSyntheticDiagram(diagram).lines), expectedFromSynthetic(diagram)));
      expect([summary.classes.recall, summary.classes.precision, summary.attributes.recall, summary.relationships.recall, summary.relationships.precision]).toEqual([1, 1, 1, 1, 1]);
      expect(summary.multiplicities.accuracy ?? 1).toBe(1);
    }
  });

  it("genera las variantes de forma determinista y con el formato esperado", async () => {
    const diagram = SYNTHETIC_DIAGRAMS["tienda-asociacion"]!;
    for (const condition of SYNTHETIC_CONDITIONS) {
      const first = await renderCondition(diagram, condition);
      expect(first.equals(await renderCondition(diagram, condition))).toBe(true);
      expect(detectImageFormat(first)).toBe(condition === "ruido-jpeg" ? "jpeg" : "png");
    }
  });

  it("deriva el resultado esperado con las convenciones de importación", () => {
    expect(expectedFromSynthetic(SYNTHETIC_DIAGRAMS["empresa-marcas"]!).relationships).toEqual([
      { type: "Generalization", source: "Empleado", target: "Persona" },
      { type: "Composition", source: "Empresa", target: "Empleado", sourceMultiplicity: "1", targetMultiplicity: "1..*" },
      { type: "Aggregation", source: "Equipo", target: "Empleado", sourceMultiplicity: "0..1", targetMultiplicity: "*" },
    ]);
    expect(expectedFromSynthetic(SYNTHETIC_DIAGRAMS["factura-enumeracion"]!).enumerations).toEqual([{ name: "EstadoFactura", literals: ["PENDIENTE", "PAGADA", "ANULADA"] }]);
  });

  it("lee las fotos reales desde expected.json fuera del repositorio y rechaza casos mal escritos", () => {
    const folder = mkdtempSync(join(tmpdir(), "vlm-photos-"));
    writeFileSync(join(folder, "expected.json"), JSON.stringify([{ file: "pizarra.jpg", condition: "foto-pizarra", expected: { classes: [{ name: "A", attributes: [] }], relationships: [] } }]));
    expect(loadPhotoCases(folder)).toEqual([{ id: "pizarra.jpg", file: join(folder, "pizarra.jpg"), condition: "foto-pizarra", expected: { classes: [{ name: "A", attributes: [] }], relationships: [] } }]);
    writeFileSync(join(folder, "expected.json"), JSON.stringify([{ file: "x.jpg", expected: { classes: "A" } }]));
    expect(() => loadPhotoCases(folder)).toThrow("Caso inválido");
  });
});
