import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { renderSyntheticDiagram, type SyntheticDiagram, type SyntheticMarker } from "../synthetic-diagram";
import type { ExpectedDiagram, ExpectedRelationship } from "./vlm-metrics";

// VLM benchmark dataset. Synthetic screenshots are generated from these definitions (nothing binary is
// versioned) and derived into degraded variants; real photos come from a folder outside the repository.

export const SYNTHETIC_DIAGRAMS: Readonly<Record<string, SyntheticDiagram>> = {
  "tienda-asociacion": {
    width: 820, height: 300,
    classes: [
      { name: "Cliente", x: 40, y: 60, attributes: ["- nombre : String", "- correo : String", "- edad : int"] },
      { name: "Pedido", x: 560, y: 60, attributes: ["- fecha : Date", "- total : double"] },
    ],
    connectors: [{ from: "Cliente", to: "Pedido", fromLabel: "1", toLabel: "0..*" }],
  },
  "empresa-marcas": {
    width: 1000, height: 420,
    classes: [
      { name: "Persona", x: 390, y: 30, attributes: ["- nombre : String", "- edad : int"] },
      { name: "Empleado", x: 390, y: 260, attributes: ["- sueldo : double"] },
      { name: "Empresa", x: 40, y: 260, attributes: ["- ruc : String"] },
      { name: "Equipo", x: 740, y: 260, attributes: ["- nombre : String"] },
    ],
    connectors: [
      { from: "Empleado", to: "Persona", toMarker: "triangle" },
      { from: "Empresa", to: "Empleado", fromMarker: "filledDiamond", fromLabel: "1", toLabel: "1..*" },
      { from: "Equipo", to: "Empleado", fromMarker: "hollowDiamond", fromLabel: "0..1", toLabel: "*" },
    ],
  },
  "factura-enumeracion": {
    width: 860, height: 340,
    classes: [
      { name: "EstadoFactura", x: 40, y: 40, stereotype: "enumeration", attributes: ["PENDIENTE", "PAGADA", "ANULADA"] },
      { name: "Factura", x: 330, y: 40, attributes: ["- numero : String", "- total : double", "- estado : EstadoFactura"], operations: ["+ calcularTotal() : double"] },
      { name: "Linea", x: 620, y: 40, attributes: ["- cantidad : int", "- precio : double"] },
    ],
    connectors: [{ from: "Factura", to: "Linea", fromMarker: "filledDiamond", fromLabel: "1", toLabel: "1..*" }],
  },
  "biblioteca": {
    width: 900, height: 560,
    classes: [
      { name: "Libro", x: 40, y: 40, attributes: ["- titulo : String", "- isbn : String", "- anio : int"] },
      { name: "Autor", x: 600, y: 40, attributes: ["- nombre : String"] },
      { name: "Prestamo", x: 40, y: 340, attributes: ["- desde : Date", "- hasta : Date", "- devuelto : boolean"] },
      { name: "Socio", x: 600, y: 340, attributes: ["- codigo : String", "- nombre : String"] },
    ],
    connectors: [
      { from: "Libro", to: "Autor", fromLabel: "1..*", toLabel: "1..*" },
      { from: "Prestamo", to: "Libro", fromLabel: "0..*", toLabel: "1" },
      { from: "Socio", to: "Prestamo", fromLabel: "1", toLabel: "0..*" },
    ],
  },
  "vehiculos": {
    width: 900, height: 460,
    classes: [
      { name: "Vehiculo", x: 300, y: 30, width: 300, attributes: ["# placa : String", "# modelo : String"] },
      { name: "Auto", x: 160, y: 280, attributes: ["- puertas : int"] },
      { name: "Moto", x: 480, y: 280, attributes: ["- cilindrada : int"] },
    ],
    connectors: [
      { from: "Auto", to: "Vehiculo", toMarker: "triangle" },
      { from: "Moto", to: "Vehiculo", toMarker: "triangle" },
    ],
  },
  "inventario": {
    width: 860, height: 380,
    classes: [
      { name: "Producto", x: 40, y: 40, attributes: ["- codigo : String", "- nombre : String", "- precio : double", "- stock : int", "- activo : boolean", "- alta : Date"] },
      { name: "Categoria", x: 580, y: 40, attributes: ["- nombre : String", "- descripcion : String"] },
    ],
    connectors: [{ from: "Producto", to: "Categoria", fromLabel: "0..*", toLabel: "1" }],
  },
};

const ATTRIBUTE_NAME = /^[+\-#~]?\s*([\p{L}_][\p{L}\p{N}_]*)/u;

function endType(marker: SyntheticMarker | undefined) {
  return marker === "triangle" ? "Generalization" : marker === "filledDiamond" ? "Composition" : marker === "hollowDiamond" ? "Aggregation" : undefined;
}

// Expected result straight from the definition, using the import conventions of the analyzer.
export function expectedFromSynthetic(diagram: SyntheticDiagram): ExpectedDiagram {
  const isEnumeration = (name: string) => diagram.classes.some((entry) => entry.name === name && entry.stereotype?.toLowerCase().startsWith("enum"));
  const relationships = (diagram.connectors ?? []).map((connector): ExpectedRelationship => {
    const atTo = endType(connector.toMarker);
    const atFrom = endType(connector.fromMarker);
    const labels = { fromLabel: connector.fromLabel, toLabel: connector.toLabel };
    if (atTo) {
      // The marked end is the parent (generalization) or the whole (diamonds).
      return atTo === "Generalization"
        ? { type: atTo, source: connector.from, target: connector.to }
        : { type: atTo, source: connector.to, target: connector.from, ...(labels.toLabel ? { sourceMultiplicity: labels.toLabel } : {}), ...(labels.fromLabel ? { targetMultiplicity: labels.fromLabel } : {}) };
    }
    if (atFrom) {
      return atFrom === "Generalization"
        ? { type: atFrom, source: connector.to, target: connector.from }
        : { type: atFrom, source: connector.from, target: connector.to, ...(labels.fromLabel ? { sourceMultiplicity: labels.fromLabel } : {}), ...(labels.toLabel ? { targetMultiplicity: labels.toLabel } : {}) };
    }
    return { type: "Association", source: connector.from, target: connector.to, ...(labels.fromLabel ? { sourceMultiplicity: labels.fromLabel } : {}), ...(labels.toLabel ? { targetMultiplicity: labels.toLabel } : {}) };
  });
  return {
    classes: diagram.classes.filter((entry) => !isEnumeration(entry.name)).map((entry) => ({ name: entry.name, attributes: (entry.attributes ?? []).map((attribute) => ATTRIBUTE_NAME.exec(attribute)?.[1] ?? attribute) })),
    enumerations: diagram.classes.filter((entry) => isEnumeration(entry.name)).map((entry) => ({ name: entry.name, literals: [...(entry.attributes ?? [])] })),
    relationships,
  };
}

export const SYNTHETIC_CONDITIONS = ["captura", "rotada-3", "baja-resolucion", "ruido-jpeg"] as const;
export type SyntheticCondition = (typeof SYNTHETIC_CONDITIONS)[number];

// Deterministic pseudo-random sequence so the noisy variant is identical on every run.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export async function renderCondition(diagram: SyntheticDiagram, condition: SyntheticCondition): Promise<Buffer> {
  const png = await sharp(Buffer.from(renderSyntheticDiagram(diagram).svg)).png().toBuffer();
  switch (condition) {
    case "captura":
      return png;
    case "rotada-3":
      return sharp(png).rotate(3, { background: "#ffffff" }).png().toBuffer();
    case "baja-resolucion":
      return sharp(png).resize({ width: Math.round(diagram.width * 0.5) }).png().toBuffer();
    case "ruido-jpeg": {
      const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
      const random = seeded(diagram.width * 7919 + diagram.height);
      const noisy = Buffer.from(data.map((value) => Math.max(0, Math.min(255, Math.round(value + (random() - 0.5) * 80)))));
      return sharp(noisy, { raw: { width: info.width, height: info.height, channels: 1 } }).jpeg({ quality: 40 }).toBuffer();
    }
  }
}

export type PhotoCase = Readonly<{ id: string; file: string; condition: string; expected: ExpectedDiagram }>;

// <dir>/expected.json: [{ "file": "pizarra-1.jpg", "condition": "foto-pizarra", "expected": { classes, enumerations?, relationships } }]
export function loadPhotoCases(directory: string): PhotoCase[] {
  const entries = JSON.parse(readFileSync(join(directory, "expected.json"), "utf8")) as Array<{ file: string; condition?: string; expected: ExpectedDiagram }>;
  if (!Array.isArray(entries)) throw new Error("expected.json debe ser una lista de casos.");
  return entries.map((entry) => {
    if (typeof entry.file !== "string" || !entry.expected || !Array.isArray(entry.expected.classes) || !Array.isArray(entry.expected.relationships)) throw new Error(`Caso inválido en expected.json: ${JSON.stringify(entry).slice(0, 120)}`);
    return { id: entry.file, file: join(directory, entry.file), condition: entry.condition ?? "foto", expected: entry.expected };
  });
}
