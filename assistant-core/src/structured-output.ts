import { ASSISTANT_OPERATIONS, type AssistantCommand, type AssistantCriteria, type AssistantFields, type AssistantIdentifier, type AssistantRelationScope, type AssistantValue } from "./contract.js";

export type StructuredAssistantOutput = { ok: true; command: AssistantCommand } | { ok: false; status: "INVALID_OUTPUT"; message: string };
export function parseStructuredAssistantOutput(output: unknown): StructuredAssistantOutput {
  if (!record(output) || !operation(output.operation) || typeof output.entity !== "string" || !output.entity.trim()) return invalid();
  switch (output.operation) {
    case "LIST": case "COUNT": return only(output, ["operation", "entity", "relation"]) && relation(output.relation) ? { ok: true, command: output.relation ? { operation: output.operation, entity: output.entity, relation: output.relation } : { operation: output.operation, entity: output.entity } } : invalid();
    case "GET": case "DELETE": return only(output, ["operation", "entity", "identifier"]) && identifier(output.identifier) ? { ok: true, command: { operation: output.operation, entity: output.entity, identifier: output.identifier } } : invalid();
    case "CREATE": return only(output, ["operation", "entity", "fields"]) && fields(output.fields) ? { ok: true, command: { operation: "CREATE", entity: output.entity, fields: output.fields } } : invalid();
    case "UPDATE": return only(output, ["operation", "entity", "identifier", "fields"]) && identifier(output.identifier) && fields(output.fields) ? { ok: true, command: { operation: "UPDATE", entity: output.entity, identifier: output.identifier, fields: output.fields } } : invalid();
    case "SEARCH": return only(output, ["operation", "entity", "criteria", "relation"]) && criteria(output.criteria) && relation(output.relation) ? { ok: true, command: output.relation ? { operation: "SEARCH", entity: output.entity, criteria: output.criteria, relation: output.relation } : { operation: "SEARCH", entity: output.entity, criteria: output.criteria } } : invalid();
  }
}
const invalid = (): StructuredAssistantOutput => ({ ok: false, status: "INVALID_OUTPUT", message: "La salida estructurada no coincide con AssistantCommand." });
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every((key) => keys.includes(key));
const operation = (v: unknown): v is AssistantCommand["operation"] => typeof v === "string" && (ASSISTANT_OPERATIONS as readonly string[]).includes(v);
const identifier = (v: unknown): v is AssistantIdentifier => typeof v === "string" || typeof v === "number";
const value = (v: unknown): v is AssistantValue => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const fields = (v: unknown): v is AssistantFields => record(v) && Object.values(v).every(value);
const criteria = (v: unknown): v is AssistantCriteria => record(v) && only(v, ["query", "fields"]) && (v.query === undefined || typeof v.query === "string") && (v.fields === undefined || fields(v.fields));
const relation = (v: unknown): v is AssistantRelationScope | undefined => v === undefined || (record(v) && only(v, ["name", "sourceIdentifier"]) && typeof v.name === "string" && identifier(v.sourceIdentifier));
