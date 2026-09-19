import type { ManifestEntity, ManifestRelation, OpenApiDocument, OpenApiSchema } from "./model.js";

export type MutableField = Readonly<{ wireName: string; required: boolean; schemaType?: string; semanticAttribute?: string; semanticRelation?: string; relationTarget?: string }>;

const localReference = /^#\/components\/schemas\/([^/]+)$/;

function schemaFor(operation: "POST" | "PATCH", entity: ManifestEntity, openApi: OpenApiDocument): OpenApiSchema {
  const endpoint = entity.operations.find((candidate) => candidate.method === operation);
  if (!endpoint) return Object.freeze({ properties: {} });
  const schema = openApi.paths[endpoint.path]?.[operation.toLowerCase()]?.requestBody?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`OpenAPI sin request schema para ${operation} ${endpoint.path}.`);
  if (!schema.$ref) return schema;
  const match = localReference.exec(schema.$ref);
  if (!match) throw new Error(`OpenAPI solo admite refs locales: ${schema.$ref}`);
  const resolved = openApi.components?.schemas?.[match[1]];
  if (!resolved) throw new Error(`OpenAPI ref inexistente: ${schema.$ref}`);
  return resolved;
}

function relationFor(name: string, relations: readonly ManifestRelation[]): ManifestRelation | undefined {
  const matches = relations.filter((relation) => name === relation.name || name === `${relation.name}Id` || name === `${relation.name}Ids`);
  if (matches.length > 1) throw new Error(`Relación ambigua para ${name}.`);
  return matches[0];
}

export function deriveMutableFields(entity: ManifestEntity, openApi: OpenApiDocument): Readonly<{ createFields: readonly MutableField[]; updateFields: readonly MutableField[] }> {
  const fields = (method: "POST" | "PATCH") => {
    const schema = schemaFor(method, entity, openApi);
    const required = new Set(schema.required ?? []);
    return Object.freeze(Object.entries(schema.properties ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([wireName, property]) => {
      const relation = relationFor(wireName, entity.relations);
      const attribute = entity.attributes.find((candidate) => candidate.name === wireName);
      return Object.freeze({ wireName, required: required.has(wireName), schemaType: property.type, semanticAttribute: attribute?.name, semanticRelation: relation?.name, relationTarget: relation?.target });
    }));
  };
  return Object.freeze({ createFields: fields("POST"), updateFields: fields("PATCH") });
}
