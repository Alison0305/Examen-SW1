import { HttpException, HttpStatus, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { MentorProposalDiagnostic } from "./mentor-proposal.contracts";
import { MentorProposalGenerationUnavailableError } from "./local-qwen-mentor-proposal-intent.provider";
import { MentorProposalDataError } from "./mentor-proposal-stored-json";

export type MentorProposalHttpFailureCode = "NOT_FOUND" | "STALE_PROPOSAL" | "PROPOSAL_ALREADY_APPLIED" | "PROPOSAL_REJECTED" | "INVALID_PROPOSAL" | "UNSUPPORTED_OPERATION" | "ELEMENT_NOT_FOUND" | "UNKNOWN_TYPE";

const FAILURES = {
  STALE_PROPOSAL: { status: HttpStatus.CONFLICT, error: "Conflict", message: "El modelo cambió desde que se generó la propuesta; ya no puede aplicarse." },
  PROPOSAL_ALREADY_APPLIED: { status: HttpStatus.CONFLICT, error: "Conflict", message: "La propuesta ya fue aplicada." },
  PROPOSAL_REJECTED: { status: HttpStatus.CONFLICT, error: "Conflict", message: "La propuesta fue rechazada." },
  INVALID_PROPOSAL: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: "Unprocessable Entity", message: "La propuesta no supera la validación del modelo UML." },
  // Creation (phase 7): the generated intent is outside the allow-list or does not resolve against the current model.
  UNSUPPORTED_OPERATION: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: "Unprocessable Entity", message: "La operación propuesta no está soportada." },
  ELEMENT_NOT_FOUND: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: "Unprocessable Entity", message: "La clase indicada no existe o es ambigua en el modelo UML vigente." },
  UNKNOWN_TYPE: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: "Unprocessable Entity", message: "El tipo indicado no es un tipo UML soportado." },
} as const;

// Same public body as CU-2P-01, 04 and 05 when the local model cannot answer.
export const MENTOR_PROPOSAL_UNAVAILABLE_MESSAGE = "El Mentor IA no está disponible en este momento.";

// Same body shape as the CU-2P-07 history errors: { statusCode, error, code, message }, plus public diagnostics for
// INVALID_PROPOSAL. NOT_FOUND keeps the standard 404 body, identical to an unauthorized or missing project.
export function toMentorProposalHttpException(code: MentorProposalHttpFailureCode, diagnostics: readonly MentorProposalDiagnostic[] = []): HttpException {
  if (code === "NOT_FOUND") return new NotFoundException();
  const failure = FAILURES[code];
  return new HttpException({
    statusCode: failure.status,
    error: failure.error,
    code,
    message: failure.message,
    ...(code === "INVALID_PROPOSAL" ? { diagnostics } : {}),
  }, failure.status);
}

// Corrupted persisted JSON becomes a generic 500: no stored JSON, field name, stack or Prisma detail reaches the client.
// An unavailable local model becomes the usual 503, without model path, prompt or raw output.
export function toSafeMentorProposalError(error: unknown): unknown {
  if (error instanceof MentorProposalDataError) return new InternalServerErrorException("No fue posible procesar la propuesta.");
  if (error instanceof MentorProposalGenerationUnavailableError) return new ServiceUnavailableException(MENTOR_PROPOSAL_UNAVAILABLE_MESSAGE);
  return error;
}
