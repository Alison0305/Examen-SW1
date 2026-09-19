import type { DomainManifestEntity, DomainManifestOperation, DomainManifestV1 } from "@examen-sw1/spring-generator";
import type { AssistantCommand, AssistantFields, AssistantResult } from "./contract.js";
import { validateAssistantCommand } from "./validator.js";

export type AssistantHttpRequest = { method: string; path: string; query?: readonly (readonly [string, string])[]; body?: AssistantFields };
export type AssistantHttpResponse<T = unknown> = { status: number; data?: T };
export interface AssistantHttpAdapter { request<T = unknown>(request: AssistantHttpRequest): Promise<AssistantHttpResponse<T>>; }
export type ExecuteAssistantOptions = { confirmDelete?: boolean };
export const ASSISTANT_EXECUTION_DIAGNOSTICS = ["UNRESOLVABLE_OPERATION", "UNSUPPORTED_RELATION_OPERATION", "ADAPTER_ERROR", "HTTP_ERROR"] as const;
export type AssistantExecutionDiagnosticCode = (typeof ASSISTANT_EXECUTION_DIAGNOSTICS)[number];

const rejection = (code: "CONFIRMATION_REQUIRED" | "EXECUTION_ERROR", diagnosticCode: AssistantExecutionDiagnosticCode | "DELETE_CONFIRMATION_REQUIRED", message: string): AssistantResult<unknown> => ({ ok: false, code, message, details: [{ code: diagnosticCode, message }] });
const findEntity = (manifest: DomainManifestV1, name: string) => manifest.entities.find((entity) => entity.name === name)!;
const operation = (entity: DomainManifestEntity, command: AssistantCommand): DomainManifestOperation | undefined => {
  const prefix = command.operation === "SEARCH" ? "list" : command.operation.toLowerCase();
  if (command.operation === "LIST" && command.relation) return entity.operations.find((item) => item.method === "GET" && item.name.toLowerCase().startsWith("get") && item.path.includes("{id}") && item.path.includes("{relation}"));
  return entity.operations.find((item) => item.name.toLowerCase().startsWith(prefix) && (command.operation === "LIST" || command.operation === "SEARCH" ? item.method === "GET" && !item.path.includes("{") : command.operation === "GET" ? item.method === "GET" && item.path.includes("{id}") && !item.path.includes("{relation}") : command.operation === "CREATE" ? item.method === "POST" : command.operation === "UPDATE" ? item.method === "PATCH" && item.path.includes("{id}") : command.operation === "DELETE" ? item.method === "DELETE" && item.path.includes("{id}") : item.method === "GET"));
};
const replace = (path: string, value: string, replacement: string) => path.replace(value, encodeURIComponent(replacement));
const scalar = (value: AssistantFields[string]): string | undefined => Array.isArray(value) ? undefined : value === null ? "null" : typeof value === "boolean" ? String(value) : String(value);

export async function executeAssistantCommand(command: AssistantCommand, manifest: DomainManifestV1, adapter: AssistantHttpAdapter, options: ExecuteAssistantOptions = {}): Promise<AssistantResult<unknown>> {
  const valid = validateAssistantCommand(command, manifest);
  if (!valid.ok) return valid;
  if (command.operation === "DELETE" && options.confirmDelete !== true) return rejection("CONFIRMATION_REQUIRED", "DELETE_CONFIRMATION_REQUIRED", "DELETE requiere confirmación explícita.");
  if ((command.operation === "SEARCH" || command.operation === "COUNT") && command.relation) return rejection("EXECUTION_ERROR", "UNSUPPORTED_RELATION_OPERATION", "La operación sobre relación no está autorizada por Manifest v1.");
  const selected = operation(findEntity(manifest, command.entity), command);
  if (!selected) return rejection("EXECUTION_ERROR", "UNRESOLVABLE_OPERATION", "No se encontró una operación REST autorizada.");
  let path = selected.path; let query: readonly (readonly [string, string])[] | undefined; let body: AssistantFields | undefined;
  if (command.operation === "GET" || command.operation === "UPDATE" || command.operation === "DELETE") path = replace(path, "{id}", String(command.identifier));
  if (command.operation === "LIST" && command.relation) { path = replace(replace(path, "{id}", String(command.relation.sourceIdentifier)), "{relation}", command.relation.name); }
  if (command.operation === "SEARCH") { const pairs: Array<readonly [string, string]> = []; if (command.criteria.query?.trim()) pairs.push(["q", command.criteria.query]); for (const [field, value] of Object.entries(command.criteria.fields ?? {})) { const serialized = scalar(value); if (serialized === undefined) return rejection("EXECUTION_ERROR", "UNRESOLVABLE_OPERATION", "No se pudo serializar un filtro autorizado."); pairs.push(["filter", `${field}:eq:${serialized}`]); } query = pairs; }
  if (command.operation === "CREATE" || command.operation === "UPDATE") body = command.fields;
  try { const response = await adapter.request({ method: selected.method, path, ...(query?.length ? { query } : {}), ...(body ? { body } : {}) }); return response.status >= 200 && response.status < 300 ? { ok: true, command, data: response.data } : rejection("EXECUTION_ERROR", "HTTP_ERROR", "La operación REST devolvió un estado no exitoso."); }
  catch { return rejection("EXECUTION_ERROR", "ADAPTER_ERROR", "No se pudo ejecutar la operación REST autorizada."); }
}
