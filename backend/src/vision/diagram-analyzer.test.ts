import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeDiagram, parseMultiplicityText, valueRange, type OcrLine } from "./diagram-analyzer";
import { preprocessImage } from "./image-preprocessing";
import { renderSyntheticDiagram, type SyntheticDiagram } from "./synthetic-diagram";

const LIMITS = { maxSide: 1024, maxInputPixels: 40_000_000, minSide: 32 };

async function analyze(diagram: SyntheticDiagram, transformLines: (lines: OcrLine[]) => OcrLine[] = (lines) => lines) {
  const { svg, lines } = renderSyntheticDiagram(diagram);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const image = await preprocessImage(png, LIMITS);
  return analyzeDiagram(image, transformLines(lines));
}

const codes = (proposal: { diagnostics: ReadonlyArray<{ code: string }> }) => proposal.diagnostics.map((entry) => entry.code);

describe("analyzeDiagram", () => {
  it("reconoce dos clases con atributos y una asociación con multiplicidades", async () => {
    const proposal = await analyze({
      width: 800, height: 320,
      classes: [
        { name: "Cliente", x: 40, y: 60, attributes: ["- nombre : String", "- edad : int"] },
        { name: "Pedido", x: 520, y: 60, attributes: ["- fecha : Date", "+ total : double"] },
      ],
      connectors: [{ from: "Cliente", to: "Pedido", fromLabel: "1", toLabel: "0..*" }],
    });

    expect(proposal.classes).toEqual([
      { key: "C1", name: "Cliente", attributes: [
        { key: "C1.A1", name: "nombre", type: "String", visibility: "private" },
        { key: "C1.A2", name: "edad", type: "int", visibility: "private" },
      ] },
      { key: "C2", name: "Pedido", attributes: [
        { key: "C2.A1", name: "fecha", type: "Date", visibility: "private" },
        { key: "C2.A2", name: "total", type: "double", visibility: "public" },
      ] },
    ]);
    expect(proposal.relationships).toEqual([{ key: "R1", type: "Association", source: "C1", target: "C2", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }]);
    expect(proposal.diagnostics).toEqual([]);
  });

  it("distingue generalización, composición y agregación por la marca del extremo", async () => {
    const proposal = await analyze({
      width: 1000, height: 420,
      classes: [
        { name: "Persona", x: 390, y: 30, attributes: ["- nombre : String"] },
        { name: "Empleado", x: 390, y: 260, attributes: ["- sueldo : double"] },
        { name: "Empresa", x: 40, y: 260, attributes: ["- ruc : String"] },
        { name: "Equipo", x: 740, y: 260, attributes: ["- nombre : String"] },
      ],
      connectors: [
        { from: "Empleado", to: "Persona", toMarker: "triangle" },
        { from: "Empresa", to: "Empleado", fromMarker: "filledDiamond" },
        { from: "Equipo", to: "Empleado", fromMarker: "hollowDiamond" },
      ],
    });

    const byNames = proposal.relationships.map((entry) => {
      const name = (key: string) => proposal.classes.find((candidate) => candidate.key === key)?.name;
      return `${entry.type}:${name(entry.source)}->${name(entry.target)}`;
    }).sort();
    expect(byNames).toEqual(["Aggregation:Equipo->Empleado", "Composition:Empresa->Empleado", "Generalization:Empleado->Persona"]);
  });

  it("reconoce enumeraciones por su estereotipo y omite operaciones con diagnóstico", async () => {
    const proposal = await analyze({
      width: 700, height: 300,
      classes: [
        { name: "Estado", x: 40, y: 40, stereotype: "enumeration", attributes: ["NUEVO", "ENVIADO"] },
        { name: "Factura", x: 400, y: 40, attributes: ["- total : double"], operations: ["+ calcular() : double"] },
      ],
    });

    expect(proposal.enumerations).toEqual([{ key: "C1", name: "Estado", literals: ["NUEVO", "ENVIADO"] }]);
    expect(proposal.classes.map((entry) => entry.name)).toEqual(["Factura"]);
    expect(proposal.classes[0]!.attributes).toHaveLength(1);
    expect(codes(proposal)).toEqual(["IMAGE_OPERATIONS_OMITTED"]);
  });

  it("devuelve una propuesta vacía con diagnóstico cuando la imagen no contiene un diagrama", async () => {
    const proposal = await analyze({ width: 400, height: 300, classes: [], freeTexts: [{ text: "Lista de compras", x: 40, y: 60 }] });
    expect(proposal.classes).toEqual([]);
    expect(proposal.relationships).toEqual([]);
    expect(codes(proposal)).toEqual(["IMAGE_NO_DIAGRAM", "IMAGE_UNASSIGNED_TEXT"]);
  });

  it("no propone relaciones de conectores con un extremo suelto", async () => {
    const proposal = await analyze({
      width: 800, height: 320,
      classes: [{ name: "Cliente", x: 40, y: 60, attributes: ["- nombre : String"] }],
      danglingLines: [[261, 110, 520, 110]],
    });
    expect(proposal.classes).toHaveLength(1);
    expect(proposal.relationships).toEqual([]);
    expect(codes(proposal)).toEqual(["IMAGE_CONNECTOR_WITHOUT_END"]);
  });

  it("informa multiplicidades ilegibles en lugar de adivinarlas", async () => {
    const proposal = await analyze({
      width: 800, height: 320,
      classes: [{ name: "Cliente", x: 40, y: 60, attributes: ["- nombre : String"] }, { name: "Pedido", x: 520, y: 60, attributes: ["- fecha : Date"] }],
      connectors: [{ from: "Cliente", to: "Pedido", fromLabel: "1", toLabel: "0..*" }],
    }, (lines) => lines.map((line) => (line.text === "0..*" ? { ...line, text: "0.0." } : line)));

    expect(proposal.relationships[0]).toEqual({ key: "R1", type: "Association", source: "C1", target: "C2", sourceMultiplicity: { lower: 1, upper: 1 } });
    expect(proposal.diagnostics).toEqual([expect.objectContaining({ code: "IMAGE_ILLEGIBLE_MULTIPLICITY", key: "R1" })]);
  });

  it("propone un nombre para cajas sin texto legible y reporta atributos ilegibles", async () => {
    const proposal = await analyze({
      width: 700, height: 300,
      classes: [{ name: "Cliente", x: 40, y: 40, attributes: ["- nombre : String", "- edad : int"] }],
    }, (lines) => lines.filter((line) => line.text !== "Cliente").map((line) => (line.text === "- edad : int" ? { ...line, text: "%% ??" } : line)));

    expect(proposal.classes).toEqual([{ key: "C1", name: "ClaseSinNombre1", attributes: [{ key: "C1.A1", name: "nombre", type: "String", visibility: "private" }] }]);
    expect(codes(proposal)).toEqual(["IMAGE_CLASS_WITHOUT_NAME", "IMAGE_UNREADABLE_TEXT"]);
  });

  it("tolera guiones tipográficos y dos puntos repetidos del OCR", async () => {
    const proposal = await analyze({ width: 600, height: 260, classes: [{ name: "Empresa", x: 40, y: 40, attributes: ["- ruc : String", "+ activa : boolean"] }] }, (lines) => lines.map((line) => (line.text === "- ruc : String" ? { ...line, text: "- ruc : : String" } : line.text === "+ activa : boolean" ? { ...line, text: "— activa：boolean" } : line)));
    expect(proposal.classes[0]!.attributes).toEqual([{ key: "C1.A1", name: "ruc", type: "String", visibility: "private" }, { key: "C1.A2", name: "activa", type: "boolean", visibility: "private" }]);
    expect(proposal.diagnostics).toEqual([]);
  });

  it("es determinista", async () => {
    const diagram: SyntheticDiagram = { width: 800, height: 320, classes: [{ name: "A", x: 40, y: 60, attributes: ["- x : int"] }, { name: "B", x: 520, y: 60 }], connectors: [{ from: "A", to: "B", toLabel: "*" }] };
    expect(await analyze(diagram)).toEqual(await analyze(diagram));
  });
});

// fix-cu-10-mejorar-reconocimiento-imagenes, incremento 1: causes measured with the 19 real captures of CU-10.
describe("atributos sin tipo o con espacios", () => {
  const withBody = (texts: readonly string[]) => analyze(
    { width: 700, height: 320, classes: [{ name: "Lector", x: 40, y: 40, attributes: texts.map((_, index) => `- placeholder${index} : int`) }] },
    (lines) => lines.map((line) => { const match = /^- placeholder(\d+) : int$/.exec(line.text); return match ? { ...line, text: texts[Number(match[1])]! } : line; }),
  );

  it("acepta dos puntos sin tipo y propone String con diagnóstico", async () => {
    const proposal = await withBody(["-Nombre:"]);
    expect(proposal.classes[0]!.attributes).toEqual([{ key: "C1.A1", name: "Nombre", type: "String", visibility: "private" }]);
    expect(codes(proposal)).toEqual(["IMAGE_ATTRIBUTE_WITHOUT_TYPE"]);
  });

  it("une un nombre de varias palabras seguido de dos puntos y lo informa", async () => {
    const proposal = await withBody(["-ID del usuario: int", "+ Fecha de nacimiento :"]);
    expect(proposal.classes[0]!.attributes).toEqual([
      { key: "C1.A1", name: "IDDelUsuario", type: "int", visibility: "private" },
      { key: "C1.A2", name: "FechaDeNacimiento", type: "String", visibility: "public" },
    ]);
    expect(codes(proposal)).toEqual(["IMAGE_ATTRIBUTE_NAME_JOINED", "IMAGE_ATTRIBUTE_NAME_JOINED", "IMAGE_ATTRIBUTE_WITHOUT_TYPE"]);
  });

  it("sin dos puntos solo acepta una palabra: varias palabras sueltas no se convierten en atributo", async () => {
    const proposal = await withBody(["- telefono", "datos de contacto"]);
    expect(proposal.classes[0]!.attributes).toEqual([{ key: "C1.A1", name: "telefono", type: "String", visibility: "private" }]);
    expect(codes(proposal)).toEqual(["IMAGE_ATTRIBUTE_WITHOUT_TYPE", "IMAGE_UNREADABLE_TEXT"]);
  });

  it("sigue omitiendo las operaciones, también con nombre y tipo", async () => {
    const proposal = await withBody(["- total : float", "+calcularTotal(): float"]);
    expect(proposal.classes[0]!.attributes).toEqual([{ key: "C1.A1", name: "total", type: "float", visibility: "private" }]);
    expect(codes(proposal)).toEqual(["IMAGE_OPERATIONS_OMITTED"]);
  });
});

describe("regiones cerradas sin texto", () => {
  async function withShapes(shapes: string) {
    const { svg, lines } = renderSyntheticDiagram({
      width: 900, height: 420,
      classes: [
        { name: "Cliente", x: 40, y: 40, attributes: ["- nombre : String"] },
        { name: "Pedido", x: 600, y: 40, attributes: ["- fecha : Date"] },
      ],
      connectors: [{ from: "Cliente", to: "Pedido" }],
    });
    const png = await sharp(Buffer.from(svg.replace("</svg>", `${shapes}</svg>`))).png().toBuffer();
    return analyzeDiagram(await preprocessImage(png, LIMITS), lines);
  }
  // Two empty cells, like a background grid or an unlabeled frame.
  const cells = `<rect x="80" y="300" width="160" height="80" fill="none" stroke="#000" stroke-width="2"/><rect x="600" y="300" width="160" height="80" fill="none" stroke="#000" stroke-width="2"/>`;

  it("no las propone como clases y lo informa con el número descartado", async () => {
    const proposal = await withShapes(cells);
    expect(proposal.classes.map((entry) => [entry.key, entry.name])).toEqual([["C1", "Cliente"], ["C2", "Pedido"]]);
    expect(proposal.relationships).toEqual([{ key: "R1", type: "Association", source: "C1", target: "C2" }]);
    expect(proposal.diagnostics).toEqual([expect.objectContaining({ code: "IMAGE_EMPTY_REGIONS_DISCARDED", message: expect.stringContaining("2 región") })]);
  });

  it("una línea entre una clase y una región sin texto no es una relación", async () => {
    const proposal = await withShapes(`${cells}<line x1="160" y1="300" x2="160" y2="160" stroke="#000" stroke-width="2"/>`);
    expect(proposal.relationships.map((entry) => `${entry.source}->${entry.target}`)).toEqual(["C1->C2"]);
    expect(codes(proposal)).not.toContain("IMAGE_CONNECTOR_WITHOUT_END");
  });
});

// Incremento 2, problema 1: filled headers with white names (real captures 223837 in blue and 224343 in green).
describe("cabeceras con relleno de color", () => {
  it.each([["azul", "#4472C4"], ["verde", "#7CB342"], ["gris oscuro", "#404040"]])("reconoce el nombre de una cabecera rellena %s y sus atributos", async (_color, fill) => {
    const proposal = await analyze({
      width: 820, height: 340,
      classes: [
        { name: "Lector", x: 40, y: 60, headerFill: fill, attributes: ["- nombre : String", "- telefono : String"], operations: ["+ reservar() : void"] },
        { name: "Pedido", x: 560, y: 60, attributes: ["- fecha : Date"] },
      ],
      connectors: [{ from: "Lector", to: "Pedido", fromLabel: "1", toLabel: "0..*" }],
    });

    expect(proposal.classes).toEqual([
      { key: "C1", name: "Lector", attributes: [
        { key: "C1.A1", name: "nombre", type: "String", visibility: "private" },
        { key: "C1.A2", name: "telefono", type: "String", visibility: "private" },
      ] },
      { key: "C2", name: "Pedido", attributes: [{ key: "C2.A1", name: "fecha", type: "Date", visibility: "private" }] },
    ]);
    expect(proposal.relationships).toEqual([{ key: "R1", type: "Association", source: "C1", target: "C2", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }]);
    expect(codes(proposal)).toEqual(["IMAGE_OPERATIONS_OMITTED"]);
  });

  it("varias clases con cabecera rellena unidas por herencia y composición", async () => {
    const proposal = await analyze({
      width: 1000, height: 440,
      classes: [
        { name: "Persona", x: 390, y: 30, headerFill: "#4472C4", attributes: ["- nombre : String"] },
        { name: "Empleado", x: 390, y: 270, headerFill: "#4472C4", attributes: ["- sueldo : double"] },
        { name: "Empresa", x: 40, y: 270, headerFill: "#4472C4", attributes: ["- ruc : String"] },
      ],
      connectors: [
        { from: "Empleado", to: "Persona", toMarker: "triangle" },
        { from: "Empresa", to: "Empleado", fromMarker: "filledDiamond" },
      ],
    });

    const name = (key: string) => proposal.classes.find((candidate) => candidate.key === key)?.name;
    expect(proposal.classes.map((entry) => entry.name).sort()).toEqual(["Empleado", "Empresa", "Persona"]);
    expect(proposal.relationships.map((entry) => `${entry.type}:${name(entry.source)}->${name(entry.target)}`).sort()).toEqual(["Composition:Empresa->Empleado", "Generalization:Empleado->Persona"]);
  });
});

describe("parseMultiplicityText", () => {
  it.each([
    ["1", { lower: 1, upper: 1 }],
    ["*", { lower: 0, upper: "unbounded" }],
    ["0..*", { lower: 0, upper: "unbounded" }],
    ["0.*", { lower: 0, upper: "unbounded" }],
    ["1…*", { lower: 1, upper: "unbounded" }],
    ["0..n", { lower: 0, upper: "unbounded" }],
    ["0 .. 1", { lower: 0, upper: 1 }],
    ["2..5", { lower: 2, upper: 5 }],
  ])("lee %s", (text, expected) => expect(parseMultiplicityText(text)).toEqual(expected));

  it.each(["0.0.", "5..2", "abc", "", "1..0"])("rechaza %s", (text) => expect(parseMultiplicityText(text)).toBeUndefined());
});

describe("conectores grandes", () => {
  // Regression (Railway, 2026-11-11): a connector with hundreds of thousands of pixels overflowed the call stack in
  // `Math.max(...pixels)` ("Maximum call stack size exceeded") and the import failed with a 500.
  it("analiza un conector muy grueso sin desbordar la pila", async () => {
    const { svg, lines } = renderSyntheticDiagram({
      width: 1024, height: 1024,
      classes: [
        { name: "Cliente", x: 20, y: 20, attributes: ["- nombre : String"] },
        { name: "Pedido", x: 760, y: 20, attributes: ["- fecha : Date"] },
      ],
    });
    // A solid band joining both boxes: about 500 000 dark pixels in one component.
    const band = `<rect x="200" y="60" width="580" height="940" fill="#000000"/>`;
    const png = await sharp(Buffer.from(svg.replace("</svg>", `${band}</svg>`))).png().toBuffer();
    const image = await preprocessImage(png, LIMITS);

    expect(() => analyzeDiagram(image, lines)).not.toThrow();
  });
});

describe("valueRange", () => {
  it("calcula mínimo y máximo de listas más grandes que el límite de argumentos", () => {
    // 7919 is coprime with 1 000 000, so this is a permutation of 0..999 999.
    const values = Array.from({ length: 1_000_000 }, (_, index) => (index * 7919) % 1_000_000);
    expect(valueRange(values)).toEqual({ min: 0, max: 999_999 });
    expect(valueRange([3, -2, 9])).toEqual({ min: -2, max: 9 });
    expect(valueRange([])).toEqual({ min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY });
  });
});
