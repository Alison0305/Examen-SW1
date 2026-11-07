import { UML_FRAGMENT_MAX_ELEMENTS, type UmlFragment } from "./commands/command.js";
import { UmlCommandBus } from "./commands/command-bus.js";
import {
  createUuid,
  type DiagramElementLayout,
  type Multiplicity,
  type ProjectDocument,
  type UmlAttribute,
  type UmlClass,
  type UmlEnumeration,
  type UmlPrimitiveTypeName,
  type UmlRelationship,
  type UmlRelationshipType,
  type UmlType,
  type UmlVisibility,
  type Uuid,
} from "./model.js";
import type { Diagnostic } from "./validation.js";

// Source-independent import proposal (XMI or image). Elements use local keys and types by name;
// canonical ids are assigned only when the reviewed proposal is translated into a fragment.

export type ImportDiagnosticSeverity = "info" | "warning" | "error";
export interface ImportDiagnostic {
  severity: ImportDiagnosticSeverity;
  code: string;
  message: string;
  key?: string;
}

export interface ImportAttribute {
  key: string;
  name: string;
  type: string;
  visibility?: UmlVisibility;
  multiplicity?: Multiplicity;
}

export interface ImportClass {
  key: string;
  name: string;
  visibility?: UmlVisibility;
  attributes: ImportAttribute[];
}

export interface ImportEnumeration {
  key: string;
  name: string;
  visibility?: UmlVisibility;
  literals: string[];
}

export interface ImportRelationship {
  key: string;
  type: UmlRelationshipType;
  name?: string;
  // Key of a proposal class, or the name of a class already in the document.
  source: string;
  target: string;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
}

export interface UmlImportProposal {
  source: "xmi" | "image";
  classes: ImportClass[];
  enumerations: ImportEnumeration[];
  relationships: ImportRelationship[];
  diagnostics: ImportDiagnostic[];
}

export interface ImportFragmentOptions {
  uuidFactory?: () => Uuid;
  // Keys excluded during review: excluded classes also drop the relationships that depend on them.
  excludedKeys?: ReadonlySet<string>;
}

export interface ImportFragmentResult {
  fragment: UmlFragment;
  diagnostics: ImportDiagnostic[];
  idsByKey: ReadonlyMap<string, Uuid>;
}

const PRIMITIVE_SYNONYMS: Readonly<Record<string, UmlPrimitiveTypeName>> = {
  string: "string", str: "string", text: "string", char: "string", character: "string", varchar: "string", uuid: "string",
  int: "integer", integer: "integer", long: "integer", short: "integer", byte: "integer", bigint: "integer",
  double: "number", float: "number", decimal: "number", number: "number", real: "number", bigdecimal: "number", numeric: "number",
  bool: "boolean", boolean: "boolean",
  date: "date", localdate: "date",
  datetime: "datetime", timestamp: "datetime", localdatetime: "datetime", instant: "datetime", zoneddatetime: "datetime",
};

// Enterprise Architect prefixes primitive type names, e.g. EAJava_int or EAnone_String.
export function normalizePrimitiveTypeName(name: string): UmlPrimitiveTypeName | undefined {
  const bare = name.trim().replace(/^EA[a-zA-Z]*_/, "").replace(/\s+/g, "").toLowerCase();
  return PRIMITIVE_SYNONYMS[bare];
}

const LAYOUT_COLUMNS = 4;
const LAYOUT_CELL_WIDTH = 240;
const LAYOUT_ROW_GAP = 40;
const LAYOUT_MARGIN = 80;
const CLASS_WIDTH = 180;
const classHeight = (attributeCount: number) => 60 + Math.max(1, attributeCount) * 22;

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("es") === right.trim().toLocaleLowerCase("es");
}

// Deterministic translation: same proposal, document and uuid sequence give the same fragment.
export function buildImportFragment(proposal: UmlImportProposal, document: ProjectDocument, options: ImportFragmentOptions = {}): ImportFragmentResult {
  const uuid = options.uuidFactory ?? createUuid;
  const excluded = options.excludedKeys ?? new Set<string>();
  const diagnostics: ImportDiagnostic[] = [];
  const idsByKey = new Map<string, Uuid>();

  const classes = proposal.classes.filter((entry) => !excluded.has(entry.key));
  const enumerations = proposal.enumerations.filter((entry) => !excluded.has(entry.key));
  for (const entry of [...classes, ...enumerations]) idsByKey.set(entry.key, uuid());

  const resolveType = (typeName: string, attributeKey: string): UmlType => {
    const primitive = normalizePrimitiveTypeName(typeName);
    if (primitive) return { kind: "primitive", name: primitive };
    const proposalClass = classes.find((entry) => entry.name === typeName) ?? classes.find((entry) => sameName(entry.name, typeName));
    if (proposalClass) return { kind: "reference", referenceType: "class", elementId: idsByKey.get(proposalClass.key)! };
    const proposalEnum = enumerations.find((entry) => entry.name === typeName) ?? enumerations.find((entry) => sameName(entry.name, typeName));
    if (proposalEnum) return { kind: "reference", referenceType: "enumeration", elementId: idsByKey.get(proposalEnum.key)! };
    const documentClass = document.uml.classes.find((entry) => sameName(entry.name, typeName));
    if (documentClass) return { kind: "reference", referenceType: "class", elementId: documentClass.id };
    const documentEnum = document.uml.enumerations.find((entry) => sameName(entry.name, typeName));
    if (documentEnum) return { kind: "reference", referenceType: "enumeration", elementId: documentEnum.id };
    diagnostics.push({ severity: "warning", code: "IMPORT_UNKNOWN_TYPE", message: `Tipo desconocido "${typeName}"; se usa string.`, key: attributeKey });
    return { kind: "primitive", name: "string" };
  };

  const fragmentClasses: UmlClass[] = classes.map((entry) => ({
    id: idsByKey.get(entry.key)!,
    name: entry.name.trim(),
    visibility: entry.visibility ?? "public",
    attributes: entry.attributes.filter((attribute) => !excluded.has(attribute.key)).map((attribute): UmlAttribute => ({
      id: uuid(),
      name: attribute.name.trim(),
      visibility: attribute.visibility ?? "private",
      type: resolveType(attribute.type, attribute.key),
      ...(attribute.multiplicity ? { multiplicity: attribute.multiplicity } : {}),
    })),
    operations: [],
  }));

  const fragmentEnumerations: UmlEnumeration[] = enumerations.map((entry) => ({
    id: idsByKey.get(entry.key)!,
    name: entry.name.trim(),
    visibility: entry.visibility ?? "public",
    literals: [...entry.literals],
  }));

  const resolveEnd = (reference: string): Uuid | undefined => idsByKey.get(reference) ?? document.uml.classes.find((entry) => sameName(entry.name, reference))?.id;
  const fragmentRelationships: UmlRelationship[] = [];
  for (const relationship of proposal.relationships) {
    if (excluded.has(relationship.key)) continue;
    // An excluded proposal class takes its relationships with it.
    if (excluded.has(relationship.source) || excluded.has(relationship.target)) continue;
    const sourceId = resolveEnd(relationship.source);
    const targetId = resolveEnd(relationship.target);
    if (!sourceId || !targetId || !isClassId(sourceId, fragmentClasses, document) || !isClassId(targetId, fragmentClasses, document)) {
      diagnostics.push({ severity: "warning", code: "IMPORT_MISSING_RELATIONSHIP_END", message: "La relación se omitió porque uno de sus extremos no es una clase de la propuesta ni del documento.", key: relationship.key });
      continue;
    }
    fragmentRelationships.push({
      id: uuid(),
      type: relationship.type,
      ...(relationship.name?.trim() ? { name: relationship.name.trim() } : {}),
      sourceId,
      targetId,
      ...(relationship.type !== "Generalization" && relationship.sourceMultiplicity ? { sourceMultiplicity: relationship.sourceMultiplicity } : {}),
      ...(relationship.type !== "Generalization" && relationship.targetMultiplicity ? { targetMultiplicity: relationship.targetMultiplicity } : {}),
    });
  }

  const layout = gridLayout(document, [...fragmentClasses.map((entry) => ({ id: entry.id, height: classHeight(entry.attributes.length) })), ...fragmentEnumerations.map((entry) => ({ id: entry.id, height: classHeight(entry.literals.length) }))]);
  const size = fragmentClasses.length + fragmentEnumerations.length + fragmentRelationships.length;
  if (size > UML_FRAGMENT_MAX_ELEMENTS) {
    diagnostics.push({ severity: "error", code: "IMPORT_TOO_LARGE", message: `La importación supera el máximo de ${UML_FRAGMENT_MAX_ELEMENTS} elementos.` });
  }
  return { fragment: { classes: fragmentClasses, enumerations: fragmentEnumerations, relationships: fragmentRelationships, layout }, diagnostics, idsByKey };
}

function isClassId(id: Uuid, fragmentClasses: readonly UmlClass[], document: ProjectDocument): boolean {
  return fragmentClasses.some((entry) => entry.id === id) || document.uml.classes.some((entry) => entry.id === id);
}

// New elements go in a grid to the right of the existing diagram, so nothing overlaps.
function gridLayout(document: ProjectDocument, elements: ReadonlyArray<{ id: Uuid; height: number }>): DiagramElementLayout[] {
  const right = document.layout.elements.reduce((max, entry) => Math.max(max, entry.x + (entry.width ?? CLASS_WIDTH)), 0);
  const originX = document.layout.elements.length > 0 ? right + LAYOUT_MARGIN : LAYOUT_MARGIN;
  const layouts: DiagramElementLayout[] = [];
  let rowY = LAYOUT_MARGIN;
  for (let start = 0; start < elements.length; start += LAYOUT_COLUMNS) {
    const row = elements.slice(start, start + LAYOUT_COLUMNS);
    row.forEach((entry, column) => layouts.push({ elementId: entry.id, x: originX + column * LAYOUT_CELL_WIDTH, y: rowY, width: CLASS_WIDTH, height: entry.height }));
    rowY += Math.max(...row.map((entry) => entry.height)) + LAYOUT_ROW_GAP;
  }
  return layouts;
}

export interface ImportPreview {
  valid: boolean;
  diagnostics: Diagnostic[];
}

// Validates the fragment against a disposable copy; the project document, revision and history stay untouched.
export function previewImportFragment(document: ProjectDocument, fragment: UmlFragment): ImportPreview {
  const result = new UmlCommandBus(document, { historyLimit: 0 }).execute({ type: "ImportUmlFragment", fragment });
  return { valid: result.success, diagnostics: result.diagnostics };
}
