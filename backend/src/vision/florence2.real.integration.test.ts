import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeDiagram } from "./diagram-analyzer";
import { Florence2OcrEngine } from "./florence2-ocr-engine";
import { preprocessImage } from "./image-preprocessing";
import { QueuedOcrEngine } from "./ocr-engine";
import { renderSyntheticDiagram } from "./synthetic-diagram";
import { getVisionConfig } from "./vision.config";

const config = getVisionConfig();
const describeFlorenceIntegration = config.modelPath ? describe : describe.skip;
const MODEL_LOAD_TIMEOUT_MS = 180_000;
// OCR may misspell a word (observed: "Empressa"); accuracy is measured by the VLM benchmark, not here.
const OCR_TOLERANCE = 2;

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length]!;
}

const closeTo = (expected: readonly string[]) => (received: readonly string[]) => received.length === expected.length && received.every((value, index) => editDistance(value, expected[index]!) <= OCR_TOLERANCE);

// Runs only with VISION_MODEL_PATH set: real Florence-2 OCR over a synthetic screenshot with known content.
describeFlorenceIntegration("Florence-2 real local mediante Transformers.js", () => {
  const ocr = new QueuedOcrEngine(new Florence2OcrEngine({ modelPath: config.modelPath!, dtype: config.dtype }), { timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });

  afterAll(async () => {
    await ocr.dispose();
  });

  it("reconoce clases, atributos y relaciones de una captura sintética", async () => {
    const { svg } = renderSyntheticDiagram({
      width: 1000, height: 420,
      classes: [
        { name: "Persona", x: 390, y: 30, attributes: ["- nombre : String", "- edad : int"] },
        { name: "Empleado", x: 390, y: 260, attributes: ["- sueldo : double"] },
        { name: "Empresa", x: 40, y: 260, attributes: ["- ruc : String"] },
      ],
      connectors: [
        { from: "Empleado", to: "Persona", toMarker: "triangle" },
        { from: "Empresa", to: "Empleado", fromMarker: "filledDiamond" },
      ],
    });
    const image = await preprocessImage(await sharp(Buffer.from(svg)).png().toBuffer(), { maxSide: config.maxSide, maxInputPixels: config.maxInputPixels, minSide: config.minSide });

    const proposal = analyzeDiagram(image, await ocr.recognize(image));

    console.info("Florence-2 real:", JSON.stringify(proposal));
    // Structure comes from geometry and must be exact; names come from OCR and get a small tolerance.
    expect(proposal.classes.map((entry) => entry.key)).toEqual(["C1", "C2", "C3"]);
    expect(proposal.classes.map((entry) => entry.name)).toSatisfy(closeTo(["Persona", "Empresa", "Empleado"]));
    expect(proposal.classes[0]!.attributes.map((entry) => `${entry.name}:${entry.type}`)).toSatisfy(closeTo(["nombre:String", "edad:int"]));
    expect(proposal.relationships.map((entry) => `${entry.type}:${entry.source}->${entry.target}`).sort()).toEqual(["Composition:C2->C3", "Generalization:C3->C1"]);
  }, MODEL_LOAD_TIMEOUT_MS);
});
