import { describe, expect, it } from "vitest";
import { deriveStandaloneMutableFields } from "./standalone-mutable-fields.js";

const source = { elementId: "11111111-1111-4111-8111-111111111111", path: "tables[0]" };
describe("deriveStandaloneMutableFields", () => {
  it("incluye campos create y excluye identifier en update", () => {
    const fields = deriveStandaloneMutableFields({ source, name: "producto", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }, { source, name: "nombre", type: "VARCHAR", nullable: false, identifier: false, unique: false }, { source, name: "precio", type: "NUMERIC", nullable: false, identifier: false, unique: false }, { source, name: "interno", type: "BIGINT", nullable: false, identifier: false, unique: false, generated: true }], uniqueConstraints: [], indexes: [], foreignKeys: [] });
    expect(fields.createFields.map((field) => field.wireName)).toEqual(["id", "nombre", "precio"]);
    expect(fields.updateFields.map((field) => field.wireName)).toEqual(["nombre", "precio"]);
  });
  it("conserva wireName y target de una FK propietaria", () => {
    const fields = deriveStandaloneMutableFields({ source, name: "venta", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }, { source, name: "cliente_id", type: "BIGINT", nullable: false, identifier: false, unique: false }, { source, name: "cantidad", type: "NUMERIC", nullable: false, identifier: false, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: "fk_venta_cliente", column: "cliente_id", targetTable: "cliente", targetColumn: "id", lifecycle: "NONE" }] });
    expect(fields.createFields.map((field) => field.wireName)).toEqual(["id", "clienteId", "cantidad"]);
    expect(fields.updateFields.map((field) => field.wireName)).toEqual(["clienteId", "cantidad"]);
    expect(fields.createFields[1]).toMatchObject({ relation: true, relationTarget: "cliente", schemaType: "integer" });
  });
});
