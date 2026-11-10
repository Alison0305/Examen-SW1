import { UML_PRIMITIVE_TYPES, type Multiplicity } from "@examen-sw1/uml-core";
import {
  MENTOR_PROPOSAL_DIFF_ELEMENTS,
  MENTOR_PROPOSAL_DIFF_KINDS,
  type AddAttributeProposalCommand,
  type MentorProposalCommand,
  type MentorProposalDiffLine,
} from "./mentor-proposal.contracts";

// Persisted JSON is never trusted with a cast: the database must not become a way around the allow-list.
// Parsers are strict (exact keys, exact types) and throw MentorProposalDataError, which callers map to a safe 500.
// The error message names the failing field only; it never carries the stored JSON.

export class MentorProposalDataError extends Error {
  readonly code = "MENTOR_PROPOSAL_DATA_CORRUPTED";

  constructor(readonly field: string) {
    super(`Stored mentor proposal data is invalid: ${field}.`);
    this.name = "MentorProposalDataError";
  }
}

// Same UUID shape uml-core's validator accepts for element ids.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function isMultiplicity(value: unknown): value is Multiplicity {
  if (!isRecord(value) || !hasExactKeys(value, ["lower", "upper"])) return false;
  const { lower, upper } = value;
  if (typeof lower !== "number" || !Number.isSafeInteger(lower) || lower < 0) return false;
  return upper === "unbounded" || (typeof upper === "number" && Number.isSafeInteger(upper) && upper >= lower);
}

function isPrimitiveType(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["kind", "name"]) && value.kind === "primitive" && (UML_PRIMITIVE_TYPES as readonly unknown[]).includes(value.name);
}

// v1 allow-list: only AddAttribute with a primitive type, server ids and an optional multiplicity.
export function parseStoredMentorProposalCommand(value: unknown): MentorProposalCommand {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "classId", "attributeId", "name", "attributeType"], ["multiplicity"])) throw new MentorProposalDataError("command");
  if (value.type !== "AddAttribute") throw new MentorProposalDataError("command.type");
  if (!isUuid(value.classId)) throw new MentorProposalDataError("command.classId");
  if (!isUuid(value.attributeId)) throw new MentorProposalDataError("command.attributeId");
  if (typeof value.name !== "string" || !value.name.trim() || value.name !== value.name.trim()) throw new MentorProposalDataError("command.name");
  if (!isPrimitiveType(value.attributeType)) throw new MentorProposalDataError("command.attributeType");
  if ("multiplicity" in value && !isMultiplicity(value.multiplicity)) throw new MentorProposalDataError("command.multiplicity");

  const command: AddAttributeProposalCommand = {
    type: "AddAttribute",
    classId: value.classId,
    attributeId: value.attributeId,
    name: value.name,
    attributeType: value.attributeType as AddAttributeProposalCommand["attributeType"],
    ...("multiplicity" in value ? { multiplicity: value.multiplicity as Multiplicity } : {}),
  };
  return command;
}

function isDiffLine(value: unknown): value is MentorProposalDiffLine {
  return isRecord(value)
    && hasExactKeys(value, ["kind", "element", "label"])
    && (MENTOR_PROPOSAL_DIFF_KINDS as readonly unknown[]).includes(value.kind)
    && (MENTOR_PROPOSAL_DIFF_ELEMENTS as readonly unknown[]).includes(value.element)
    && typeof value.label === "string" && value.label.trim().length > 0;
}

export function parseStoredMentorProposalSummary(value: unknown): readonly MentorProposalDiffLine[] {
  if (!Array.isArray(value)) throw new MentorProposalDataError("summary");
  return value.map((line, index) => {
    if (!isDiffLine(line)) throw new MentorProposalDataError(`summary[${index}]`);
    return { kind: line.kind, element: line.element, label: line.label };
  });
}
