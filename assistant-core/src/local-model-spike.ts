import { existsSync } from "node:fs";
import { ASSISTANT_OPERATIONS, type AssistantCommand, type AssistantCriteria, type AssistantFields, type AssistantIdentifier, type AssistantRelationScope, type AssistantValue } from "./contract.js";

export const LOCAL_QWEN3_1_7B_SPIKE_CONFIG = {
  runtime: "node-llama-cpp",
  provider: "none",
  model: {
    family: "Qwen3",
    parameters: "1.7B",
    quantized: true,
    format: "GGUF",
  },
} as const;

export type LocalTextModelConfig = typeof LOCAL_QWEN3_1_7B_SPIKE_CONFIG & {
  modelPath?: string;
  contextTokens?: number;
};

export type LocalTextModelStatus = "AVAILABLE" | "NOT_CONFIGURED" | "MODEL_NOT_FOUND" | "RUNTIME_NOT_AVAILABLE" | "INVALID_OUTPUT" | "INFERENCE_ERROR";
export type LocalTextModelInspection = {
  status: Exclude<LocalTextModelStatus, "INVALID_OUTPUT" | "INFERENCE_ERROR">;
  message: string;
};

// This boundary is intentionally runtime-neutral. It does not load a model or execute requests.
export interface LocalTextModel {
  generateStructured(input: { prompt: string; schema: "AssistantCommand" | "UmlTextProposal" }): Promise<unknown>;
}

export function inspectLocalTextModel(config: LocalTextModelConfig, modelExists: (path: string) => boolean = existsSync): LocalTextModelInspection {
  if (!config.modelPath) {
    return { status: "NOT_CONFIGURED", message: "No hay una ruta local de modelo configurada." };
  }
  if (!modelExists(config.modelPath)) {
    return { status: "MODEL_NOT_FOUND", message: "El modelo local configurado no existe." };
  }
  return { status: "RUNTIME_NOT_AVAILABLE", message: "El runtime local no está instalado en este spike." };
}

export type StructuredAssistantOutput =
  | { ok: true; command: AssistantCommand }
  | { ok: false; status: "INVALID_OUTPUT"; message: string };

export function parseStructuredAssistantOutput(output: unknown): StructuredAssistantOutput {
  if (!isRecord(output) || !isOperation(output.operation) || typeof output.entity !== "string" || !output.entity.trim()) {
    return invalidOutput();
  }

  switch (output.operation) {
    case "LIST":
    case "COUNT":
      return hasOnlyKeys(output, ["operation", "entity", "relation"]) && validRelation(output.relation)
        ? { ok: true, command: output.relation ? { operation: output.operation, entity: output.entity, relation: output.relation } : { operation: output.operation, entity: output.entity } }
        : invalidOutput();
    case "GET":
    case "DELETE":
      return hasOnlyKeys(output, ["operation", "entity", "identifier"]) && validIdentifier(output.identifier)
        ? { ok: true, command: { operation: output.operation, entity: output.entity, identifier: output.identifier } }
        : invalidOutput();
    case "CREATE":
      return hasOnlyKeys(output, ["operation", "entity", "fields"]) && validFields(output.fields)
        ? { ok: true, command: { operation: "CREATE", entity: output.entity, fields: output.fields } }
        : invalidOutput();
    case "UPDATE":
      return hasOnlyKeys(output, ["operation", "entity", "identifier", "fields"]) && validIdentifier(output.identifier) && validFields(output.fields)
        ? { ok: true, command: { operation: "UPDATE", entity: output.entity, identifier: output.identifier, fields: output.fields } }
        : invalidOutput();
    case "SEARCH":
      return hasOnlyKeys(output, ["operation", "entity", "criteria", "relation"]) && validCriteria(output.criteria) && validRelation(output.relation)
        ? { ok: true, command: output.relation ? { operation: "SEARCH", entity: output.entity, criteria: output.criteria, relation: output.relation } : { operation: "SEARCH", entity: output.entity, criteria: output.criteria } }
        : invalidOutput();
  }
}

function invalidOutput(): StructuredAssistantOutput {
  return { ok: false, status: "INVALID_OUTPUT", message: "La salida estructurada no coincide con AssistantCommand." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isOperation(value: unknown): value is AssistantCommand["operation"] {
  return typeof value === "string" && (ASSISTANT_OPERATIONS as readonly string[]).includes(value);
}

function validIdentifier(value: unknown): value is AssistantIdentifier {
  return typeof value === "string" || typeof value === "number";
}

function validValue(value: unknown): value is AssistantValue {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function validFields(value: unknown): value is AssistantFields {
  return isRecord(value) && Object.values(value).every(validValue);
}

function validCriteria(value: unknown): value is AssistantCriteria {
  return isRecord(value)
    && hasOnlyKeys(value, ["query", "fields"])
    && (value.query === undefined || typeof value.query === "string")
    && (value.fields === undefined || validFields(value.fields));
}

function validRelation(value: unknown): value is AssistantRelationScope | undefined {
  return value === undefined || (isRecord(value)
    && hasOnlyKeys(value, ["name", "sourceIdentifier"])
    && typeof value.name === "string"
    && validIdentifier(value.sourceIdentifier));
}
