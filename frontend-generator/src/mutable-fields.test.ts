import { describe, expect, it } from "vitest";
import { deriveMutableFields } from "./mutable-fields.js";
import type { ManifestEntity, OpenApiDocument } from "./model.js";

const entity: ManifestEntity = { name: "rol", resourceName: "rol", attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }, { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: false, searchable: true, sortable: true, defaultSort: null }], relations: [{ name: "usuario", target: "usuario", cardinality: "ONE_TO_MANY", lifecycle: "NONE", required: false }, { name: "rol", target: "rol", cardinality: "MANY_TO_ONE", lifecycle: "NONE", required: true }], operations: [{ name: "createRol", method: "POST", path: "/api/v1/rol" }, { name: "updateRol", method: "PATCH", path: "/api/v1/rol/{id}" }] };
const openApi: OpenApiDocument = { paths: { "/api/v1/rol": { post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/CreateRolRequest" } } } } } }, "/api/v1/rol/{id}": { patch: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateRolRequest" } } } } } } }, components: { schemas: { CreateRolRequest: { properties: { id: { type: "integer" }, nombre: { type: "string" } }, required: ["id", "nombre"] }, UpdateRolRequest: { properties: { nombre: { type: "string" } } } } } };
const usuario: ManifestEntity = { ...entity, name: "usuario", resourceName: "usuario", attributes: [...entity.attributes, { name: "activo", type: "BOOLEAN", required: true, identifier: false, unique: false, searchable: false, sortable: true, defaultSort: null }], relations: [{ name: "rol", target: "Rol", cardinality: "MANY_TO_ONE", lifecycle: "NONE", required: true }], operations: [{ name: "createUsuario", method: "POST", path: "/api/v1/usuario" }] };
const usuarioOpenApi: OpenApiDocument = { paths: { "/api/v1/usuario": { post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/CreateUsuarioRequest" } } } } } } }, components: { schemas: { CreateUsuarioRequest: { properties: { id: { type: "integer" }, nombre: { type: "string" }, activo: { type: "boolean" }, rolId: { type: "integer" } }, required: ["id", "nombre", "activo", "rolId"] } } } };

describe("deriveMutableFields", () => {
  it("deriva campos create/update, relaciones y refs locales de forma inmutable", () => {
    const input = structuredClone(openApi); const first = deriveMutableFields(entity, openApi); const second = deriveMutableFields(entity, openApi);
    expect(first).toEqual(second); expect(openApi).toEqual(input); expect(first.createFields.map((field) => field.wireName)).toEqual(["id", "nombre"]); expect(first.updateFields.map((field) => field.wireName)).toEqual(["nombre"]); expect(first.createFields.map((field) => field.wireName)).not.toContain("usuario");
  });
  it("rechaza refs inexistentes y externas", () => {
    expect(() => deriveMutableFields(entity, { ...openApi, components: { schemas: {} } })).toThrow("OpenAPI ref inexistente");
    expect(() => deriveMutableFields(entity, { ...openApi, paths: { "/api/v1/rol": { post: { requestBody: { content: { "application/json": { schema: { $ref: "https://example.test/schema" } } } } } }, "/api/v1/rol/{id}": openApi.paths["/api/v1/rol/{id}"]! } })).toThrow("OpenAPI solo admite refs locales");
  });
  it("asocia rolId de Usuario con Rol sin cambiar su wire name", () => {
    const result = deriveMutableFields(usuario, usuarioOpenApi);
    expect(result.createFields.find((field) => field.wireName === "rolId")).toMatchObject({ wireName: "rolId", semanticRelation: "rol", relationTarget: "Rol" });
    expect(usuarioOpenApi.components?.schemas?.CreateUsuarioRequest.properties?.rolId).toBeDefined();
  });
});
