import type { AddAttributeCommand } from "@examen-sw1/uml-core";

// CU-2P-06 contract. Two representations are kept apart on purpose:
// - MentorProposalIntent: what the assistant (or a deterministic parser) may produce. Names only, never ids.
// - MentorProposalCommand: what the server resolves against the authoritative document. Exactly one UmlCommand,
//   with every id assigned by the server before the preview, so preview, apply and realtime replay are the same operation.

// Allow-list. v1 supports a single operation; the unions below are discriminated so new kinds are additive.
export const MENTOR_PROPOSAL_OPERATIONS = ["ADD_ATTRIBUTE"] as const;
export type MentorProposalOperationKind = (typeof MENTOR_PROPOSAL_OPERATIONS)[number];

export function isSupportedMentorProposalOperation(value: unknown): value is MentorProposalOperationKind {
  return typeof value === "string" && (MENTOR_PROPOSAL_OPERATIONS as readonly string[]).includes(value);
}

// Persisted states. STALE is never stored: a PENDING proposal whose baseRevision differs from the project revision is stale.
export const MENTOR_PROPOSAL_STATUSES = ["PENDING", "APPLIED", "REJECTED"] as const;
export type MentorProposalStatus = (typeof MENTOR_PROPOSAL_STATUSES)[number];

export const MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH = 500;

// POST /projects/:projectId/mentor/proposals. Identity, project, revision, command and ids never come from the client.
export type CreateMentorProposalRequest = Readonly<{ instruction: string }>;

// A. Generated intent (RF-18). Type and multiplicity stay as text until the server resolves them.
export type AddAttributeProposalIntent = Readonly<{
  operation: "ADD_ATTRIBUTE";
  className: string;
  attributeName: string;
  attributeType: string;
  multiplicity?: string;
}>;
export type MentorProposalIntent = AddAttributeProposalIntent;

// B. Resolved command (internal, persisted, never public). attributeId is mandatory: it is fixed at creation time.
export type AddAttributeProposalCommand = AddAttributeCommand & Readonly<{ attributeId: string }>;
export type MentorProposalCommand = AddAttributeProposalCommand;

// Public, name-based description of the operation; no internal ids.
export type AddAttributeProposalOperation = Readonly<{
  kind: "ADD_ATTRIBUTE";
  target: Readonly<{ className: string }>;
  change: Readonly<{ attributeName: string; attributeType: string; multiplicity?: string }>;
}>;
export type MentorProposalOperation = AddAttributeProposalOperation;

// Deterministic diff computed from the document before and after the preview; never produced by the model.
export const MENTOR_PROPOSAL_DIFF_KINDS = ["added", "removed", "changed"] as const;
export const MENTOR_PROPOSAL_DIFF_ELEMENTS = ["class", "attribute", "relationship", "enumeration"] as const;
export type MentorProposalDiffLine = Readonly<{
  kind: (typeof MENTOR_PROPOSAL_DIFF_KINDS)[number];
  element: (typeof MENTOR_PROPOSAL_DIFF_ELEMENTS)[number];
  label: string;
}>;

// Public diagnostic. Deliberately narrower than uml-core's Diagnostic: no path or elementId (internal ids).
export type MentorProposalDiagnostic = Readonly<{
  code: string;
  severity: "error" | "warning";
  message: string;
}>;

export type MentorProposalPreview = Readonly<{
  valid: boolean;
  diff: readonly MentorProposalDiffLine[];
  diagnostics: readonly MentorProposalDiagnostic[];
}>;

// Public response for create, detail, apply and reject (requireEdit). Dates are ISO strings.
export type MentorProposalResponse = Readonly<{
  id: string;
  status: MentorProposalStatus;
  baseRevision: number;
  operation: MentorProposalOperation;
  preview: MentorProposalPreview;
  createdAt: string;
  resolvedAt?: string;
  resultingRevision?: number;
}>;

// Stable domain error codes. HTTP mapping lives in the OpenSpec design and the future controller.
export const MENTOR_PROPOSAL_ERROR_CODES = [
  "INVALID_PROPOSAL",
  "UNSUPPORTED_OPERATION",
  "ELEMENT_NOT_FOUND",
  "UNKNOWN_TYPE",
  "STALE_PROPOSAL",
  "PROPOSAL_ALREADY_APPLIED",
  "PROPOSAL_REJECTED",
] as const;
export type MentorProposalErrorCode = (typeof MENTOR_PROPOSAL_ERROR_CODES)[number];

// Expected domain failure, returned (never thrown) by the resolver and the preview. Diagnostics are already public.
export type MentorProposalError = Readonly<{
  code: MentorProposalErrorCode;
  message: string;
  diagnostics: readonly MentorProposalDiagnostic[];
}>;

// Future read projection for CU-2P-07 (requireView). Not exposed by CU-2P-06.
export type MentorProposalHistoryProjection = Readonly<{
  proposalId: string;
  status: MentorProposalStatus;
  summary: readonly MentorProposalDiffLine[];
  createdAt: string;
  resolvedAt?: string;
}>;
