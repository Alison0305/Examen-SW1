import { INTERPRETATION_TEXT_MAX_LENGTH, type InterpretationClass } from "@examen-sw1/assistant-core";
import type { DomainManifestV1 } from "@examen-sw1/spring-generator";

export const MAX_INTERPRETATION_CLASSES = 500;
export const MAX_MANIFEST_ENTITIES = 100;
const MAX_ID_LENGTH = 100;
const MAX_NAME_LENGTH = 200;

export type InterpretRequest =
  | Readonly<{ mode: "uml"; text: string; classes: readonly InterpretationClass[] }>
  | Readonly<{ mode: "data"; text: string; manifest: DomainManifestV1 }>;

export type InterpretRequestParse = Readonly<{ ok: true; request: InterpretRequest }> | Readonly<{ ok: false; message: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key));
const boundedString = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const recordsOf = (value: unknown, check: (item: Record<string, unknown>) => boolean): boolean => Array.isArray(value) && value.every((item) => isRecord(item) && check(item));

const isAttribute = (item: Record<string, unknown>) => boundedString(item.name, MAX_NAME_LENGTH) && typeof item.type === "string" && typeof item.identifier === "boolean" && typeof item.required === "boolean" && typeof item.searchable === "boolean";
const isRelation = (item: Record<string, unknown>) => boundedString(item.name, MAX_NAME_LENGTH) && boundedString(item.target, MAX_NAME_LENGTH);
const isOperation = (item: Record<string, unknown>) => boundedString(item.name, MAX_NAME_LENGTH);
const isEntity = (item: Record<string, unknown>) => boundedString(item.name, MAX_NAME_LENGTH) && recordsOf(item.attributes, isAttribute) && recordsOf(item.relations, isRelation) && recordsOf(item.operations, isOperation);

function isManifest(value: unknown): value is DomainManifestV1 {
  return isRecord(value) && value.schemaVersion === 1 && Array.isArray(value.entities) && value.entities.length <= MAX_MANIFEST_ENTITIES && recordsOf(value.entities, isEntity);
}

function isClassList(value: unknown): value is InterpretationClass[] {
  return Array.isArray(value) && value.length <= MAX_INTERPRETATION_CLASSES && value.every((item) => isRecord(item) && hasOnlyKeys(item, ["id", "name"]) && boundedString(item.id, MAX_ID_LENGTH) && boundedString(item.name, MAX_NAME_LENGTH));
}

// Each mode accepts only its own keys, so a UML request can never carry a Domain Manifest and vice versa.
export function parseInterpretRequest(body: unknown): InterpretRequestParse {
  if (!isRecord(body)) return { ok: false, message: "La solicitud de interpretación no es válida." };
  if (!boundedString(body.text, INTERPRETATION_TEXT_MAX_LENGTH)) return { ok: false, message: `El texto es obligatorio y admite hasta ${INTERPRETATION_TEXT_MAX_LENGTH} caracteres.` };
  if (body.mode === "uml") {
    if (!hasOnlyKeys(body, ["mode", "text", "classes"]) || !isClassList(body.classes)) return { ok: false, message: "El modo uml requiere text y classes [{ id, name }]." };
    return { ok: true, request: { mode: "uml", text: body.text, classes: body.classes } };
  }
  if (body.mode === "data") {
    if (!hasOnlyKeys(body, ["mode", "text", "manifest"]) || !isManifest(body.manifest)) return { ok: false, message: "El modo data requiere text y un Domain Manifest v1 válido." };
    return { ok: true, request: { mode: "data", text: body.text, manifest: body.manifest } };
  }
  return { ok: false, message: "El modo debe ser uml o data." };
}
