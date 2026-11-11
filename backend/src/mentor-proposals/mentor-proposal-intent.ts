import { isSupportedMentorProposalOperation, type MentorProposalError, type MentorProposalErrorCode, type MentorProposalIntent } from "./mentor-proposal.contracts";

// CU-2P-06, phase 7: the boundary between the local model and MentorProposalIntent. The model output is untrusted
// data: it is constrained by a closed JSON schema while it is generated and validated again here, field by field,
// before the server resolves it. Nothing here resolves classes, assigns ids or builds commands.

export const MENTOR_PROPOSAL_INTENT_TEXT_MAX_LENGTH = 80;
export const MENTOR_PROPOSAL_INTENT_MULTIPLICITY_MAX_LENGTH = 16;

// The only way for the model to say "this instruction is not an allowed operation". Without it the grammar would force
// every instruction ("elimina la clase Cliente") into an ADD_ATTRIBUTE. It is never an intent: it maps to
// UNSUPPORTED_OPERATION and carries no free text.
export const MENTOR_PROPOSAL_UNSUPPORTED_OUTPUT = "UNSUPPORTED";

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength }) as const;
const addAttributeProperties = {
  operation: { const: "ADD_ATTRIBUTE" },
  className: text(MENTOR_PROPOSAL_INTENT_TEXT_MAX_LENGTH),
  attributeName: text(MENTOR_PROPOSAL_INTENT_TEXT_MAX_LENGTH),
  attributeType: text(MENTOR_PROPOSAL_INTENT_TEXT_MAX_LENGTH),
} as const;

// node-llama-cpp treats every listed property as required, so the optional multiplicity is a second variant.
// className is a free string on purpose: an enum of the existing classes would force a request about a missing class
// onto some other class; the server resolves the name and answers ELEMENT_NOT_FOUND instead.
export const MENTOR_PROPOSAL_INTENT_SCHEMA = {
  oneOf: [
    { type: "object", properties: addAttributeProperties, required: Object.keys(addAttributeProperties), additionalProperties: false },
    {
      type: "object",
      properties: { ...addAttributeProperties, multiplicity: text(MENTOR_PROPOSAL_INTENT_MULTIPLICITY_MAX_LENGTH) },
      required: [...Object.keys(addAttributeProperties), "multiplicity"],
      additionalProperties: false,
    },
    { type: "object", properties: { operation: { const: MENTOR_PROPOSAL_UNSUPPORTED_OUTPUT } }, required: ["operation"], additionalProperties: false },
  ],
} as const;

export type MentorProposalIntentParse = Readonly<{ ok: true; intent: MentorProposalIntent }> | Readonly<{ ok: false; error: MentorProposalError }>;

const REQUIRED_FIELDS = ["className", "attributeName", "attributeType"] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set(["operation", ...REQUIRED_FIELDS, "multiplicity"]);
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function failure(code: MentorProposalErrorCode, message: string): MentorProposalIntentParse {
  return { ok: false, error: { code, message, diagnostics: [] } };
}

const invalid = (message: string) => failure("INVALID_PROPOSAL", message);

function plainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

// A non-empty single-line string within the limit that does not carry an identifier.
function validText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength && !hasControlCharacter(trimmed) && !UUID_PATTERN.test(trimmed);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Strict validation of the model output. It never repairs, completes or guesses: an operation outside the allow-list
 * is UNSUPPORTED_OPERATION; anything else that is not exactly an ADD_ATTRIBUTE intent (not an object, missing or extra
 * keys such as `classId`/`attributeId`/`command`, wrong types, empty strings, identifiers inside values) is
 * INVALID_PROPOSAL. Values are only trimmed; type and multiplicity stay text until the resolver.
 */
export function parseMentorProposalIntent(output: unknown): MentorProposalIntentParse {
  if (!plainObject(output)) return invalid("El asistente no produjo una propuesta estructurada válida.");
  const { operation } = output;
  if (typeof operation !== "string") return invalid("La propuesta no declara una operación válida.");
  if (!isSupportedMentorProposalOperation(operation)) return failure("UNSUPPORTED_OPERATION", "La operación propuesta no está soportada.");

  const keys = Object.keys(output);
  if (keys.some((key) => !ALLOWED_KEYS.has(key))) return invalid("La propuesta contiene campos no permitidos.");
  for (const field of REQUIRED_FIELDS) {
    if (!validText(output[field], MENTOR_PROPOSAL_INTENT_TEXT_MAX_LENGTH)) return invalid("La propuesta no contiene una clase, un atributo y un tipo válidos.");
  }
  if ("multiplicity" in output && !validText(output.multiplicity, MENTOR_PROPOSAL_INTENT_MULTIPLICITY_MAX_LENGTH)) return invalid("La multiplicidad indicada no es válida.");

  const field = (name: (typeof REQUIRED_FIELDS)[number]) => (output[name] as string).trim();
  return {
    ok: true,
    intent: {
      operation,
      className: field("className"),
      attributeName: field("attributeName"),
      attributeType: field("attributeType"),
      ...("multiplicity" in output ? { multiplicity: (output.multiplicity as string).trim() } : {}),
    },
  };
}
