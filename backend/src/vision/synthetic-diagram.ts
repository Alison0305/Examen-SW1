import type { OcrLine } from "./diagram-analyzer";

// Synthetic class diagrams for tests and the VLM benchmark: SVG plus the OCR lines its texts would produce.

export type SyntheticClass = Readonly<{ name: string; x: number; y: number; width?: number; stereotype?: string; attributes?: readonly string[]; operations?: readonly string[] }>;
export type SyntheticMarker = "none" | "triangle" | "hollowDiamond" | "filledDiamond";
export type SyntheticConnector = Readonly<{ from: string; to: string; fromMarker?: SyntheticMarker; toMarker?: SyntheticMarker; fromLabel?: string; toLabel?: string }>;
export type SyntheticDiagram = Readonly<{ width: number; height: number; classes: readonly SyntheticClass[]; connectors?: readonly SyntheticConnector[]; danglingLines?: ReadonlyArray<readonly [number, number, number, number]>; freeTexts?: ReadonlyArray<Readonly<{ text: string; x: number; y: number }>> }>;

const FONT_SIZE = 16;
const LINE_HEIGHT = 24;
const HEADER_HEIGHT = 34;
const CHAR_WIDTH = 8.5;
const DEFAULT_WIDTH = 220;

type Rendered = { svg: string[]; lines: OcrLine[] };

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(rendered: Rendered, value: string, x: number, baseline: number, bold = false) {
  rendered.svg.push(`<text x="${x}" y="${baseline}"${bold ? ' font-weight="bold"' : ""}>${escapeXml(value)}</text>`);
  rendered.lines.push({ text: value, box: { left: x, top: baseline - 13, right: Math.round(x + value.length * CHAR_WIDTH), bottom: baseline + 4 } });
}

export function classBounds(entry: SyntheticClass) {
  const header = HEADER_HEIGHT + (entry.stereotype ? LINE_HEIGHT : 0);
  const attributes = Math.max(1, entry.attributes?.length ?? 0) * LINE_HEIGHT + 12;
  const operations = entry.operations?.length ? entry.operations.length * LINE_HEIGHT + 12 : 0;
  const boxWidth = entry.width ?? DEFAULT_WIDTH;
  return { left: entry.x, top: entry.y, right: entry.x + boxWidth, bottom: entry.y + header + attributes + operations, header, attributes };
}

function renderClass(rendered: Rendered, entry: SyntheticClass) {
  const bounds = classBounds(entry);
  const boxWidth = bounds.right - bounds.left;
  rendered.svg.push(`<rect x="${bounds.left}" y="${bounds.top}" width="${boxWidth}" height="${bounds.bottom - bounds.top}" fill="#ffffff" stroke="#000000" stroke-width="2"/>`);
  const centered = (value: string) => Math.round(bounds.left + (boxWidth - value.length * CHAR_WIDTH) / 2);
  let baseline = bounds.top + 23;
  if (entry.stereotype) {
    text(rendered, `«${entry.stereotype}»`, centered(`«${entry.stereotype}»`), baseline);
    baseline += LINE_HEIGHT;
  }
  text(rendered, entry.name, centered(entry.name), baseline, true);
  const attributesTop = bounds.top + bounds.header;
  rendered.svg.push(`<line x1="${bounds.left}" y1="${attributesTop}" x2="${bounds.right}" y2="${attributesTop}" stroke="#000000" stroke-width="2"/>`);
  (entry.attributes ?? []).forEach((attribute, index) => text(rendered, attribute, bounds.left + 10, attributesTop + 22 + index * LINE_HEIGHT));
  if (entry.operations?.length) {
    const operationsTop = attributesTop + bounds.attributes;
    rendered.svg.push(`<line x1="${bounds.left}" y1="${operationsTop}" x2="${bounds.right}" y2="${operationsTop}" stroke="#000000" stroke-width="2"/>`);
    entry.operations.forEach((operation, index) => text(rendered, operation, bounds.left + 10, operationsTop + 22 + index * LINE_HEIGHT));
  }
}

// Marker polygon with its tip on the class border at (x, y), pointing towards the class along (dx, dy).
function marker(rendered: Rendered, kind: SyntheticMarker, x: number, y: number, dx: number, dy: number): number {
  if (kind === "none") return 0;
  const px = -dy;
  const py = dx;
  const length = kind === "triangle" ? 18 : 26;
  const half = kind === "triangle" ? 10 : 8;
  const point = (along: number, across: number) => `${x - dx * along + px * across},${y - dy * along + py * across}`;
  const points = kind === "triangle"
    ? [point(0, 0), point(length, half), point(length, -half)]
    : [point(0, 0), point(length / 2, half), point(length, 0), point(length / 2, -half)];
  rendered.svg.push(`<polygon points="${points.join(" ")}" fill="${kind === "filledDiamond" ? "#000000" : "#ffffff"}" stroke="#000000" stroke-width="2"/>`);
  return length;
}

// Straight connector between facing sides of two classes (horizontal when they do not overlap horizontally).
function renderConnector(rendered: Rendered, classes: readonly SyntheticClass[], connector: SyntheticConnector) {
  const from = classBounds(classes.find((entry) => entry.name === connector.from)!);
  const to = classBounds(classes.find((entry) => entry.name === connector.to)!);
  const horizontal = from.right < to.left || to.right < from.left;
  let start: [number, number];
  let end: [number, number];
  if (horizontal) {
    const y = Math.round((Math.max(from.top, to.top) + Math.min(from.bottom, to.bottom)) / 2);
    start = from.right < to.left ? [from.right, y] : [from.left, y];
    end = from.right < to.left ? [to.left, y] : [to.right, y];
  } else {
    const x = Math.round((Math.max(from.left, to.left) + Math.min(from.right, to.right)) / 2);
    start = from.bottom < to.top ? [x, from.bottom] : [x, from.top];
    end = from.bottom < to.top ? [x, to.top] : [x, to.bottom];
  }
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const dx = (end[0] - start[0]) / length;
  const dy = (end[1] - start[1]) / length;
  const fromOffset = marker(rendered, connector.fromMarker ?? "none", start[0], start[1], -dx, -dy);
  const toOffset = marker(rendered, connector.toMarker ?? "none", end[0], end[1], dx, dy);
  rendered.svg.push(`<line x1="${start[0] + dx * fromOffset}" y1="${start[1] + dy * fromOffset}" x2="${end[0] - dx * toOffset}" y2="${end[1] - dy * toOffset}" stroke="#000000" stroke-width="2"/>`);
  // Labels sit beside the line, just past the end marker, on the side the line leaves the class towards.
  const label = (value: string | undefined, [x, y]: [number, number], outX: number, outY: number, markerLength: number) => {
    if (!value) return;
    const gap = markerLength + 10;
    if (horizontal) text(rendered, value, Math.round(outX > 0 ? x + gap : x - gap - value.length * CHAR_WIDTH), y - 10);
    else text(rendered, value, x + 10, Math.round(outY > 0 ? y + gap + 14 : y - gap - 4));
  };
  label(connector.fromLabel, start, dx, dy, fromOffset);
  label(connector.toLabel, end, -dx, -dy, toOffset);
}

export function renderSyntheticDiagram(diagram: SyntheticDiagram): { svg: string; lines: OcrLine[] } {
  const rendered: Rendered = { svg: [], lines: [] };
  rendered.svg.push(`<rect width="${diagram.width}" height="${diagram.height}" fill="#ffffff"/>`);
  for (const entry of diagram.classes) renderClass(rendered, entry);
  for (const connector of diagram.connectors ?? []) renderConnector(rendered, diagram.classes, connector);
  for (const [x1, y1, x2, y2] of diagram.danglingLines ?? []) rendered.svg.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000000" stroke-width="2"/>`);
  for (const entry of diagram.freeTexts ?? []) text(rendered, entry.text, entry.x, entry.y);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" font-family="Arial, Helvetica, sans-serif" font-size="${FONT_SIZE}">${rendered.svg.join("")}</svg>`;
  return { svg, lines: rendered.lines };
}
