import type { DomainManifestV1 } from "@examen-sw1/spring-generator";

export const usuarioManifest: DomainManifestV1 = {
  schemaVersion: 1,
  entities: [{
    name: "usuario",
    resourceName: "usuario",
    attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }, { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: false, searchable: true, sortable: true, defaultSort: null }],
    relations: [],
    operations: ["list", "get", "create", "update", "delete", "count"].map((prefix) => ({ name: `${prefix}Usuario`, method: "GET" as const, path: "/api/v1/usuario" })),
  }],
};
