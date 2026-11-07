import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ImportAttribute, ImportClass, ImportDiagnostic, ImportEnumeration, ImportRelationship, Multiplicity, UmlImportProposal, UmlRelationshipType, UmlVisibility } from "@examen-sw1/uml-core";

// XMI 2.1 import of the supported subset (Enterprise Architect shape and standard UML ends).
// Everything outside the subset becomes a diagnostic instead of being dropped silently.

export const XMI_MAX_BYTES = 5 * 1024 * 1024;

export type XmiParseResult =
  | Readonly<{ ok: true; proposal: UmlImportProposal }>
  | Readonly<{ ok: false; diagnostics: ImportDiagnostic[] }>;

type XmlNode = Record<string, unknown>;

const ARRAY_TAGS = new Set(["packagedElement", "ownedAttribute", "ownedEnd", "memberEnd", "generalization", "ownedLiteral", "ownedOperation", "nestedClassifier"]);
const VISIBILITIES: readonly UmlVisibility[] = ["public", "private", "protected", "package"];

const isNode = (value: unknown): value is XmlNode => typeof value === "object" && value !== null && !Array.isArray(value);
const children = (node: XmlNode, tag: string): XmlNode[] => (Array.isArray(node[tag]) ? node[tag] as unknown[] : []).filter(isNode);
const attr = (node: XmlNode | undefined, name: string): string | undefined => {
  const value = node?.[`@_${name}`];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
};
const typeOf = (node: XmlNode) => attr(node, "xmi:type") ?? attr(node, "xsi:type") ?? "";
const idOf = (node: XmlNode) => attr(node, "xmi:id") ?? attr(node, "id");
const visibilityOf = (node: XmlNode): UmlVisibility | undefined => {
  const value = attr(node, "visibility");
  return VISIBILITIES.includes(value as UmlVisibility) ? value as UmlVisibility : undefined;
};

function findRoot(parsed: XmlNode): XmlNode | undefined {
  const key = Object.keys(parsed).find((name) => name === "xmi:XMI" || name.endsWith(":XMI") || name === "XMI");
  return key && isNode(parsed[key]) ? parsed[key] as XmlNode : undefined;
}

function valueOf(node: XmlNode | undefined): string | undefined {
  // UML LiteralInteger defaults to 0 when the value attribute is omitted (Enterprise Architect does this).
  return node ? attr(node, "value") ?? "0" : undefined;
}

function parseUpper(raw: string): number | "unbounded" | undefined {
  if (raw === "*" || raw === "-1") return "unbounded";
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function multiplicityOf(node: XmlNode, key: string, diagnostics: ImportDiagnostic[]): Multiplicity | undefined {
  const lowerRaw = valueOf(isNode(node.lowerValue) ? node.lowerValue : undefined);
  const upperRaw = valueOf(isNode(node.upperValue) ? node.upperValue : undefined);
  if (lowerRaw === undefined && upperRaw === undefined) return undefined;
  const lower = Number(lowerRaw ?? "1");
  const upper = parseUpper(upperRaw ?? "1");
  if (!Number.isInteger(lower) || lower < 0 || upper === undefined || (upper !== "unbounded" && upper < lower)) {
    diagnostics.push({ severity: "warning", code: "XMI_INVALID_MULTIPLICITY", message: "Se ignoró una multiplicidad no válida.", key });
    return undefined;
  }
  return { lower, upper };
}

interface RawProperty { node: XmlNode; ownerId?: string }

export function parseXmi(xml: string): XmiParseResult {
  if (new TextEncoder().encode(xml).length > XMI_MAX_BYTES) {
    return { ok: false, diagnostics: [{ severity: "error", code: "XMI_TOO_LARGE", message: "El archivo supera el tamaño máximo de 5 MB." }] };
  }
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    return { ok: false, diagnostics: [{ severity: "error", code: "XMI_INVALID_XML", message: `El archivo no es XML bien formado: ${validation.err.msg} (línea ${validation.err.line}).` }] };
  }
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name) => ARRAY_TAGS.has(name), parseAttributeValue: false, parseTagValue: false }).parse(xml) as XmlNode;
  const root = findRoot(parsed);
  if (!root) {
    return { ok: false, diagnostics: [{ severity: "error", code: "XMI_NOT_XMI", message: "El archivo no es un documento XMI." }] };
  }
  const diagnostics: ImportDiagnostic[] = [];
  const version = attr(root, "xmi:version") ?? attr(root, "version");
  if (version !== "2.1") {
    diagnostics.push({ severity: "warning", code: "XMI_VERSION", message: `Versión XMI ${version ?? "desconocida"}; el formato soportado es XMI 2.1.` });
  }

  // Collect classifiers and associations from every package level; packages themselves are flattened.
  const classNodes: XmlNode[] = [];
  const enumNodes: XmlNode[] = [];
  const associationNodes: XmlNode[] = [];
  const properties = new Map<string, RawProperty>();
  let flattenedPackages = 0;
  const visit = (container: XmlNode, depth: number) => {
    for (const element of [...children(container, "packagedElement"), ...children(container, "nestedClassifier")]) {
      const type = typeOf(element);
      if (type === "uml:Package") {
        if (depth > 0) flattenedPackages += 1;
        visit(element, depth + 1);
      } else if (type === "uml:Class") classNodes.push(element);
      else if (type === "uml:Enumeration") enumNodes.push(element);
      else if (type === "uml:Association") associationNodes.push(element);
      else diagnostics.push({ severity: "info", code: "XMI_UNSUPPORTED_ELEMENT", message: `Se omitió un elemento ${type || "sin tipo"}${attr(element, "name") ? ` "${attr(element, "name")}"` : ""}.`, key: idOf(element) });
    }
  };
  const models = Object.entries(root).filter(([key, value]) => (key === "uml:Model" || key.endsWith(":Model")) && isNode(value)).map(([, value]) => value as XmlNode);
  for (const model of models.length > 0 ? models : [root]) visit(model, 0);
  if (flattenedPackages > 0) {
    diagnostics.push({ severity: "info", code: "XMI_PACKAGES_FLATTENED", message: `Se aplanaron ${flattenedPackages} paquete(s): las clases se importan sin paquete.` });
  }

  const namesById = new Map<string, string>();
  for (const node of [...classNodes, ...enumNodes]) {
    const id = idOf(node);
    if (id) namesById.set(id, attr(node, "name") ?? "");
  }
  // A property typed with a class id becomes a type name; the translator resolves it to a reference.
  const typeNameOf = (node: XmlNode): string | undefined => {
    const typeChild = isNode(node.type) ? node.type : undefined;
    const reference = attr(typeChild, "xmi:idref") ?? attr(node, "type");
    if (reference) return namesById.get(reference) ?? reference;
    const href = attr(typeChild, "href");
    return href ? href.slice(href.lastIndexOf("#") + 1) : undefined;
  };

  const classes: ImportClass[] = [];
  const relationships: ImportRelationship[] = [];
  for (const node of classNodes) {
    const key = idOf(node);
    const name = attr(node, "name")?.trim();
    if (!key || !name) {
      diagnostics.push({ severity: "warning", code: "XMI_UNNAMED_CLASS", message: "Se omitió una clase sin identificador o sin nombre.", key });
      continue;
    }
    const attributes: ImportAttribute[] = [];
    for (const property of children(node, "ownedAttribute")) {
      const propertyId = idOf(property);
      // Association ends owned by the class are relationships, not attributes.
      if (attr(property, "association")) {
        if (propertyId) properties.set(propertyId, { node: property, ownerId: key });
        continue;
      }
      const attributeName = attr(property, "name")?.trim();
      if (!propertyId || !attributeName) {
        diagnostics.push({ severity: "warning", code: "XMI_UNNAMED_ATTRIBUTE", message: `Se omitió un atributo sin nombre en "${name}".`, key });
        continue;
      }
      const typeName = typeNameOf(property);
      const multiplicity = multiplicityOf(property, propertyId, diagnostics);
      attributes.push({ key: propertyId, name: attributeName, type: typeName ?? "string", ...(visibilityOf(property) ? { visibility: visibilityOf(property) } : {}), ...(multiplicity ? { multiplicity } : {}) });
      if (!typeName) diagnostics.push({ severity: "warning", code: "XMI_MISSING_TYPE", message: `El atributo "${attributeName}" no tiene tipo; se usa string.`, key: propertyId });
    }
    const operations = children(node, "ownedOperation").length;
    if (operations > 0) diagnostics.push({ severity: "info", code: "XMI_OPERATIONS_OMITTED", message: `Se omitieron ${operations} operación(es) de "${name}".`, key });
    classes.push({ key, name, ...(visibilityOf(node) ? { visibility: visibilityOf(node) } : {}), attributes });
    for (const generalization of children(node, "generalization")) {
      const parent = attr(generalization, "general");
      if (parent) relationships.push({ key: idOf(generalization) ?? `${key}_gen_${parent}`, type: "Generalization", source: key, target: parent });
    }
  }

  const enumerations: ImportEnumeration[] = [];
  for (const node of enumNodes) {
    const key = idOf(node);
    const name = attr(node, "name")?.trim();
    if (!key || !name) {
      diagnostics.push({ severity: "warning", code: "XMI_UNNAMED_ENUMERATION", message: "Se omitió una enumeración sin identificador o sin nombre.", key });
      continue;
    }
    const literals = children(node, "ownedLiteral").map((literal) => attr(literal, "name")?.trim()).filter((literal): literal is string => Boolean(literal));
    enumerations.push({ key, name, ...(visibilityOf(node) ? { visibility: visibilityOf(node) } : {}), literals });
  }

  for (const node of associationNodes) {
    const key = idOf(node);
    for (const end of children(node, "ownedEnd")) {
      const endId = idOf(end);
      if (endId) properties.set(endId, { node: end });
    }
    const ends = children(node, "memberEnd").map((member) => attr(member, "xmi:idref")).map((endId) => (endId ? properties.get(endId) : undefined));
    if (!key || ends.length !== 2 || ends.some((end) => !end)) {
      diagnostics.push({ severity: "warning", code: "XMI_INVALID_ASSOCIATION", message: "Se omitió una asociación sin dos extremos reconocibles.", key });
      continue;
    }
    const [first, second] = ends as [RawProperty, RawProperty];
    const typeKey = (end: RawProperty) => attr(isNode(end.node.type) ? end.node.type : undefined, "xmi:idref") ?? attr(end.node, "type");
    const aggregationOf = (end: RawProperty) => attr(end.node, "aggregation") ?? "none";
    // The aggregation kind sits on the end typed by the part; the opposite end is the whole (our source).
    const partEnd = [first, second].find((end) => aggregationOf(end) !== "none");
    const [sourceEnd, targetEnd] = partEnd ? [partEnd === first ? second : first, partEnd] : [first, second];
    const type: UmlRelationshipType = !partEnd ? "Association" : aggregationOf(partEnd) === "composite" ? "Composition" : "Aggregation";
    const source = typeKey(sourceEnd);
    const target = typeKey(targetEnd);
    if (!source || !target) {
      diagnostics.push({ severity: "warning", code: "XMI_INVALID_ASSOCIATION", message: "Se omitió una asociación con extremos sin tipo.", key });
      continue;
    }
    const sourceMultiplicity = multiplicityOf(sourceEnd.node, key, diagnostics);
    const targetMultiplicity = multiplicityOf(targetEnd.node, key, diagnostics);
    relationships.push({
      key,
      type,
      ...(attr(node, "name")?.trim() ? { name: attr(node, "name")!.trim() } : {}),
      source,
      target,
      ...(sourceMultiplicity ? { sourceMultiplicity } : {}),
      ...(targetMultiplicity ? { targetMultiplicity } : {}),
    });
  }

  if (classes.length === 0 && enumerations.length === 0) {
    diagnostics.push({ severity: "warning", code: "XMI_EMPTY", message: "El XMI no contiene clases ni enumeraciones del subconjunto soportado." });
  }
  return { ok: true, proposal: { source: "xmi", classes, enumerations, relationships, diagnostics } };
}
