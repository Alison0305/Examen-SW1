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

export function parseMultiplicity(value: string): Multiplicity | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
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
