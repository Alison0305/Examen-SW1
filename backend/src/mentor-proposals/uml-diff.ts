import type { CanonicalUmlModel, UmlAttribute, UmlClass, UmlType } from "@examen-sw1/uml-core";
import { MENTOR_PROPOSAL_DIFF_ELEMENTS, type MentorProposalDiffLine } from "./mentor-proposal.contracts";
import { formatMentorProposalMultiplicity } from "./mentor-proposal-multiplicity";

// Semantic diff between two canonical UML models. It is computed only from the authoritative document and the
// candidate produced by the real executor; it never comes from the instruction text or the assistant.
// Only `uml` is compared, so revision, timestamps and layout can never produce a line.
// Elements are correlated by id internally; ids are used for ordering ties but never appear in a label.
// v1 scope: classes (added, removed, renamed) and attributes (added, removed, changed name, type or multiplicity).
// Enumerations and relationships are part of the contract vocabulary but are not compared yet.

type Entry = Readonly<{ line: MentorProposalDiffLine; sortKey: readonly string[] }>;
type AttributeOwner = Readonly<{ umlClass: UmlClass; attribute: UmlAttribute }>;

const ARROW = " → ";

// Code point comparison: independent of the runtime locale.
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEntries(left: Entry, right: Entry): number {
  const category = MENTOR_PROPOSAL_DIFF_ELEMENTS.indexOf(left.line.element) - MENTOR_PROPOSAL_DIFF_ELEMENTS.indexOf(right.line.element);
  if (category !== 0) return category;
  for (let index = 0; index < Math.max(left.sortKey.length, right.sortKey.length); index += 1) {
    const result = compareText(left.sortKey[index] ?? "", right.sortKey[index] ?? "");
    if (result !== 0) return result;
  }
  return 0;
}

// Primitive types show their canonical name; references show the referenced element's name in the same model.
function typeLabel(type: UmlType, model: CanonicalUmlModel): string {
  if (type.kind === "primitive") return type.name;
  const elements = type.referenceType === "class" ? model.classes : model.enumerations;
  return elements.find((element) => element.id === type.elementId)?.name ?? "referencia no resuelta";
}

// "Cliente.teléfono: string" or "Cliente.correos: string [0..*]". Visibility is not part of the label.
function attributeLabel({ umlClass, attribute }: AttributeOwner, model: CanonicalUmlModel): string {
  const multiplicity = attribute.multiplicity ? ` [${formatMentorProposalMultiplicity(attribute.multiplicity)}]` : "";
  return `${umlClass.name}.${attribute.name}: ${typeLabel(attribute.type, model)}${multiplicity}`;
}

// Attribute semantics compared for "changed": name, type and multiplicity, independent of the owning class name.
function attributeSignature(attribute: UmlAttribute, model: CanonicalUmlModel): string {
  const multiplicity = attribute.multiplicity ? formatMentorProposalMultiplicity(attribute.multiplicity) : "";
  return JSON.stringify([attribute.name, typeLabel(attribute.type, model), multiplicity]);
}

function attributesById(model: CanonicalUmlModel): Map<string, AttributeOwner> {
  const owners = new Map<string, AttributeOwner>();
  for (const umlClass of model.classes) for (const attribute of umlClass.attributes) owners.set(attribute.id, { umlClass, attribute });
  return owners;
}

const attributeSortKey = ({ umlClass, attribute }: AttributeOwner): readonly string[] => [umlClass.name, umlClass.id, attribute.name, attribute.id];

export function diffCanonicalUml(before: CanonicalUmlModel, after: CanonicalUmlModel): readonly MentorProposalDiffLine[] {
  const entries: Entry[] = [];

  const beforeClasses = new Map(before.classes.map((umlClass) => [umlClass.id, umlClass] as const));
  const afterClasses = new Map(after.classes.map((umlClass) => [umlClass.id, umlClass] as const));
  for (const umlClass of after.classes) {
    const previous = beforeClasses.get(umlClass.id);
    if (!previous) entries.push({ line: { kind: "added", element: "class", label: `Clase ${umlClass.name}` }, sortKey: [umlClass.name, umlClass.id] });
    else if (previous.name !== umlClass.name) entries.push({ line: { kind: "changed", element: "class", label: `Clase ${previous.name}${ARROW}Clase ${umlClass.name}` }, sortKey: [umlClass.name, umlClass.id] });
  }
  for (const umlClass of before.classes) {
    if (!afterClasses.has(umlClass.id)) entries.push({ line: { kind: "removed", element: "class", label: `Clase ${umlClass.name}` }, sortKey: [umlClass.name, umlClass.id] });
  }

  const beforeAttributes = attributesById(before);
  const afterAttributes = attributesById(after);
  for (const [id, current] of afterAttributes) {
    const previous = beforeAttributes.get(id);
    if (!previous) {
      entries.push({ line: { kind: "added", element: "attribute", label: attributeLabel(current, after) }, sortKey: attributeSortKey(current) });
    } else if (attributeSignature(previous.attribute, before) !== attributeSignature(current.attribute, after)) {
      entries.push({ line: { kind: "changed", element: "attribute", label: `${attributeLabel(previous, before)}${ARROW}${attributeLabel(current, after)}` }, sortKey: attributeSortKey(current) });
    }
  }
  for (const [id, previous] of beforeAttributes) {
    if (!afterAttributes.has(id)) entries.push({ line: { kind: "removed", element: "attribute", label: attributeLabel(previous, before) }, sortKey: attributeSortKey(previous) });
  }

  return entries.sort(compareEntries).map((entry) => entry.line);
}
