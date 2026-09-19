import type { RelationalModel } from "@examen-sw1/relational-core";

export type ManifestAttribute = Readonly<{ name: string; type: "VARCHAR" | "BIGINT" | "BOOLEAN" | "NUMERIC" | "DATE" | "TIMESTAMP_WITH_TIME_ZONE" | "ENUM"; required: boolean; identifier: boolean; unique: boolean; searchable: boolean; sortable: boolean; defaultSort: "ASC" | "DESC" | null }>;
export type ManifestRelation = Readonly<{ name: string; target: string; cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY"; lifecycle: "NONE" | "COMPOSITION"; required: boolean }>;
export type ManifestOperation = Readonly<{ name: string; method: "GET" | "POST" | "PATCH" | "DELETE"; path: string }>;
export type ManifestEntity = Readonly<{ name: string; resourceName: string; attributes: readonly ManifestAttribute[]; relations: readonly ManifestRelation[]; operations: readonly ManifestOperation[] }>;
export type DomainManifestV1 = Readonly<{ schemaVersion: 1; entities: readonly ManifestEntity[] }>;
export type OpenApiSchema = Readonly<{ $ref?: string; type?: string; properties?: Readonly<Record<string, OpenApiSchema>>; required?: readonly string[] }>;
export type OpenApiOperation = Readonly<{ operationId?: string; requestBody?: Readonly<{ content?: Readonly<{ "application/json"?: Readonly<{ schema?: OpenApiSchema }> }> }> }>;
export type OpenApiDocument = Readonly<{ paths: Record<string, Record<string, OpenApiOperation>>; components?: Readonly<{ schemas?: Readonly<Record<string, OpenApiSchema>> }> }>;
export type FrontendGeneratorInput = Readonly<{ relationalModel: RelationalModel; domainManifest: DomainManifestV1; openApi: OpenApiDocument; assistantCoreDependency: string }>;
export type GeneratedFile = Readonly<{ path: string; content: string }>;
