import type { CanonicalUmlModel, UmlAttribute, UmlClass, Uuid } from "./model.js";

// Single rule shared by the editor and the generators (relational-core): an attribute is the primary key when its
// generation metadata says so, and, without an explicit flag, when it is named exactly `id`.
export function isPrimaryKeyAttribute(attribute: Pick<UmlAttribute, "name" | "generationMetadata">): boolean {
  return attribute.generationMetadata?.identifier ?? attribute.name === "id";
}

export type PrimaryKeyStatus =
  | { kind: "single"; attributeId: Uuid }
  // A subclass without its own key takes its parent's (through as many generalization levels as needed).
  | { kind: "inherited"; attributeId: Uuid; fromClassId: Uuid }
  | { kind: "missing" }
  | { kind: "multiple"; attributeIds: Uuid[] }
  // Not mapped to a table (`entity: false`), or an association class without one: the generator adds a technical id.
  | { kind: "not-required" };

export function primaryKeyStatus(model: Pick<CanonicalUmlModel, "classes" | "relationships">, umlClass: UmlClass): PrimaryKeyStatus {
  const keys = umlClass.attributes.filter(isPrimaryKeyAttribute).map((attribute) => attribute.id);
  if (keys.length === 1) return { kind: "single", attributeId: keys[0]! };
  if (keys.length > 1) return { kind: "multiple", attributeIds: keys };
  if (umlClass.generationMetadata?.entity === false) return { kind: "not-required" };
  const inherited = inheritedKey(model, umlClass, new Set([umlClass.id]));
  if (inherited) return { kind: "inherited", ...inherited };
  const associationClass = model.relationships.some((relationship) => relationship.type === "Association" && relationship.associationClassId === umlClass.id);
  return associationClass ? { kind: "not-required" } : { kind: "missing" };
}

// Same rule as relational-core: the first generalization parent (or ancestor) mapped to a table with exactly one key.
function inheritedKey(model: Pick<CanonicalUmlModel, "classes" | "relationships">, umlClass: UmlClass, visited: Set<Uuid>): { attributeId: Uuid; fromClassId: Uuid } | undefined {
  for (const relationship of model.relationships) {
    if (relationship.type !== "Generalization" || relationship.sourceId !== umlClass.id || visited.has(relationship.targetId)) continue;
    const parent = model.classes.find((entry) => entry.id === relationship.targetId);
    if (!parent || parent.generationMetadata?.entity === false) continue;
    visited.add(parent.id);
    const keys = parent.attributes.filter(isPrimaryKeyAttribute);
    if (keys.length === 1) return { attributeId: keys[0]!.id, fromClassId: parent.id };
    if (keys.length === 0) {
      const found = inheritedKey(model, parent, visited);
      if (found) return found;
    }
  }
  return undefined;
}
