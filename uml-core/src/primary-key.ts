import type { CanonicalUmlModel, UmlAttribute, UmlClass, Uuid } from "./model.js";

// Single rule shared by the editor and the generators (relational-core): an attribute is the primary key when its
// generation metadata says so, and, without an explicit flag, when it is named exactly `id`.
export function isPrimaryKeyAttribute(attribute: Pick<UmlAttribute, "name" | "generationMetadata">): boolean {
  return attribute.generationMetadata?.identifier ?? attribute.name === "id";
}

export type PrimaryKeyStatus =
  | { kind: "single"; attributeId: Uuid }
  | { kind: "missing" }
  | { kind: "multiple"; attributeIds: Uuid[] }
  // Not mapped to a table (`entity: false`), or an association class without one: the generator adds a technical id.
  | { kind: "not-required" };

export function primaryKeyStatus(model: Pick<CanonicalUmlModel, "relationships">, umlClass: UmlClass): PrimaryKeyStatus {
  const keys = umlClass.attributes.filter(isPrimaryKeyAttribute).map((attribute) => attribute.id);
  if (keys.length === 1) return { kind: "single", attributeId: keys[0]! };
  if (keys.length > 1) return { kind: "multiple", attributeIds: keys };
  if (umlClass.generationMetadata?.entity === false) return { kind: "not-required" };
  const associationClass = model.relationships.some((relationship) => relationship.type === "Association" && relationship.associationClassId === umlClass.id);
  return associationClass ? { kind: "not-required" } : { kind: "missing" };
}
