import type { ImportAttribute, ImportClass, ImportDiagnostic, ImportEnumeration, ImportRelationship, Multiplicity, UmlImportProposal, UmlRelationshipType, UmlVisibility } from "@examen-sw1/uml-core";

// Deterministic class-diagram analysis over a grayscale image and OCR lines (pixel coordinates of that image).
// No model is involved here: boxes, connectors and end markers come from geometry; texts come from OCR.

export type GrayImage = Readonly<{ data: Uint8Array; width: number; height: number }>;
export type Box = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type OcrLine = Readonly<{ text: string; box: Box }>;

type MutableBox = { left: number; top: number; right: number; bottom: number };
type Side = "top" | "bottom" | "left" | "right";
type EndMarker = "none" | "triangle" | "hollowDiamond" | "filledDiamond";

type Hole = { box: MutableBox; area: number; sumX: number; sumY: number; rectangularity: number };
type DetectedClass = { outer: MutableBox; compartments: MutableBox[] };
type ConnectorEnd = { classIndex: number; x: number; y: number; side: Side; marker: EndMarker };

// Binarization: a pixel is ink when it is clearly darker than its neighborhood (Bradley) or very dark.
const ADAPTIVE_RATIO = 0.15;
const DARK_LEVEL = 60;
// Compartments are closed, nearly rectangular background regions large enough not to be letter holes.
const MIN_COMPARTMENT_WIDTH = 24;
const MIN_COMPARTMENT_HEIGHT = 6;
const MIN_COMPARTMENT_AREA = 200;
const MIN_COMPARTMENT_RECTANGULARITY = 0.9;
const STACK_TOLERANCE = 4;
const STACK_MAX_GAP = 10;
const MAX_BORDER_DEPTH = 8;
const CONTACT_MARGIN = 3;
const MIN_CONNECTOR_PIXELS = 12;
const MIN_DANGLING_SPAN = 40;
// Hollow end markers (triangle, diamond) enclose a small, clearly non-rectangular hole.
const MIN_MARKER_HOLE_AREA = 10;
// Triangles and diamonds fill about half of their bounding box; letter holes ("o", "0") fill about 0.78.
const MAX_MARKER_HOLE_FILL = 0.68;
const MAX_UNASSIGNED_TEXT_REPORTED = 10;

const VISIBILITY: Readonly<Record<string, UmlVisibility>> = { "+": "public", "-": "private", "#": "protected", "~": "package" };
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
// "visibility name: Type [multiplicity] = default". With a colon the name may have several words ("ID del usuario")
// and the type may be missing ("-Nombre:"); without a colon only a single word is an attribute, as before, so loose
// text in the body is not turned into attributes.
const TYPED_ATTRIBUTE = /^([+\-#~])?\s*([\p{L}_][\p{L}\p{N}_]*(?:\s+[\p{L}\p{N}_]+){0,4})\s*:\s*(?:([\p{L}_][\p{L}\p{N}_<>.,]*)\s*(\[[^\]]*\])?)?\s*(?:=.*)?$/u;
const UNTYPED_ATTRIBUTE = /^([+\-#~])?\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:=.*)?$/u;
const STEREOTYPE = /^\s*(?:«|<<|<)\s*([\p{L}_ ]+?)\s*(?:»|>>|>)\s*$/u;

const width = (box: Box) => box.right - box.left + 1;
const height = (box: Box) => box.bottom - box.top + 1;
const centerX = (box: Box) => (box.left + box.right) / 2;
const centerY = (box: Box) => (box.top + box.bottom) / 2;
const inside = (box: Box, x: number, y: number) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
const grow = (box: Box, by: number): MutableBox => ({ left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by });

export function analyzeDiagram(image: GrayImage, lines: readonly OcrLine[]): UmlImportProposal {
  const diagnostics: ImportDiagnostic[] = [];
  const ink = binarize(image);
  const closed = dilate(ink, image.width, image.height);
  const { outer, holeLabels, holes } = labelBackground(closed, image.width, image.height);
  const detected = detectClasses(holes, ink, image.width, image.height);
  const stroke = median(borderDepths(detected)) || 2;
  const headRadius = Math.min(40, Math.max(16, Math.round(Math.max(image.width, image.height) * 0.03)));

  const textsByClass = detected.map(() => [] as OcrLine[]);
  const freeTexts: OcrLine[] = [];
  for (const line of [...lines].sort((left, right) => left.box.top - right.box.top || left.box.left - right.box.left)) {
    if (!line.text.trim()) continue;
    const owner = detected.findIndex((entry) => inside(entry.outer, centerX(line.box), centerY(line.box)));
    if (owner >= 0) textsByClass[owner]!.push(line);
    else freeTexts.push(line);
  }

  // A closed region without any OCR text is background (fills, shadows, grid cells), not a class. It stays in
  // `detected` as geometry, so its borders are not traced as connectors, but it is neither proposed as a class nor
  // used as a relationship end. Keys stay consecutive among the proposed classes.
  const classes: ImportClass[] = [];
  const enumerations: ImportEnumeration[] = [];
  const keyByIndex: Array<string | undefined> = [];
  let discardedRegions = 0;
  detected.forEach((entry, index) => {
    if (textsByClass[index]!.length === 0) {
      keyByIndex.push(undefined);
      discardedRegions += 1;
      return;
    }
    const parsed = parseClassText(entry, textsByClass[index]!, `C${classes.length + enumerations.length + 1}`, diagnostics);
    keyByIndex.push(parsed.key);
    if (parsed.kind === "class") classes.push(parsed.value);
    else enumerations.push(parsed.value);
  });
  if (discardedRegions > 0) diagnostics.push({ severity: "info", code: "IMAGE_EMPTY_REGIONS_DISCARDED", message: `Se descartaron ${discardedRegions} región(es) cerrada(s) sin texto: no se proponen como clases.` });

  const connectors = traceConnectors({ image, ink, closed, outer, holeLabels, holes, detected, stroke, headRadius });
  const relationships: ImportRelationship[] = [];
  const multiplicityEnds: Array<{ relationship: ImportRelationship; end: ConnectorEnd; field: "sourceMultiplicity" | "targetMultiplicity" }> = [];
  for (const traced of connectors) {
    // Ends on discarded regions are dropped: a line between a class and a background cell is not a relationship.
    const connector = { ...traced, ends: traced.ends.filter((end) => keyByIndex[end.classIndex] !== undefined) };
    if (connector.ends.length < traced.ends.length && connector.ends.length < 2) continue;
    if (connector.ends.length < 2) {
      // Components touching no class are free text or drawings; only a line leaving a class is a dangling connector.
      if (connector.ends.length === 1 && connector.span >= MIN_DANGLING_SPAN) diagnostics.push({ severity: "warning", code: "IMAGE_CONNECTOR_WITHOUT_END", message: "Se detectó un conector cuyo extremo no toca ninguna clase reconocida; no se propone la relación." });
      continue;
    }
    const built = buildRelationships(connector.ends, keyByIndex, relationships.length, diagnostics);
    for (const item of built) {
      relationships.push(item.relationship);
      if (item.relationship.type === "Generalization") continue;
      multiplicityEnds.push({ relationship: item.relationship, end: item.sourceEnd, field: "sourceMultiplicity" }, { relationship: item.relationship, end: item.targetEnd, field: "targetMultiplicity" });
    }
  }

  const leftover = assignMultiplicities(freeTexts, multiplicityEnds, headRadius * 3, diagnostics);
  if (leftover.length > 0) {
    const shown = leftover.slice(0, MAX_UNASSIGNED_TEXT_REPORTED).map((line) => `"${line.text.trim()}"`).join(", ");
    diagnostics.push({ severity: "info", code: "IMAGE_UNASSIGNED_TEXT", message: `Texto fuera de las clases que no se asignó: ${shown}${leftover.length > MAX_UNASSIGNED_TEXT_REPORTED ? "…" : ""}.` });
  }
  if (classes.length + enumerations.length === 0) {
    diagnostics.unshift({ severity: "warning", code: "IMAGE_NO_DIAGRAM", message: "No se reconoció ninguna clase en la imagen; verifica que sea un diagrama de clases legible." });
  }
  return { source: "image", classes, enumerations, relationships, diagnostics };
}

// ---------------------------------------------------------------------------------------------
// Pixels

function integral(values: ArrayLike<number>, imageWidth: number, imageHeight: number): Float64Array {
  const stride = imageWidth + 1;
  const sums = new Float64Array(stride * (imageHeight + 1));
  for (let y = 0; y < imageHeight; y += 1) {
    let row = 0;
    for (let x = 0; x < imageWidth; x += 1) {
      row += values[y * imageWidth + x]!;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + row;
    }
  }
  return sums;
}

// Inclusive rectangle sum, clamped to the image.
function rectSum(sums: Float64Array, imageWidth: number, imageHeight: number, box: Box): number {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(imageWidth - 1, box.right);
  const bottom = Math.min(imageHeight - 1, box.bottom);
  if (right < left || bottom < top) return 0;
  const stride = imageWidth + 1;
  return sums[(bottom + 1) * stride + right + 1]! - sums[top * stride + right + 1]! - sums[(bottom + 1) * stride + left]! + sums[top * stride + left]!;
}

export function binarize(image: GrayImage): Uint8Array {
  const { data, width: imageWidth, height: imageHeight } = image;
  const sums = integral(data, imageWidth, imageHeight);
  const half = Math.max(7, Math.round(Math.max(imageWidth, imageHeight) / 32));
  const ink = new Uint8Array(imageWidth * imageHeight);
  const stride = imageWidth + 1;
  // Hot loop over every pixel: window sums are read inline from the integral image, without allocations.
  for (let y = 0; y < imageHeight; y += 1) {
    const top = Math.max(0, y - half);
    const bottom = Math.min(imageHeight - 1, y + half);
    for (let x = 0; x < imageWidth; x += 1) {
      const left = Math.max(0, x - half);
      const right = Math.min(imageWidth - 1, x + half);
      const sum = sums[(bottom + 1) * stride + right + 1]! - sums[top * stride + right + 1]! - sums[(bottom + 1) * stride + left]! + sums[top * stride + left]!;
      const mean = sum / ((right - left + 1) * (bottom - top + 1));
      const value = data[y * imageWidth + x]!;
      ink[y * imageWidth + x] = value < DARK_LEVEL || value < mean * (1 - ADAPTIVE_RATIO) ? 1 : 0;
    }
  }
  return ink;
}

// 3x3 dilation closes the small gaps of photographed or compressed lines.
function dilate(mask: Uint8Array, imageWidth: number, imageHeight: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      if (!mask[y * imageWidth + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= imageHeight) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx >= 0 && nx < imageWidth) result[ny * imageWidth + nx] = 1;
        }
      }
    }
  }
  return result;
}

// Background reachable from the border is "outer"; every other background region is a hole (closed shape).
function labelBackground(closed: Uint8Array, imageWidth: number, imageHeight: number) {
  const size = imageWidth * imageHeight;
  const outer = new Uint8Array(size);
  const holeLabels = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  const flood = (start: number, visit: (index: number) => void, seen: (index: number) => boolean) => {
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visit(start);
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % imageWidth;
      const neighbors = [x > 0 ? index - 1 : -1, x < imageWidth - 1 ? index + 1 : -1, index - imageWidth, index + imageWidth];
      for (const next of neighbors) {
        if (next < 0 || next >= size || closed[next] || seen(next)) continue;
        visit(next);
        queue[tail++] = next;
      }
    }
  };
  const markOuter = (index: number) => { outer[index] = 1; };
  const isOuter = (index: number) => outer[index] === 1;
  for (let x = 0; x < imageWidth; x += 1) {
    for (const index of [x, (imageHeight - 1) * imageWidth + x]) if (!closed[index] && !outer[index]) flood(index, markOuter, isOuter);
  }
  for (let y = 0; y < imageHeight; y += 1) {
    for (const index of [y * imageWidth, y * imageWidth + imageWidth - 1]) if (!closed[index] && !outer[index]) flood(index, markOuter, isOuter);
  }

  const holes: Hole[] = [];
  for (let index = 0; index < size; index += 1) {
    if (closed[index] || outer[index] || holeLabels[index]! >= 0) continue;
    const hole: Hole = { box: { left: imageWidth, top: imageHeight, right: -1, bottom: -1 }, area: 0, sumX: 0, sumY: 0, rectangularity: 0 };
    const label = holes.length;
    holes.push(hole);
    flood(index, (visited) => {
      holeLabels[visited] = label;
      const x = visited % imageWidth;
      const y = Math.floor(visited / imageWidth);
      hole.area += 1;
      hole.sumX += x;
      hole.sumY += y;
      hole.box.left = Math.min(hole.box.left, x);
      hole.box.right = Math.max(hole.box.right, x);
      hole.box.top = Math.min(hole.box.top, y);
      hole.box.bottom = Math.max(hole.box.bottom, y);
    }, (visited) => holeLabels[visited]! >= 0);
  }
  const outerSums = integral(outer, imageWidth, imageHeight);
  for (const hole of holes) hole.rectangularity = 1 - rectSum(outerSums, imageWidth, imageHeight, hole.box) / (width(hole.box) * height(hole.box));
  return { outer, holeLabels, holes };
}

// ---------------------------------------------------------------------------------------------
// Classes

function isCompartment(hole: Hole): boolean {
  return width(hole.box) >= MIN_COMPARTMENT_WIDTH && height(hole.box) >= MIN_COMPARTMENT_HEIGHT && hole.area >= MIN_COMPARTMENT_AREA && hole.rectangularity >= MIN_COMPARTMENT_RECTANGULARITY;
}

function contains(container: Box, content: Box): boolean {
  return container.left < content.left && container.right > content.right && container.top < content.top && container.bottom > content.bottom;
}

function detectClasses(holes: readonly Hole[], ink: Uint8Array, imageWidth: number, imageHeight: number): DetectedClass[] {
  const candidates = holes.filter(isCompartment).map((hole) => hole.box);
  // Frames and packages enclose other compartments; they are not classes.
  const compartments = candidates.filter((box) => !candidates.some((other) => other !== box && contains(box, other))).sort((left, right) => left.top - right.top || left.left - right.left);
  const parent = compartments.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index]!)));
  for (let upper = 0; upper < compartments.length; upper += 1) {
    for (let lower = 0; lower < compartments.length; lower += 1) {
      const a = compartments[upper]!;
      const b = compartments[lower]!;
      const gap = b.top - a.bottom;
      if (upper !== lower && Math.abs(a.left - b.left) <= STACK_TOLERANCE && Math.abs(a.right - b.right) <= STACK_TOLERANCE && gap > 0 && gap <= STACK_MAX_GAP) parent[find(lower)] = find(upper);
    }
  }
  const groups = new Map<number, MutableBox[]>();
  compartments.forEach((box, index) => groups.set(find(index), [...(groups.get(find(index)) ?? []), box]));
  return [...groups.values()]
    .map((group) => {
      const innerBox = group.reduce<MutableBox>((union, box) => ({ left: Math.min(union.left, box.left), top: Math.min(union.top, box.top), right: Math.max(union.right, box.right), bottom: Math.max(union.bottom, box.bottom) }), { ...group[0]! });
      return { outer: expandToBorder(ink, imageWidth, imageHeight, innerBox), compartments: group };
    })
    .sort((left, right) => left.outer.top - right.outer.top || left.outer.left - right.outer.left);
}

// Walks outward from the interior until the border stroke ends, so the box includes its own lines.
function expandToBorder(ink: Uint8Array, imageWidth: number, imageHeight: number, inner: Box): MutableBox {
  const rowFraction = (y: number) => {
    if (y < 0 || y >= imageHeight) return 0;
    let count = 0;
    for (let x = inner.left; x <= inner.right; x += 1) count += ink[y * imageWidth + x]!;
    return count / width(inner);
  };
  const columnFraction = (x: number) => {
    if (x < 0 || x >= imageWidth) return 0;
    let count = 0;
    for (let y = inner.top; y <= inner.bottom; y += 1) count += ink[y * imageWidth + x]!;
    return count / height(inner);
  };
  const depth = (sample: (step: number) => number) => {
    let found = 0;
    for (let step = 1; step <= MAX_BORDER_DEPTH; step += 1) {
      if (sample(step) >= 0.5) found = step;
      else if (found > 0) break;
    }
    return Math.max(1, found);
  };
  return {
    left: inner.left - depth((step) => columnFraction(inner.left - step)),
    right: inner.right + depth((step) => columnFraction(inner.right + step)),
    top: inner.top - depth((step) => rowFraction(inner.top - step)),
    bottom: inner.bottom + depth((step) => rowFraction(inner.bottom + step)),
  };
}

function borderDepths(detected: readonly DetectedClass[]): number[] {
  return detected.flatMap((entry) => {
    const inner = entry.compartments.reduce((union, box) => ({ left: Math.min(union.left, box.left), top: Math.min(union.top, box.top), right: Math.max(union.right, box.right), bottom: Math.max(union.bottom, box.bottom) }));
    return [inner.left - entry.outer.left, entry.outer.right - inner.right, inner.top - entry.outer.top, entry.outer.bottom - inner.bottom];
  });
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

type ParsedClass = { key: string; kind: "class"; value: ImportClass } | { key: string; kind: "enumeration"; value: ImportEnumeration };

function compartmentOf(entry: DetectedClass, line: OcrLine): number {
  const y = centerY(line.box);
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  entry.compartments.forEach((box, index) => {
    const distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function sanitizeName(text: string): string {
  return text.normalize("NFC").replace(/[^\p{L}\p{N}_]/gu, "");
}

// "ID del usuario" → "IDDelUsuario": the words are kept as written, joined, each later word capitalized.
function joinWords(text: string): string {
  return text.trim().split(/\s+/u).map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join("");
}

function parseClassText(entry: DetectedClass, lines: readonly OcrLine[], key: string, diagnostics: ImportDiagnostic[]): ParsedClass {
  const single = entry.compartments.length === 1;
  const header: OcrLine[] = [];
  const body: OcrLine[] = [];
  const operations: OcrLine[] = [];
  for (const line of lines) {
    const compartment = compartmentOf(entry, line);
    if (compartment === 0 && (!single || header.length === 0 || STEREOTYPE.test(header.at(-1)!.text))) header.push(line);
    else if (compartment <= 1) body.push(line);
    else operations.push(line);
  }
  const stereotypes = header.map((line) => STEREOTYPE.exec(line.text)?.[1]?.trim().toLowerCase()).filter((value): value is string => Boolean(value));
  const isEnumeration = stereotypes.some((value) => value.startsWith("enum"));
  const nameLines = header.filter((line) => !STEREOTYPE.test(line.text));
  let name = sanitizeName(nameLines[0]?.text ?? "");
  if (!name || !IDENTIFIER.test(name)) {
    name = `${isEnumeration ? "Enumeracion" : "Clase"}SinNombre${key.slice(1)}`;
    diagnostics.push({ severity: "warning", code: "IMAGE_CLASS_WITHOUT_NAME", message: `Se encontró una caja sin nombre legible; se propone "${name}".`, key });
  }
  // In a single-compartment box only the first line is the name; the rest are attributes.
  if (nameLines.length > 1 && single) body.unshift(...nameLines.slice(1));
  else if (nameLines.length > 1) diagnostics.push({ severity: "info", code: "IMAGE_UNASSIGNED_TEXT", message: `Se ignoró texto adicional en el nombre de ${name}: ${nameLines.slice(1).map((line) => `"${line.text.trim()}"`).join(", ")}.`, key });

  if (isEnumeration) {
    const literals: string[] = [];
    for (const line of body) {
      const literal = sanitizeName(line.text);
      if (literal && IDENTIFIER.test(literal)) literals.push(literal);
      else diagnostics.push({ severity: "warning", code: "IMAGE_UNREADABLE_TEXT", message: `No se pudo leer el literal "${line.text.trim()}" de ${name}.`, key });
    }
    return { key, kind: "enumeration", value: { key, name, literals } };
  }

  const attributes: ImportAttribute[] = [];
  let omittedOperations = operations.length;
  for (const line of body) {
    // Deterministic OCR clean-up only: dash variants, full-width colon and repeated colons ("ruc : : String").
    const text = line.text.replace(/[–—−]/g, "-").replace(/：/g, ":").replace(/:(?:\s*:)+/g, ":").trim();
    if (text.includes("(")) {
      omittedOperations += 1;
      continue;
    }
    const match = TYPED_ATTRIBUTE.exec(text) ?? UNTYPED_ATTRIBUTE.exec(text);
    if (!match) {
      diagnostics.push({ severity: "warning", code: "IMAGE_UNREADABLE_TEXT", message: `No se pudo leer el atributo "${text}" de ${name}.`, key });
      continue;
    }
    const attributeKey = `${key}.A${attributes.length + 1}`;
    const [, visibility, writtenName, type, multiplicityText] = match;
    const attributeName = joinWords(writtenName!);
    if (attributeName !== writtenName) diagnostics.push({ severity: "info", code: "IMAGE_ATTRIBUTE_NAME_JOINED", message: `El atributo "${writtenName}" de ${name} se propone como "${attributeName}".`, key: attributeKey });
    if (!type) diagnostics.push({ severity: "warning", code: "IMAGE_ATTRIBUTE_WITHOUT_TYPE", message: `El atributo "${attributeName}" de ${name} no tiene tipo legible; se propone String.`, key: attributeKey });
    const multiplicity = multiplicityText ? parseMultiplicityText(multiplicityText.slice(1, -1)) : undefined;
    attributes.push({ key: attributeKey, name: attributeName, type: type ?? "String", ...(visibility ? { visibility: VISIBILITY[visibility] } : {}), ...(multiplicity ? { multiplicity } : {}) });
  }
  if (omittedOperations > 0) diagnostics.push({ severity: "info", code: "IMAGE_OPERATIONS_OMITTED", message: `Se omitieron ${omittedOperations} operación(es) de ${name}; solo se importan atributos.`, key });
  return { key, kind: "class", value: { key, name, attributes } };
}

// ---------------------------------------------------------------------------------------------
// Connectors

type TraceContext = Readonly<{
  image: GrayImage;
  ink: Uint8Array;
  closed: Uint8Array;
  outer: Uint8Array;
  holeLabels: Int32Array;
  holes: readonly Hole[];
  detected: readonly DetectedClass[];
  stroke: number;
  headRadius: number;
}>;

type Connector = { ends: ConnectorEnd[]; span: number };

function traceConnectors(context: TraceContext): Connector[] {
  const { image, closed, detected } = context;
  const { width: imageWidth, height: imageHeight } = image;
  const size = imageWidth * imageHeight;
  const blocked = new Uint8Array(size);
  const nearClass = new Int32Array(size).fill(-1);
  detected.forEach((entry, classIndex) => {
    const blockedBox = grow(entry.outer, 1);
    const nearBox = grow(entry.outer, 1 + CONTACT_MARGIN);
    for (let y = Math.max(0, nearBox.top); y <= Math.min(imageHeight - 1, nearBox.bottom); y += 1) {
      for (let x = Math.max(0, nearBox.left); x <= Math.min(imageWidth - 1, nearBox.right); x += 1) {
        const index = y * imageWidth + x;
        if (inside(blockedBox, x, y)) blocked[index] = 1;
        else if (nearClass[index]! < 0) nearClass[index] = classIndex;
      }
    }
  });

  const componentLabels = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  const connectors: Connector[] = [];
  for (let start = 0; start < size; start += 1) {
    if (!closed[start] || blocked[start] || componentLabels[start]! >= 0) continue;
    const label = connectors.length;
    const pixels: number[] = [];
    const touches = new Map<number, { sumX: number; sumY: number; count: number }>();
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    componentLabels[start] = label;
    while (head < tail) {
      const index = queue[head++]!;
      pixels.push(index);
      const x = index % imageWidth;
      const y = Math.floor(index / imageWidth);
      const near = nearClass[index]!;
      if (near >= 0) {
        const touch = touches.get(near) ?? { sumX: 0, sumY: 0, count: 0 };
        touch.sumX += x;
        touch.sumY += y;
        touch.count += 1;
        touches.set(near, touch);
      }
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= imageWidth || ny >= imageHeight) continue;
          const next = ny * imageWidth + nx;
          if (!closed[next] || blocked[next] || componentLabels[next]! >= 0) continue;
          componentLabels[next] = label;
          queue[tail++] = next;
        }
      }
    }
    if (pixels.length < MIN_CONNECTOR_PIXELS) {
      connectors.push({ ends: [], span: 0 });
      continue;
    }
    const xs = valueRange(pixels.map((index) => index % imageWidth));
    const ys = valueRange(pixels.map((index) => Math.floor(index / imageWidth)));
    const span = Math.max(xs.max - xs.min, ys.max - ys.min) + 1;
    const ends = [...touches.entries()]
      .sort(([left], [right]) => left - right)
      .map(([classIndex, touch]): ConnectorEnd => {
        const x = touch.sumX / touch.count;
        const y = touch.sumY / touch.count;
        const side = sideOf(detected[classIndex]!.outer, x, y);
        return { classIndex, x, y, side, marker: classifyEnd(context, componentLabels, label, detected[classIndex]!.outer, side, x, y) };
      });
    connectors.push({ ends, span });
  }
  return connectors.filter((connector) => connector.span > 0);
}

// Min and max with a loop: `Math.max(...values)` passes every value as an argument and overflows the call stack on
// large pixel lists (seen in production with a thick connector: "Maximum call stack size exceeded").
export function valueRange(values: ReadonlyArray<number>): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

function sideOf(box: Box, x: number, y: number): Side {
  const distances: Array<[Side, number]> = [["top", Math.abs(y - box.top)], ["bottom", Math.abs(y - box.bottom)], ["left", Math.abs(x - box.left)], ["right", Math.abs(x - box.right)]];
  return distances.reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0];
}

// Local frame at a connector end: "along" grows away from the class, "across" is centered on the contact.
function endFrame(box: Box, side: Side, contactX: number, contactY: number) {
  switch (side) {
    case "top": return (x: number, y: number) => ({ along: box.top - y, across: x - contactX });
    case "bottom": return (x: number, y: number) => ({ along: y - box.bottom, across: x - contactX });
    case "left": return (x: number, y: number) => ({ along: box.left - x, across: y - contactY });
    case "right": return (x: number, y: number) => ({ along: x - box.right, across: y - contactY });
  }
}

function classifyEnd(context: TraceContext, componentLabels: Int32Array, label: number, box: Box, side: Side, contactX: number, contactY: number): EndMarker {
  const { image, ink, holes, holeLabels, headRadius, stroke } = context;
  const frame = endFrame(box, side, contactX, contactY);

  // Hollow marker: a small non-rectangular hole just outside the class.
  const markerHole = holes.findIndex((hole) => {
    if (hole.area < MIN_MARKER_HOLE_AREA || hole.area / (width(hole.box) * height(hole.box)) > MAX_MARKER_HOLE_FILL || isCompartment(hole)) return false;
    const { along, across } = frame(hole.sumX / hole.area, hole.sumY / hole.area);
    return along >= 0 && along <= headRadius * 1.5 && Math.abs(across) <= headRadius;
  });
  if (markerHole >= 0) {
    const hole = holes[markerHole]!;
    const samples: Array<{ along: number; across: number }> = [];
    for (let y = hole.box.top; y <= hole.box.bottom; y += 1) {
      for (let x = hole.box.left; x <= hole.box.right; x += 1) if (holeLabels[y * image.width + x] === markerHole) samples.push(frame(x, y));
    }
    const [near, middle, far] = thirdWidths(samples);
    if (far >= near * 1.3 && far >= middle) return "triangle";
    if (middle > near && middle > far) return "hollowDiamond";
    return far > near ? "triangle" : "hollowDiamond";
  }

  // Filled marker: several solid slices much wider than the connector stroke.
  const slices = new Map<number, number[]>();
  for (let y = Math.max(0, box.top - headRadius - 1); y <= Math.min(image.height - 1, box.bottom + headRadius + 1); y += 1) {
    for (let x = Math.max(0, box.left - headRadius - 1); x <= Math.min(image.width - 1, box.right + headRadius + 1); x += 1) {
      const index = y * image.width + x;
      if (!ink[index] || componentLabels[index] !== label) continue;
      const { along, across } = frame(x, y);
      if (along < 1 || along > headRadius || Math.abs(across) > headRadius) continue;
      const slice = slices.get(along);
      if (slice) slice.push(across);
      else slices.set(along, [across]);
    }
  }
  const wide = Math.max(6, stroke * 2.5);
  const solidSlices = [...slices.values()].filter((values) => {
    const { min, max } = valueRange(values);
    const extent = max - min + 1;
    return extent >= wide && values.length / extent >= 0.85;
  });
  return solidSlices.length >= 3 ? "filledDiamond" : "none";
}

function thirdWidths(samples: ReadonlyArray<{ along: number; across: number }>): [number, number, number] {
  const alongs = valueRange(samples.map((sample) => sample.along));
  const minAlong = alongs.min;
  const length = alongs.max - minAlong + 1;
  const ranges = [0, 1, 2].map(() => ({ min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }));
  for (const sample of samples) {
    const range = ranges[Math.min(2, Math.floor(((sample.along - minAlong) * 3) / length))]!;
    range.min = Math.min(range.min, sample.across);
    range.max = Math.max(range.max, sample.across);
  }
  const extent = (range: { min: number; max: number }) => (range.max >= range.min ? range.max - range.min + 1 : 0);
  return [extent(ranges[0]!), extent(ranges[1]!), extent(ranges[2]!)];
}

const MARKER_TYPE: Readonly<Record<Exclude<EndMarker, "none">, UmlRelationshipType>> = { triangle: "Generalization", hollowDiamond: "Aggregation", filledDiamond: "Composition" };

type BuiltRelationship = { relationship: ImportRelationship; sourceEnd: ConnectorEnd; targetEnd: ConnectorEnd };

// Generalization: source = child, target = parent (triangle end). Aggregation/Composition: source = whole (diamond end).
// `ends` only contains ends on proposed classes, so every keyByIndex lookup here is defined.
function buildRelationships(ends: readonly ConnectorEnd[], keyByIndex: ReadonlyArray<string | undefined>, offset: number, diagnostics: ImportDiagnostic[]): BuiltRelationship[] {
  const marked = ends.filter((end) => end.marker !== "none");
  const key = (index: number) => `R${offset + index + 1}`;
  if (marked.length === 1) {
    const anchor = marked[0]!;
    const type = MARKER_TYPE[anchor.marker as Exclude<EndMarker, "none">];
    return ends.filter((end) => end !== anchor).map((other, index) => (type === "Generalization"
      ? { relationship: { key: key(index), type, source: keyByIndex[other.classIndex]!, target: keyByIndex[anchor.classIndex]! }, sourceEnd: other, targetEnd: anchor }
      : { relationship: { key: key(index), type, source: keyByIndex[anchor.classIndex]!, target: keyByIndex[other.classIndex]! }, sourceEnd: anchor, targetEnd: other }));
  }
  if (ends.length > 2) {
    diagnostics.push({ severity: "warning", code: "IMAGE_AMBIGUOUS_CONNECTOR", message: `Un conector toca ${ends.length} clases sin un extremo distinguible; no se propone la relación.` });
    return [];
  }
  const [first, second] = ends as [ConnectorEnd, ConnectorEnd];
  if (marked.length === 2) diagnostics.push({ severity: "warning", code: "IMAGE_AMBIGUOUS_ENDS", message: "Un conector tiene marcas en ambos extremos; se propone como asociación.", key: key(0) });
  return [{ relationship: { key: key(0), type: "Association", source: keyByIndex[first.classIndex]!, target: keyByIndex[second.classIndex]! }, sourceEnd: first, targetEnd: second }];
}

// ---------------------------------------------------------------------------------------------
// Multiplicities

const MULTIPLICITY_LIKE = /^[\d.*,…nN\s]{1,8}$/;

// Accepts OCR variants such as "0.*", "1…*" or "0..n"; anything else is reported, never guessed.
export function parseMultiplicityText(text: string): Multiplicity | undefined {
  const normalized = text.trim().replace(/\s+/g, "").replace(/,/g, ".").replace(/…/g, "..").replace(/[nN]/g, "*");
  if (normalized === "*") return { lower: 0, upper: "unbounded" };
  if (/^\d+$/.test(normalized)) return { lower: Number(normalized), upper: Number(normalized) };
  const range = /^(\d+)\.{1,3}(\d+|\*)$/.exec(normalized);
  if (!range) return undefined;
  const lower = Number(range[1]);
  if (range[2] === "*") return { lower, upper: "unbounded" };
  const upper = Number(range[2]);
  return upper >= lower && upper > 0 ? { lower, upper } : undefined;
}

function assignMultiplicities(
  texts: readonly OcrLine[],
  ends: ReadonlyArray<{ relationship: ImportRelationship; end: ConnectorEnd; field: "sourceMultiplicity" | "targetMultiplicity" }>,
  maxDistance: number,
  diagnostics: ImportDiagnostic[],
): OcrLine[] {
  const leftover: OcrLine[] = [];
  const taken = new Set<number>();
  for (const line of texts) {
    if (!MULTIPLICITY_LIKE.test(line.text.trim())) {
      leftover.push(line);
      continue;
    }
    let best = -1;
    let bestDistance = maxDistance;
    ends.forEach((candidate, index) => {
      const distance = Math.hypot(centerX(line.box) - candidate.end.x, centerY(line.box) - candidate.end.y);
      if (!taken.has(index) && distance <= bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    if (best < 0) {
      leftover.push(line);
      continue;
    }
    taken.add(best);
    const target = ends[best]!;
    const multiplicity = parseMultiplicityText(line.text);
    if (multiplicity) target.relationship[target.field] = multiplicity;
    else diagnostics.push({ severity: "warning", code: "IMAGE_ILLEGIBLE_MULTIPLICITY", message: `No se pudo leer la multiplicidad "${line.text.trim()}"; revisa ese extremo.`, key: target.relationship.key });
  }
  return leftover;
}
