import { primitiveType, type CanonicalUmlModel, type Multiplicity, type UmlAttribute, type UmlPrimitiveTypeName, type UmlType, type UmlVisibility } from "@examen-sw1/uml-core";

const visibilitySymbols: Record<UmlVisibility, string> = {
  public: "+",
  private: "-",
  protected: "#",
  package: "~",
};

export function visibilitySymbol(visibility: UmlVisibility): string {
  return visibilitySymbols[visibility];
}

export const primitiveTypeNames: UmlPrimitiveTypeName[] = ["string", "integer", "boolean", "number", "date", "datetime"];

// Value of the inspector's type selector: the primitive name, or `enumeration:<id>` / `class:<id>` for a reference.
// It identifies the type unambiguously; it is never shown to the user (see `formatAttributeType`).
export function formatType(type: UmlType): string {
  if (type.kind === "primitive") {
    return type.name;
  }

  return `${type.referenceType}:${type.elementId}`;
}

export function typeFromPrimitiveName(name: string): UmlType {
  return primitiveType(primitiveTypeNames.includes(name as UmlPrimitiveTypeName) ? (name as UmlPrimitiveTypeName) : "string");
}

// Inverse of `formatType`: a reference value becomes that reference (the validator rejects one that does not exist);
// anything else is a primitive name, as before.
export function typeFromValue(value: string): UmlType {
  const match = /^(enumeration|class):(.+)$/.exec(value);
  if (match) {
    return { kind: "reference", referenceType: match[1] as "enumeration" | "class", elementId: match[2]! };
  }
  return typeFromPrimitiveName(value);
}

// UML notation of a type: the primitive name, or the name of the referenced enumeration or class. A reference that
// cannot be resolved shows `?`, never the internal id (the validator already reports it).
export function formatAttributeType(type: UmlType, model: Pick<CanonicalUmlModel, "classes" | "enumerations">): string {
  if (type.kind === "primitive") {
    return type.name;
  }
  const classifiers = type.referenceType === "enumeration" ? model.enumerations : model.classes;
  return classifiers.find((classifier) => classifier.id === type.elementId)?.name ?? "?";
}

// UML 2.5.1 attribute notation: `visibility name: Type [multiplicity]`. The multiplicity is omitted when it is absent
// or exactly 1, the UML default.
export function formatAttributeSignature(attribute: UmlAttribute, model: Pick<CanonicalUmlModel, "classes" | "enumerations">): string {
  return `${visibilitySymbol(attribute.visibility)} ${formatAttributeLabel(attribute, model)}`;
}

// The same notation without the visibility symbol (`name: Type [multiplicity]`), for lists where visibility is edited
// apart.
export function formatAttributeLabel(attribute: UmlAttribute, model: Pick<CanonicalUmlModel, "classes" | "enumerations">): string {
  const multiplicity = attribute.multiplicity;
  const suffix = multiplicity && !(multiplicity.lower === 1 && multiplicity.upper === 1) ? ` [${formatMultiplicity(multiplicity)}]` : "";
  return `${attribute.name}: ${formatAttributeType(attribute.type, model)}${suffix}`;
}

export function formatMultiplicity(value: Multiplicity | undefined): string {
  if (!value) {
    return "";
  }

  if (value.upper === value.lower) {
    return `${value.lower}`;
  }

  return `${value.lower}..${value.upper === "unbounded" ? "*" : value.upper}`;
}

// Common relationship multiplicities offered by the inspector menu. `*` is the same value as `0..*`.
export const MULTIPLICITY_PRESETS = [
  { value: "1", label: "Solo uno" },
  { value: "0..1", label: "Cero o uno" },
  { value: "0..*", label: "Cero o muchos" },
  { value: "1..*", label: "Uno o muchos" },
] as const;

export function parseMultiplicity(value: string): Multiplicity | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "*") {
    return { lower: 0, upper: "unbounded" };
  }

  if (!normalized.includes("..")) {
    const bound = Number(normalized);
    return { lower: bound, upper: bound };
  }

  const [lowerRaw, upperRaw] = normalized.split("..");
  return {
    lower: Number(lowerRaw),
    upper: upperRaw === "*" ? "unbounded" : Number(upperRaw),
  };
}
