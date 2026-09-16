import { createHash } from "node:crypto";
import { convert } from "openapi-to-postmanv2";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export interface PostmanConversion {
  readonly collection: JsonObject;
  readonly rawSha256: string;
  readonly canonicalSha256: string;
}

export interface PostmanDeterminismResult {
  readonly first: PostmanConversion;
  readonly second: PostmanConversion;
  readonly differingPaths: readonly string[];
}

export async function verifyPostmanDeterminism(openApi: string, repeatedOpenApi: string): Promise<PostmanDeterminismResult> {
  const firstCollection = await convertOpenApi(openApi);
  const secondCollection = await convertOpenApi(repeatedOpenApi);
  assertCollectionContract(firstCollection, openApi);
  assertCollectionContract(secondCollection, repeatedOpenApi);

  const differingPaths = jsonDifferingPaths(firstCollection, secondCollection);
  const first = hashes(firstCollection);
  const second = hashes(secondCollection);
  if (first.canonicalSha256 !== second.canonicalSha256) {
    const structuralPaths = jsonDifferingPaths(JSON.parse(canonicalizePostmanCollection(firstCollection)) as JsonValue, JSON.parse(canonicalizePostmanCollection(secondCollection)) as JsonValue);
    const firstQuery = queryStructures(JSON.parse(canonicalizePostmanCollection(firstCollection)) as JsonValue)[0];
    const secondQuery = queryStructures(JSON.parse(canonicalizePostmanCollection(secondCollection)) as JsonValue)[0];
    throw new Error(`La conversión Postman tiene diferencias estructurales: ${structuralPaths.join(", ") || differingPaths.join(", ") || "raíz"}. Primera query: ${JSON.stringify(firstQuery)} != ${JSON.stringify(secondQuery)}.`);
  }
  return { first, second, differingPaths };
}

export function canonicalizePostmanCollection(collection: JsonObject): string {
  return JSON.stringify(canonicalize(collection, "root"));
}

export function jsonDifferingPaths(first: JsonValue, second: JsonValue, path = "$"): string[] {
  if (Object.is(first, second)) return [];
  if (Array.isArray(first) && Array.isArray(second)) {
    if (first.length !== second.length) return [path];
    return first.flatMap((value, index) => jsonDifferingPaths(value, second[index], `${path}[${index}]`));
  }
  if (isObject(first) && isObject(second)) {
    const keys = [...new Set([...Object.keys(first), ...Object.keys(second)])].sort();
    return keys.flatMap((key) => key in first && key in second
      ? jsonDifferingPaths(first[key], second[key], `${path}[${JSON.stringify(key)}]`)
      : [`${path}[${JSON.stringify(key)}]`]);
  }
  return [path];
}

function hashes(collection: JsonObject): PostmanConversion {
  return {
    collection,
    rawSha256: sha256(JSON.stringify(collection)),
    canonicalSha256: sha256(canonicalizePostmanCollection(collection)),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: JsonValue, location: string): JsonValue {
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${location}[${index}]`));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => {
    const child = value[key];
    const childLocation = `${location}.${key}`;
    if (isUuidMetadata(child, value, location, key)) return [key, "<uuid>"];
    if (key === "value" && location.includes(".query[") && isScalar(child)) return [key, scalarShape(child)];
    if (key === "raw" && location.endsWith(".body") && typeof child === "string") return [key, jsonExampleShape(child)];
    if (key === "body" && location.includes(".response[") && typeof child === "string") return [key, jsonExampleShape(child)];
    return [key, canonicalize(child, childLocation)];
  }));
}

function isUuidMetadata(value: JsonValue, parent: JsonObject, location: string, key: string): boolean {
  if (typeof value !== "string") return false;
  return (location === "root.info" && key === "_postman_id")
    || (key === "id" && (isPostmanItem(parent) || location.includes(".response[")));
}

function isPostmanItem(value: JsonObject): boolean {
  return "request" in value || "item" in value;
}

function jsonExampleShape(value: string): string {
  try {
    return JSON.stringify(jsonShape(JSON.parse(value) as JsonValue));
  } catch {
    return value;
  }
}

function jsonShape(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(jsonShape);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, jsonShape(value[key])]));
  return scalarShape(value);
}

function isScalar(value: JsonValue): value is null | boolean | number | string {
  return !Array.isArray(value) && !isObject(value);
}

function scalarShape(value: null | boolean | number | string): string {
  return value === null ? "<null>" : `<${typeof value}>`;
}

function queryStructures(value: JsonValue): JsonValue[] {
  if (Array.isArray(value)) return value.flatMap(queryStructures);
  if (!isObject(value)) return [];
  return [...(Array.isArray(value.query) ? [value.query] : []), ...Object.values(value).flatMap(queryStructures)];
}

export function convertOpenApi(openApi: string): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    convert({ type: "string", data: openApi }, {}, (error, result) => {
      if (error) reject(new Error(`openapi-to-postmanv2 falló: ${error.message}`));
      else if (!result?.result || !result.output?.[0]?.data || !isObject(result.output[0].data)) reject(new Error(`openapi-to-postmanv2 no produjo una colección: ${result?.reason ?? "sin detalle"}.`));
      else resolve(result.output[0].data as JsonObject);
    });
  });
}

function assertCollectionContract(collection: JsonObject, openApi: string): void {
  const schema = valueAt(collection, ["info", "schema"]);
  if (schema !== "https://schema.getpostman.com/json/collection/v2.1.0/collection.json") throw new Error("La salida no es una Postman Collection v2.1.");
  const expected = operationsFromOpenApi(openApi);
  const actual = collectionRequests(collection);
  for (const operation of expected) {
    const postmanPath = operation.path.replace(/\{([^}]+)\}/g, ":$1");
    const request = actual.find((candidate) => candidate.method === operation.method && candidate.url.includes(postmanPath));
    if (!request) {
      throw new Error(`La colección Postman no conserva ${operation.method} ${operation.path}.`);
    }
    if (operation.queryParameters.length && (operation.queryParameters.some((parameter) => !request.queryKeys.includes(parameter)) || request.queryKeys.includes("query"))) {
      throw new Error(`La colección Postman no conserva los parámetros de ${operation.method} ${operation.path}: se esperaban ${operation.queryParameters.join(", ")}, se obtuvieron ${request.queryKeys.join(", ") || "ninguno"}.`);
    }
  }
  for (const operationId of ["create", "get", "update", "delete", "list", "count"]) {
    if (!expected.some((operation) => operation.operationId.toLowerCase().includes(operationId))) throw new Error(`El OpenAPI runtime no incluye la operación ${operationId}.`);
  }
  if (!expected.some((operation) => operation.path.includes("/relations/"))) throw new Error("El OpenAPI runtime no incluye navegación de relaciones.");
}

function operationsFromOpenApi(openApi: string): { method: string; path: string; operationId: string; queryParameters: string[] }[] {
  const document = JSON.parse(openApi) as JsonObject;
  const paths = document.paths;
  if (!isObject(paths)) throw new Error("El OpenAPI runtime no contiene paths.");
  return Object.entries(paths).flatMap(([path, item]) => isObject(item)
    ? Object.entries(item).flatMap(([method, operation]) => isObject(operation) && typeof operation.operationId === "string"
      ? [{ method: method.toUpperCase(), path, operationId: operation.operationId, queryParameters: Array.isArray(operation.parameters) ? operation.parameters.filter(isObject).filter((parameter) => parameter.in === "query" && typeof parameter.name === "string").map((parameter) => parameter.name as string).sort() : [] }]
      : [])
    : []);
}

function collectionRequests(collection: JsonObject): { method: string; url: string; queryKeys: string[] }[] {
  const visit = (items: JsonValue): { method: string; url: string; queryKeys: string[] }[] => Array.isArray(items) ? items.flatMap((item) => {
    if (!isObject(item)) return [];
    const request = item.request;
    const nested = item.item;
    const result = isObject(request) && typeof request.method === "string" ? [{ method: request.method, url: requestUrl(request.url), queryKeys: requestQueryKeys(request.url) }] : [];
    return [...result, ...visit(nested ?? [])];
  }) : [];
  return visit(collection.item ?? []);
}

function requestUrl(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (!isObject(value)) return "";
  if (typeof value.raw === "string") return value.raw;
  return Array.isArray(value.path) && value.path.every((segment) => typeof segment === "string") ? `/${value.path.join("/")}` : "";
}

function requestQueryKeys(value: JsonValue | undefined): string[] {
  if (!isObject(value) || !Array.isArray(value.query)) return [];
  return value.query.filter(isObject).filter((parameter) => typeof parameter.key === "string" && parameter.disabled !== true).map((parameter) => parameter.key as string).sort();
}

function valueAt(value: JsonObject, keys: string[]): JsonValue | undefined {
  let current: JsonValue = value;
  for (const key of keys) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isObject(value: JsonValue | object | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
