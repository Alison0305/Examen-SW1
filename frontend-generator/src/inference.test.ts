import { describe, expect, it } from "vitest";
import { inferField, inferFields } from "./inference.js";
import type { ManifestAttribute } from "./model.js";

const attribute = (type: ManifestAttribute["type"], overrides: Partial<ManifestAttribute> = {}): ManifestAttribute => ({ name: "value", type, required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null, ...overrides });

describe("inferencia de controles", () => {
  it.each([["VARCHAR", "text"], ["BIGINT", "number"], ["NUMERIC", "number"], ["BOOLEAN", "checkbox"], ["DATE", "date"], ["TIMESTAMP_WITH_TIME_ZONE", "datetime-local"], ["ENUM", "select"]] as const)("convierte %s en %s", (type, control) => expect(inferField(attribute(type)).control).toBe(control));
  it("respeta obligatoriedad, unicidad, búsqueda y orden declarados", () => {
    expect(inferField(attribute("VARCHAR", { required: false, unique: true, searchable: true, sortable: true }))).toMatchObject({ required: false, unique: true, searchable: true, sortable: true });
  });
  it("usa selector para relaciones y excluye identificadores de PATCH", () => {
    expect(inferField(attribute("BIGINT"), { name: "usuario", target: "usuario", cardinality: "MANY_TO_ONE", lifecycle: "NONE", required: true }).control).toBe("relation-select");
    expect(inferFields([attribute("BIGINT", { name: "id", identifier: true }), attribute("VARCHAR", { name: "email" })], [], "patch").map((field) => field.name)).toEqual(["email"]);
  });
});
