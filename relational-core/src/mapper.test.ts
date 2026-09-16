import { describe, expect, it } from "vitest";
import type { CanonicalUmlModel } from "@examen-sw1/uml-core";
import { mapToRelationalModel } from "./index.js";

const ids = { user: "11111111-1111-4111-8111-111111111111", profile: "22222222-2222-4222-8222-222222222222", order: "33333333-3333-4333-8333-333333333333", product: "44444444-4444-4444-8444-444444444444", status: "55555555-5555-4555-8555-555555555555", relation: "66666666-6666-4666-8666-666666666666", relationTwo: "77777777-7777-4777-8777-777777777777", relationThree: "88888888-8888-4888-8888-888888888888" };
const attribute = (id: string, name: string, type: CanonicalUmlModel["classes"][number]["attributes"][number]["type"], metadata = {}) => ({ id, name, visibility: "private" as const, type, generationMetadata: metadata });
const entity = (id: string, name: string, keyType: "string" | "integer" = "integer", extra: CanonicalUmlModel["classes"][number]["attributes"] = []) => ({ id, name, visibility: "public" as const, attributes: [attribute(`${id.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, "id", { kind: "primitive" as const, name: keyType }, { identifier: true }), ...extra], operations: [], generationMetadata: { entity: true } });
function model(): CanonicalUmlModel { return { packages: [], enumerations: [{ id: ids.status, name: "Estado", visibility: "public", literals: ["NUEVO", "ACTIVO"] }], classes: [entity(ids.product, "Producto"), entity(ids.order, "Pedido", "integer", [attribute("99999999-9999-4999-8999-999999999999", "estado", { kind: "reference", referenceType: "enumeration", elementId: ids.status }, { required: true, unique: true, indexed: true })]), entity(ids.profile, "Perfil"), entity(ids.user, "Usuario")], relationships: [] }; }

describe("RelationalMapper", () => {
  it("proyecta primitivas, enum, PK, restricciones y colecciones inmutables", () => {
    const input = model();
    input.classes[0].attributes.push(attribute("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "texto", { kind: "primitive", name: "string" }), attribute("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "activo", { kind: "primitive", name: "boolean" }), attribute("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "importe", { kind: "primitive", name: "number" }), attribute("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "fecha", { kind: "primitive", name: "date" }), attribute("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "creadoEn", { kind: "primitive", name: "datetime" }));
    const result = mapToRelationalModel(input);
    const pedido = result.tables.find((table) => table.name === "pedido")!;
    expect(result.tables.map((table) => table.name)).toEqual(["pedido", "perfil", "producto", "usuario"]);
    expect(pedido).toMatchObject({ primaryKey: "id", uniqueConstraints: [{ name: "uq_pedido_estado", columns: ["estado"] }], indexes: ["idx_pedido_estado"] });
    expect(pedido.columns.find((column) => column.name === "estado")).toMatchObject({ type: "ENUM", enumName: "estado", nullable: false, source: { path: "classes[1].attributes[1]" } });
    expect(result.tables.find((table) => table.name === "producto")?.columns.map((column) => column.type)).toEqual(["BOOLEAN", "TIMESTAMP_WITH_TIME_ZONE", "DATE", "BIGINT", "NUMERIC", "VARCHAR"]);
    expect(Object.isFrozen(result.tables)).toBe(true);
    expect(Object.isFrozen(pedido.uniqueConstraints[0].columns)).toBe(true);
    expect(result).toMatchObject({ hasErrors: false, success: true });
  });

  it("propaga metadata API y bloquea recursos CRUD sin identifier", () => {
    const input = model();
    input.classes[0].generationMetadata = { entity: true, crud: { create: true, read: true, update: false, delete: false }, readOnly: true, resourceName: "catalogo-productos" };
    input.classes[0].attributes.push(attribute("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "nombre", { kind: "primitive", name: "string" }, { searchable: true, sortable: true, defaultSort: "desc" }));
    const result = mapToRelationalModel(input);
    expect(result.tables.find((table) => table.name === "producto")).toMatchObject({ resourceName: "catalogo-productos", readOnly: true, crud: { update: false } });
    expect(result.tables.find((table) => table.name === "producto")?.columns.find((column) => column.name === "nombre")).toMatchObject({ searchable: true, sortable: true, defaultSort: "DESC" });
    input.classes[0].attributes[0].generationMetadata = {};
    expect(mapToRelationalModel(input).diagnostics).toContainEqual(expect.objectContaining({ code: "REL_CRUD_REQUIRES_PRIMARY_KEY", severity: "error" }));
  });

  it("hereda el tipo real de PK para FK de asociaciones y no crea FKs sin PK única", () => {
    const input = model();
    input.classes = [entity(ids.user, "Usuario", "string"), entity(ids.order, "Pedido")];
    input.relationships = [{ id: ids.relation, type: "Association", sourceId: ids.user, targetId: ids.order, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }];
    const result = mapToRelationalModel(input);
    expect(result.tables.find((table) => table.name === "pedido")?.columns.find((column) => column.name === "usuario_id")?.type).toBe("VARCHAR");
    input.classes[0].attributes[0].generationMetadata = {};
    const missing = mapToRelationalModel(input);
    expect(missing.tables.find((table) => table.name === "pedido")?.foreignKeys).toEqual([]);
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: "REL_RELATIONSHIP_REQUIRES_PRIMARY_KEY", severity: "error" }));
    input.classes[0].attributes[0].generationMetadata = { identifier: true };
    input.classes[0].attributes.push(attribute("abababab-abab-4bab-8bab-abababababab", "otherId", { kind: "primitive", name: "string" }, { identifier: true }));
    const multiple = mapToRelationalModel(input);
    expect(multiple.tables.find((table) => table.name === "pedido")?.foreignKeys).toEqual([]);
    expect(multiple.diagnostics).toContainEqual(expect.objectContaining({ code: "REL_MULTIPLE_PRIMARY_KEYS" }));
  });

  it("crea tablas N:M distintas con unique compuesto y FKs tipadas", () => {
    const input = model();
    input.classes = [entity(ids.user, "Usuario", "string"), entity(ids.product, "Producto")];
    input.relationships = [
      { id: ids.relation, name: "favoritos", type: "Association", sourceId: ids.user, targetId: ids.product, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
      { id: ids.relationTwo, name: "historial", type: "Association", sourceId: ids.user, targetId: ids.product, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    ];
    const result = mapToRelationalModel(input);
    const joins = result.tables.filter((table) => table.name.startsWith("producto_usuario_"));
    expect(joins.map((table) => table.name)).toEqual(["producto_usuario_favoritos", "producto_usuario_historial"]);
    expect(joins[0].uniqueConstraints).toEqual([{ name: "uq_producto_usuario_favoritos_producto_id_usuario_id", columns: ["producto_id", "usuario_id"] }]);
    expect(joins[0].columns.find((column) => column.name === "usuario_id")?.type).toBe("VARCHAR");
  });

  it("usa el ID estable cuando una relación N:M no tiene nombre", () => {
    const input = model();
    input.relationships = [{ id: ids.relation, type: "Association", sourceId: ids.user, targetId: ids.product, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" } }];
    expect(mapToRelationalModel(input).tables.map((table) => table.name)).toContain("producto_usuario_relation_66666666666646668666666666666666");
  });

  it("omite no-entidades y bloquea relaciones que las alcanzan", () => {
    const input = model();
    input.classes[2].generationMetadata = undefined;
    input.relationships = [{ id: ids.relation, type: "Association", sourceId: ids.user, targetId: ids.profile, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 1, upper: 1 } }];
    const result = mapToRelationalModel(input);
    expect(result.tables.map((table) => table.name)).not.toContain("perfil");
    expect(result.relations).toEqual([]);
    expect(result).toMatchObject({ hasErrors: true, success: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "REL_NON_ENTITY_RELATIONSHIP" }));
  });

  it("rechaza nombres fuente con espacios, guiones o símbolos sin sanearlos", () => {
    const input = model();
    input.classes[0].name = "Producto-Especial";
    input.classes[1].attributes[1].name = "estado actual";
    input.enumerations[0].name = "Estado!";
    const result = mapToRelationalModel(input);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "REL_INVALID_IDENTIFIER").map((diagnostic) => diagnostic.elementId)).toEqual([ids.product, "99999999-9999-4999-8999-999999999999", ids.status]);
    expect(result.tables.map((table) => table.name)).toContain("producto-especial");
  });

  it("informa tipos no soportados y no crea una columna VARCHAR falsa", () => {
    const input = model();
    input.classes[0].attributes.push(attribute("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "externo", { kind: "primitive", name: "uuid" as "integer" }));
    const result = mapToRelationalModel(input);
    expect(result.tables.find((table) => table.name === "producto")?.columns.map((column) => column.name)).not.toContain("externo");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "REL_UNSUPPORTED_TYPE", severity: "error" }));
  });

  it("mapea 1:1 explícito y fallback SOURCE, 1:N, agregación y composición", () => {
    const input = model();
    input.relationships = [
      { id: ids.relation, type: "Association", sourceId: ids.user, targetId: ids.profile, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 1, upper: 1 }, foreignKeyOwner: "TARGET" },
      { id: ids.relationTwo, type: "Aggregation", sourceId: ids.user, targetId: ids.order, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
      { id: ids.relationThree, type: "Composition", sourceId: ids.order, targetId: ids.product, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 1, upper: "unbounded" } },
    ];
    const result = mapToRelationalModel(input);
    expect(result.tables.find((table) => table.name === "perfil")?.foreignKeys).toContainEqual(expect.objectContaining({ column: "usuario_id" }));
    expect(result.tables.find((table) => table.name === "pedido")?.foreignKeys).toContainEqual(expect.objectContaining({ column: "usuario_id", lifecycle: "NONE" }));
    expect(result.tables.find((table) => table.name === "producto")?.foreignKeys).toContainEqual(expect.objectContaining({ column: "pedido_id", lifecycle: "COMPOSITION" }));
    delete input.relationships[0].foreignKeyOwner;
    const fallback = mapToRelationalModel(input);
    expect(fallback.tables.find((table) => table.name === "usuario")?.foreignKeys).toContainEqual(expect.objectContaining({ column: "perfil_id" }));
    expect(fallback.diagnostics).toContainEqual(expect.objectContaining({ code: "REL_ONE_TO_ONE_OWNER_FALLBACK", severity: "warning" }));
  });

  it("proyecta JOINED con el tipo de PK declarado y bloquea tipos incompatibles", () => {
    const input = model();
    input.classes = [entity(ids.user, "Usuario", "string"), entity(ids.profile, "Perfil", "string")];
    input.relationships = [{ id: ids.relation, type: "Generalization", sourceId: ids.profile, targetId: ids.user }];
    const joined = mapToRelationalModel(input).tables.find((table) => table.name === "perfil")!;
    expect(joined).toMatchObject({ inheritsFrom: "usuario", inheritanceStrategy: "JOINED" });
    expect(joined.columns.find((column) => column.name === "id")?.type).toBe("VARCHAR");
    expect(joined.foreignKeys).toContainEqual(expect.objectContaining({ column: "id", targetColumn: "id" }));
    input.classes[1].attributes[0].type = { kind: "primitive", name: "integer" };
    const mismatch = mapToRelationalModel(input);
    expect(mismatch.tables.find((table) => table.name === "perfil")?.foreignKeys).toEqual([]);
    expect(mismatch.diagnostics).toContainEqual(expect.objectContaining({ code: "REL_JOINED_PRIMARY_KEY_TYPE_MISMATCH" }));
  });

  it("ordena por nombre semántico normalizado e ID con comparación binaria", () => {
    const input = model();
    input.classes = [entity(ids.profile, "Usuario"), entity(ids.user, "usuario")];
    const result = mapToRelationalModel(input);
    expect(result.tables.map((table) => table.source.elementId)).toEqual([ids.user, ids.profile]);
    expect(mapToRelationalModel(structuredClone(input))).toEqual(result);
  });
});
