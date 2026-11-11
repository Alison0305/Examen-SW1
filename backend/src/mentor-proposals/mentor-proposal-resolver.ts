import { createUuid, normalizePrimitiveTypeName, type ProjectDocument, type UmlClass } from "@examen-sw1/uml-core";
import {
  isSupportedMentorProposalOperation,
  type AddAttributeProposalCommand,
  type AddAttributeProposalOperation,
  type MentorProposalError,
  type MentorProposalErrorCode,
  type MentorProposalIntent,
} from "./mentor-proposal.contracts";
import { formatMentorProposalMultiplicity, parseMentorProposalMultiplicity } from "./mentor-proposal-multiplicity";

export type ResolveMentorProposalOptions = Readonly<{ uuidFactory?: () => string }>;

export type ResolveMentorProposalResult =
  | Readonly<{ ok: true; operation: AddAttributeProposalOperation; command: AddAttributeProposalCommand }>
  | Readonly<{ ok: false; error: MentorProposalError }>;

// Same rule uml-core applies to detect duplicate names: trim plus lower case, exact equality.
const canonicalName = (name: string): string => name.trim().toLocaleLowerCase();

function failure(code: MentorProposalErrorCode, message: string): ResolveMentorProposalResult {
  return { ok: false, error: { code, message, diagnostics: [] } };
}

// Class names are unique per package, so the same name may exist in two packages: that is ambiguous and rejected.
function resolveClass(document: ProjectDocument, className: string): UmlClass | "missing" | "ambiguous" {
  const requested = canonicalName(className);
  if (!requested) return "missing";
  const matches = document.uml.classes.filter((umlClass) => canonicalName(umlClass.name) === requested);
  if (matches.length === 0) return "missing";
  return matches.length === 1 ? matches[0]! : "ambiguous";
}

// Resolves a name-based intent against the authoritative document into exactly one AddAttribute command.
// The assistant never supplies ids: classId comes from the document and attributeId from the server, here and only here.
// Does not mutate the document and does not validate the candidate; the preview runs the real executor and validator.
export function resolveMentorProposal(document: ProjectDocument, intent: MentorProposalIntent, options: ResolveMentorProposalOptions = {}): ResolveMentorProposalResult {
  if (!isSupportedMentorProposalOperation(intent.operation)) {
    return failure("UNSUPPORTED_OPERATION", "La operación propuesta no está soportada.");
  }

  const umlClass = resolveClass(document, intent.className);
  if (umlClass === "missing") return failure("ELEMENT_NOT_FOUND", "La clase indicada no existe en el modelo UML vigente.");
  if (umlClass === "ambiguous") return failure("ELEMENT_NOT_FOUND", "El nombre de clase indicado es ambiguo en el modelo UML vigente.");

  // Only the primitives uml-core supports, through its own synonym table; no fallback to string.
  const primitive = normalizePrimitiveTypeName(intent.attributeType);
  if (!primitive) return failure("UNKNOWN_TYPE", "El tipo indicado no es un tipo UML soportado.");

  let multiplicity;
  if (intent.multiplicity !== undefined) {
    multiplicity = parseMentorProposalMultiplicity(intent.multiplicity);
    if (!multiplicity) return failure("INVALID_PROPOSAL", "La multiplicidad indicada no es válida.");
  }

  // The requested name is kept as given (only trimmed): no transliteration, no case change, no renaming.
  const attributeName = intent.attributeName.trim();
  const command: AddAttributeProposalCommand = {
    type: "AddAttribute",
    classId: umlClass.id,
    attributeId: (options.uuidFactory ?? createUuid)(),
    name: attributeName,
    attributeType: { kind: "primitive", name: primitive },
    ...(multiplicity ? { multiplicity } : {}),
  };
  const operation: AddAttributeProposalOperation = {
    kind: "ADD_ATTRIBUTE",
    target: { className: umlClass.name },
    change: {
      attributeName,
      attributeType: primitive,
      ...(multiplicity ? { multiplicity: formatMentorProposalMultiplicity(multiplicity) } : {}),
    },
  };
  return { ok: true, operation, command };
}
