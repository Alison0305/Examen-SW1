import { UmlCommandExecutor, type Diagnostic, type ProjectDocument } from "@examen-sw1/uml-core";
import type { AddAttributeProposalCommand, MentorProposalDiagnostic, MentorProposalError } from "./mentor-proposal.contracts";

export type PreviewMentorProposalOptions = Readonly<{ nowFactory?: () => Date }>;

// Internal result: the candidate document feeds the deterministic diff (phase 3) and is never exposed publicly.
// baseRevision is the authoritative revision the proposal was built on; candidate.revision is only the potential result.
export type MentorProposalPreviewResult =
  | Readonly<{ ok: true; baseRevision: number; candidate: ProjectDocument; diagnostics: readonly MentorProposalDiagnostic[] }>
  | Readonly<{ ok: false; baseRevision: number; error: MentorProposalError }>;

// Public projection: keeps code, severity and message only; path and elementId carry internal identifiers.
export function toMentorProposalDiagnostic(diagnostic: Diagnostic): MentorProposalDiagnostic {
  return { code: diagnostic.code, severity: diagnostic.severity, message: diagnostic.message };
}

function invalid(baseRevision: number, message: string, diagnostics: readonly Diagnostic[] = []): MentorProposalPreviewResult {
  return { ok: false, baseRevision, error: { code: "INVALID_PROPOSAL", message, diagnostics: diagnostics.map(toMentorProposalDiagnostic) } };
}

// Runs the resolved command with the real uml-core executor and validator. The executor clones its input, so the
// authoritative document, its revision and its layout stay untouched; nothing is persisted or recorded here.
export function previewMentorProposal(document: ProjectDocument, command: AddAttributeProposalCommand, options: PreviewMentorProposalOptions = {}): MentorProposalPreviewResult {
  const baseRevision = document.revision;
  let result;
  try {
    result = new UmlCommandExecutor({ nowFactory: options.nowFactory }).execute(document, command);
  } catch {
    return invalid(baseRevision, "La propuesta no pudo evaluarse sobre el modelo UML vigente.");
  }
  if (!result.success) return invalid(baseRevision, "La propuesta no supera la validación del modelo UML.", result.diagnostics);

  // The candidate must contain exactly the attribute id fixed at resolution time; apply will replay the same command.
  const applied = result.document.uml.classes.find((umlClass) => umlClass.id === command.classId)?.attributes.some((attribute) => attribute.id === command.attributeId);
  if (!applied) return invalid(baseRevision, "La propuesta no produjo el cambio esperado.");

  return { ok: true, baseRevision, candidate: result.document, diagnostics: result.diagnostics.map(toMentorProposalDiagnostic) };
}
