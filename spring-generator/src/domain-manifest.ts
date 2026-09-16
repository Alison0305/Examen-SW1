import type { RelationalModel, RelationalRelation, RelationalTable } from "@examen-sw1/relational-core";

const binary = (left: string, right: string): number => left === right ? 0 : left < right ? -1 : 1;
const pascal = (value: string): string => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
const camel = (value: string): string => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

type ManifestOperation = { name: string; method: string; path: string };
type JsonObject = { [key: string]: unknown };

/** Produces the fixed v1 wire contract from the relational source of truth. */
export function generateDomainManifest(model: RelationalModel): string {
  const joinTables = new Set(model.relations.flatMap((relation) => relation.joinTable ? [relation.joinTable] : []));
  const entities = model.tables
    .filter((table) => !joinTables.has(table.name) && (table.crud?.read ?? true))
    .sort((left, right) => binary(left.name, right.name))
    .map((table) => entityManifest(table, model));
  return `${JSON.stringify({ schemaVersion: 1, entities }, null, 2)}\n`;
}

/** Ensures the HTTP projection agrees with the runtime OpenAPI contract. */
export function verifyDomainManifestOpenApi(manifestJson: string, openApiJson: string): void {
  const manifest = JSON.parse(manifestJson) as { entities?: Array<{ operations?: ManifestOperation[] }> };
  const openApi = JSON.parse(openApiJson) as { paths?: JsonObject };
  if (!Array.isArray(manifest.entities) || !isObject(openApi.paths)) throw new Error("El Manifest u OpenAPI no tiene la estructura esperada.");
  for (const operation of manifest.entities.flatMap((entity) => entity.operations ?? [])) {
    const path = openApi.paths[operation.path];
    const declared = isObject(path) ? path[operation.method.toLowerCase()] : undefined;
    if (!isObject(declared) || declared.operationId !== operation.name) {
      throw new Error(`OpenAPI no verifica ${operation.method} ${operation.path} (${operation.name}).`);
    }
  }
}

function entityManifest(table: RelationalTable, model: RelationalModel) {
  const resourceName = table.resourceName ?? table.name;
  const crud = table.crud ?? { create: true, read: true, update: true, delete: true };
  const attributes = [...table.columns]
    .sort((left, right) => binary(left.name, right.name))
    .map((column) => ({
      name: camel(column.name),
      type: column.type,
      required: !column.nullable,
      identifier: column.identifier,
      unique: column.unique,
      searchable: column.searchable === true,
      sortable: column.sortable === true,
      defaultSort: column.defaultSort ?? null,
    }));
  const relations = model.relations
    .flatMap((relation) => relationManifest(table, relation, model))
    .sort((left, right) => binary(left.name, right.name));
  const operations: ManifestOperation[] = [
    ...(crud.create && !table.readOnly ? [{ name: `create${pascal(table.name)}`, method: "POST", path: `/api/v1/${resourceName}` }] : []),
    { name: `list${pascal(table.name)}`, method: "GET", path: `/api/v1/${resourceName}` },
    { name: `count${pascal(table.name)}`, method: "GET", path: `/api/v1/${resourceName}/count` },
    { name: `get${pascal(table.name)}`, method: "GET", path: `/api/v1/${resourceName}/{id}` },
    ...(crud.update && !table.readOnly ? [{ name: `update${pascal(table.name)}`, method: "PATCH", path: `/api/v1/${resourceName}/{id}` }] : []),
    ...(crud.delete && !table.readOnly ? [{ name: `delete${pascal(table.name)}`, method: "DELETE", path: `/api/v1/${resourceName}/{id}` }] : []),
    ...(relations.length ? [{ name: `get${pascal(table.name)}Relation`, method: "GET", path: `/api/v1/${resourceName}/{id}/relations/{relation}` }] : []),
  ].sort((left, right) => binary(left.name, right.name));
  return { name: table.name, resourceName, attributes, relations, operations };
}

function relationManifest(table: RelationalTable, relation: RelationalRelation, model: RelationalModel) {
  if (relation.sourceTable !== table.name && relation.targetTable !== table.name) return [];
  const target = relation.sourceTable === table.name ? relation.targetTable : relation.sourceTable;
  const foreignKey = relation.foreignKey
    ? model.tables.flatMap((candidate) => candidate.foreignKeys).find((candidate) => candidate.name === relation.foreignKey)
    : undefined;
  const ownsForeignKey = foreignKey && table.foreignKeys.some((candidate) => candidate.name === foreignKey.name);
  const name = ownsForeignKey ? camel(foreignKey.column) : relation.joinTable ? `${camel(target)}${pascal(relation.joinTable)}` : camel(target);
  const required = ownsForeignKey ? !table.columns.find((column) => column.name === foreignKey.column)!.nullable : false;
  return [{ name, target, cardinality: relation.cardinality, lifecycle: relation.lifecycle, required }];
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
