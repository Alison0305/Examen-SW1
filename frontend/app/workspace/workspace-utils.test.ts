import { describe, expect, it } from "vitest";
import { formatMultiplicity, MULTIPLICITY_PRESETS, parseMultiplicity } from "./workspace-utils";

describe("parseMultiplicity", () => {
  it("interpreta las multiplicidades típicas del menú", () => {
    expect(parseMultiplicity("1")).toEqual({ lower: 1, upper: 1 });
    expect(parseMultiplicity("0..1")).toEqual({ lower: 0, upper: 1 });
    expect(parseMultiplicity("0..*")).toEqual({ lower: 0, upper: "unbounded" });
    expect(parseMultiplicity("1..*")).toEqual({ lower: 1, upper: "unbounded" });
  });

  it("trata * como 0..* y acepta valores personalizados", () => {
    expect(parseMultiplicity(" * ")).toEqual({ lower: 0, upper: "unbounded" });
    expect(parseMultiplicity("2..5")).toEqual({ lower: 2, upper: 5 });
    expect(parseMultiplicity("3..*")).toEqual({ lower: 3, upper: "unbounded" });
    expect(parseMultiplicity("   ")).toBeUndefined();
  });

  it("cada opción del menú se formatea igual a su valor", () => {
    for (const preset of MULTIPLICITY_PRESETS) expect(formatMultiplicity(parseMultiplicity(preset.value))).toBe(preset.value);
    expect(formatMultiplicity(parseMultiplicity("*"))).toBe("0..*");
  });
});
