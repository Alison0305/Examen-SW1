import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { DomainManifestOperation, DomainManifestV1 } from "@examen-sw1/spring-generator";
import { validateAssistantCommand } from "./index.js";

const operations = (name: string): readonly DomainManifestOperation[] => [
  { name: `list${name}`, method: "GET", path: `/api/v1/${name.toLowerCase()}` },
  { name: `get${name}`, method: "GET", path: `/api/v1/${name.toLowerCase()}/{id}` },
  { name: `create${name}`, method: "POST", path: `/api/v1/${name.toLowerCase()}` },
  { name: `update${name}`, method: "PATCH", path: `/api/v1/${name.toLowerCase()}/{id}` },
  { name: `delete${name}`, method: "DELETE", path: `/api/v1/${name.toLowerCase()}/{id}` },
  { name: `count${name}`, method: "GET", path: `/api/v1/${name.toLowerCase()}/count` },
];
const manifest: DomainManifestV1 = {
  schemaVersion: 1,
  entities: [
    { name: "rol", resourceName: "rol", attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }, { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: true, searchable: true, sortable: true, defaultSort: null }], relations: [{ name: "usuario", target: "usuario", cardinality: "ONE_TO_MANY", lifecycle: "NONE", required: false }], operations: operations("Rol") },
    { name: "usuario", resourceName: "usuario", attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }, { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: false, searchable: true, sortable: true, defaultSort: null }, { name: "activo", type: "BOOLEAN", required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }, { name: "saldo", type: "NUMERIC", required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }, { name: "fechaRegistro", type: "DATE", required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }, { name: "alias", type: "VARCHAR", required: false, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }], relations: [{ name: "rol", target: "rol", cardinality: "MANY_TO_ONE", lifecycle: "NONE", required: true }], operations: operations("Usuario") },
    { name: "sinId", resourceName: "sin-id", attributes: [], relations: [], operations: operations("SinId") },
    { name: "sinBusqueda", resourceName: "sin-busqueda", attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }], relations: [], operations: operations("SinBusqueda") },
  ],
};

const codes = (result: ReturnType<typeof validateAssistantCommand>) => result.ok ? [] : result.details?.map((detail) => detail.code) ?? [];

describe("validateAssistantCommand", () => {
  it("acepta operaciones y preserva el command original", () => {
    const command = { operation: "GET" as const, entity: "usuario", identifier: 1 };
    const result = validateAssistantCommand(command, manifest);
    expect(result).toEqual({ ok: true, command, data: command });
    expect(result.ok && result.command).toBe(command);
  });

  it("rechaza entidad u operación no autorizadas", () => {
    expect(codes(validateAssistantCommand({ operation: "LIST", entity: "ausente" }, manifest))).toContain("UNKNOWN_ENTITY");
    const withoutDelete = { ...manifest, entities: manifest.entities.map((entity) => entity.name === "usuario" ? { ...entity, operations: entity.operations.filter((operation) => !operation.name.toLowerCase().startsWith("delete")) } : entity) };
    expect(codes(validateAssistantCommand({ operation: "DELETE", entity: "usuario", identifier: 1 }, withoutDelete))).toContain("UNSUPPORTED_OPERATION");
  });

  it("valida identifier y entidades sin identifier", () => {
    expect(validateAssistantCommand({ operation: "GET", entity: "usuario", identifier: 1 }, manifest).ok).toBe(true);
    expect(codes(validateAssistantCommand({ operation: "GET", entity: "usuario", identifier: "1" }, manifest))).toContain("INVALID_IDENTIFIER_TYPE");
    expect(codes(validateAssistantCommand({ operation: "GET", entity: "sinId", identifier: 1 }, manifest))).toContain("MISSING_IDENTIFIER");
  });

  it("valida CREATE, required, tipos, null, arrays e identifier explícito", () => {
    const valid = { operation: "CREATE" as const, entity: "usuario", fields: { id: 1, nombre: "Ana", activo: true, saldo: 15.5, fechaRegistro: "2026-09-17", alias: null } };
    expect(validateAssistantCommand(valid, manifest).ok).toBe(true);
    expect(codes(validateAssistantCommand({ operation: "CREATE", entity: "usuario", fields: { id: 1 } }, manifest))).toContain("MISSING_REQUIRED_FIELD");
    expect(codes(validateAssistantCommand({ operation: "CREATE", entity: "usuario", fields: { id: 1, nombre: 1, activo: "true", saldo: "15", fechaRegistro: "2026-09-17", desconocido: "x" } }, manifest))).toEqual(expect.arrayContaining(["INVALID_FIELD_TYPE", "UNKNOWN_FIELD"]));
    expect(codes(validateAssistantCommand({ operation: "CREATE", entity: "usuario", fields: { id: 1, nombre: "Ana", activo: true, saldo: 1, fechaRegistro: null } }, manifest))).toContain("INVALID_FIELD_TYPE");
    expect(codes(validateAssistantCommand({ operation: "CREATE", entity: "usuario", fields: { id: 1, nombre: ["Ana"], activo: true, saldo: 1, fechaRegistro: "2026-09-17" } }, manifest))).toContain("INVALID_FIELD_TYPE");
  });

  it("valida UPDATE", () => {
    expect(validateAssistantCommand({ operation: "UPDATE", entity: "usuario", identifier: 1, fields: { nombre: "Ana" } }, manifest).ok).toBe(true);
    expect(codes(validateAssistantCommand({ operation: "UPDATE", entity: "usuario", identifier: 1, fields: {} }, manifest))).toContain("EMPTY_FIELDS");
    expect(codes(validateAssistantCommand({ operation: "UPDATE", entity: "usuario", identifier: 1, fields: { id: 2 } }, manifest))).toContain("IMMUTABLE_IDENTIFIER");
  });

  it("valida SEARCH", () => {
    expect(validateAssistantCommand({ operation: "SEARCH", entity: "usuario", criteria: { query: "Ana" } }, manifest).ok).toBe(true);
    expect(codes(validateAssistantCommand({ operation: "SEARCH", entity: "sinBusqueda", criteria: { query: "Ana" } }, manifest))).toContain("UNSEARCHABLE_QUERY");
    expect(codes(validateAssistantCommand({ operation: "SEARCH", entity: "usuario", criteria: { query: "  " } }, manifest))).toContain("EMPTY_SEARCH_CRITERIA");
    expect(validateAssistantCommand({ operation: "SEARCH", entity: "usuario", criteria: { fields: { activo: true } } }, manifest).ok).toBe(true);
    expect(codes(validateAssistantCommand({ operation: "SEARCH", entity: "usuario", criteria: { fields: { desconocido: true, saldo: "1" } } }, manifest))).toEqual(expect.arrayContaining(["UNKNOWN_FIELD", "INVALID_FIELD_TYPE"]));
  });

  it("valida relaciones y COUNT", () => {
    expect(validateAssistantCommand({ operation: "LIST", entity: "usuario", relation: { name: "rol", sourceIdentifier: 1 } }, manifest).ok).toBe(true);
    expect(codes(validateAssistantCommand({ operation: "LIST", entity: "usuario", relation: { name: "ausente", sourceIdentifier: 1 } }, manifest))).toContain("UNKNOWN_RELATION");
    const missingTarget = { ...manifest, entities: manifest.entities.map((entity) => entity.name === "usuario" ? { ...entity, relations: [{ ...entity.relations[0]!, target: "ausente" }] } : entity) };
    expect(codes(validateAssistantCommand({ operation: "LIST", entity: "usuario", relation: { name: "rol", sourceIdentifier: 1 } }, missingTarget))).toContain("UNKNOWN_RELATION_TARGET");
    expect(codes(validateAssistantCommand({ operation: "COUNT", entity: "usuario", relation: { name: "rol", sourceIdentifier: "1" } }, manifest))).toContain("INVALID_RELATION_IDENTIFIER");
    expect(validateAssistantCommand({ operation: "COUNT", entity: "usuario" }, manifest).ok).toBe(true);
  });

  it("no importa transporte ni construye URLs", async () => {
    const source = await readFile(new URL("./validator.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["'](?:node:)?(?:http|https)["']|\bfetch\b|\baxios\b|https?:\/\//);
  });

  it("usa VALIDATION_ERROR para rechazos", () => {
    const result = validateAssistantCommand({ operation: "LIST", entity: "ausente" }, manifest);
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});
