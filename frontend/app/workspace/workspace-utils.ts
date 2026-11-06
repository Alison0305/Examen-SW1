import { primitiveType, type Multiplicity, type UmlPrimitiveTypeName, type UmlType, type UmlVisibility } from "@examen-sw1/uml-core";

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

export function formatType(type: UmlType): string {
  if (type.kind === "primitive") {
    return type.name;
  }

  return `${type.referenceType}:${type.elementId}`;
}

export function typeFromPrimitiveName(name: string): UmlType {
  return primitiveType(primitiveTypeNames.includes(name as UmlPrimitiveTypeName) ? (name as UmlPrimitiveTypeName) : "string");
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
