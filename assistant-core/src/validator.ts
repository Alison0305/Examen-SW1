import type { DomainManifestAttribute, DomainManifestEntity, DomainManifestV1 } from "@examen-sw1/spring-generator";
import type { AssistantCommand, AssistantDiagnostic, AssistantFields, AssistantIdentifier, AssistantRelationScope, AssistantResult, AssistantValue } from "./contract.js";

export const ASSISTANT_VALIDATION_DIAGNOSTICS = [
  "UNKNOWN_ENTITY",
  "UNSUPPORTED_OPERATION",
  "MISSING_IDENTIFIER",
  "INVALID_IDENTIFIER_TYPE",
  "UNKNOWN_FIELD",
  "MISSING_REQUIRED_FIELD",
  "INVALID_FIELD_TYPE",
  "IMMUTABLE_IDENTIFIER",
  "EMPTY_FIELDS",
  "UNSEARCHABLE_QUERY",
  "EMPTY_SEARCH_CRITERIA",
  "UNKNOWN_RELATION",
  "UNKNOWN_RELATION_TARGET",
  "INVALID_RELATION_IDENTIFIER",
] as const;

export type AssistantValidationDiagnosticCode = (typeof ASSISTANT_VALIDATION_DIAGNOSTICS)[number];

const reject = (details: readonly AssistantDiagnostic[]): AssistantResult<AssistantCommand> => ({
  ok: false,
  code: "VALIDATION_ERROR",
  message: "El comando no cumple el Domain Manifest v1.",
  details,
});
const diagnostic = (code: AssistantValidationDiagnosticCode, message: string, field?: string): AssistantDiagnostic => ({ code, message, ...(field ? { field } : {}) });
const operationPrefix = (operation: AssistantCommand["operation"]): string => operation === "SEARCH" ? "list" : operation.toLowerCase();
const supportsOperation = (entity: DomainManifestEntity, command: AssistantCommand): boolean => entity.operations.some((operation) => operation.name.toLowerCase().startsWith(operationPrefix(command.operation)));
const identifierOf = (entity: DomainManifestEntity): DomainManifestAttribute | undefined => entity.attributes.find((attribute) => attribute.identifier);

const validScalar = (value: AssistantValue, attribute: DomainManifestAttribute): boolean => {
  if (Array.isArray(value)) return false;
  if (value === null) return !attribute.required;
  if (attribute.type === "BIGINT" || attribute.type === "NUMERIC") return typeof value === "number";
  if (attribute.type === "BOOLEAN") return typeof value === "boolean";
  return typeof value === "string";
};

const validateIdentifier = (entity: DomainManifestEntity, identifier: AssistantIdentifier, code: AssistantValidationDiagnosticCode = "INVALID_IDENTIFIER_TYPE"): AssistantDiagnostic[] => {
  const attribute = identifierOf(entity);
  if (!attribute) return [diagnostic("MISSING_IDENTIFIER", "La entidad no declara identificador.")];
  return validScalar(identifier, attribute) ? [] : [diagnostic(code, "El identificador no coincide con el tipo declarado.", attribute.name)];
};

const validateFields = (entity: DomainManifestEntity, fields: AssistantFields, immutableIdentifier: boolean): AssistantDiagnostic[] => Object.entries(fields).flatMap(([name, value]) => {
  const attribute = entity.attributes.find((candidate) => candidate.name === name);
  if (!attribute) return [diagnostic("UNKNOWN_FIELD", "El campo no existe en la entidad.", name)];
  if (immutableIdentifier && attribute.identifier) return [diagnostic("IMMUTABLE_IDENTIFIER", "El identificador no puede actualizarse.", name)];
  return validScalar(value, attribute) ? [] : [diagnostic("INVALID_FIELD_TYPE", "El valor no coincide con el tipo declarado.", name)];
});

const validateRelation = (entity: DomainManifestEntity, relation: AssistantRelationScope | undefined, manifest: DomainManifestV1): AssistantDiagnostic[] => {
  if (!relation) return [];
  const declared = entity.relations.find((candidate) => candidate.name === relation.name);
  if (!declared) return [diagnostic("UNKNOWN_RELATION", "La relación no existe en la entidad.", relation.name)];
  const details = validateIdentifier(entity, relation.sourceIdentifier, "INVALID_RELATION_IDENTIFIER");
  if (!manifest.entities.some((candidate) => candidate.name === declared.target)) details.push(diagnostic("UNKNOWN_RELATION_TARGET", "El target de la relación no existe en el Manifest.", relation.name));
  return details;
};

export function validateAssistantCommand(command: AssistantCommand, manifest: DomainManifestV1): AssistantResult<AssistantCommand> {
  const entity = manifest.entities.find((candidate) => candidate.name === command.entity);
  if (!entity) return reject([diagnostic("UNKNOWN_ENTITY", "La entidad no existe en el Domain Manifest v1.", command.entity)]);
  const details: AssistantDiagnostic[] = [];
  if (!supportsOperation(entity, command)) details.push(diagnostic("UNSUPPORTED_OPERATION", "La operación no está autorizada para la entidad."));

  switch (command.operation) {
    case "GET":
    case "DELETE":
      details.push(...validateIdentifier(entity, command.identifier));
      break;
    case "UPDATE":
      details.push(...validateIdentifier(entity, command.identifier));
      if (Object.keys(command.fields).length === 0) details.push(diagnostic("EMPTY_FIELDS", "UPDATE requiere al menos un campo."));
      details.push(...validateFields(entity, command.fields, true));
      break;
    case "CREATE":
      details.push(...validateFields(entity, command.fields, false));
      for (const attribute of entity.attributes) if (attribute.required && !Object.prototype.hasOwnProperty.call(command.fields, attribute.name)) details.push(diagnostic("MISSING_REQUIRED_FIELD", "Falta un campo requerido.", attribute.name));
      break;
    case "SEARCH": {
      const query = command.criteria.query?.trim() ?? "";
      const fields = command.criteria.fields ?? {};
      if (!query && Object.keys(fields).length === 0) details.push(diagnostic("EMPTY_SEARCH_CRITERIA", "SEARCH requiere query o fields."));
      if (query && !entity.attributes.some((attribute) => attribute.searchable)) details.push(diagnostic("UNSEARCHABLE_QUERY", "La entidad no declara atributos buscables."));
      details.push(...validateFields(entity, fields, false), ...validateRelation(entity, command.relation, manifest));
      break;
    }
    case "LIST":
    case "COUNT":
      details.push(...validateRelation(entity, command.relation, manifest));
      break;
  }
  return details.length > 0 ? reject(details) : { ok: true, command, data: command };
}
