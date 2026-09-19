import { createUuid, type Uuid } from "./model.js";
import type { UmlCommand } from "./commands/command.js";

export type UmlTextProposal =
  | { type: "CREATE_CLASS"; name: string }
  | { type: "RENAME_CLASS"; targetId: Uuid; name: string }
  | { type: "DELETE_CLASS"; targetId: Uuid };

export type UmlTextProposalParseResult =
  | { success: true; proposal: UmlTextProposal }
  | { success: false; message: string };

const createClassPattern = /^CREATE_CLASS name="([^"\r\n]+)"$/;
const renameClassPattern = /^RENAME_CLASS targetId="([^"\r\n]+)" name="([^"\r\n]+)"$/;
const deleteClassPattern = /^DELETE_CLASS targetId="([^"\r\n]+)"$/;

export function parseUmlTextProposal(input: string): UmlTextProposalParseResult {
  const createMatch = createClassPattern.exec(input);
  if (createMatch) {
    return createMatch[1].trim()
      ? { success: true, proposal: { type: "CREATE_CLASS", name: createMatch[1] } }
      : rejectedProposal();
  }

  const renameMatch = renameClassPattern.exec(input);
  if (renameMatch) {
    return renameMatch[1].trim() && renameMatch[2].trim()
      ? { success: true, proposal: { type: "RENAME_CLASS", targetId: renameMatch[1], name: renameMatch[2] } }
      : rejectedProposal();
  }

  const deleteMatch = deleteClassPattern.exec(input);
  if (deleteMatch) {
    return deleteMatch[1].trim()
      ? { success: true, proposal: { type: "DELETE_CLASS", targetId: deleteMatch[1] } }
      : rejectedProposal();
  }

  return rejectedProposal();
}

export function adaptUmlTextProposal(proposal: UmlTextProposal, createId: () => Uuid = createUuid): UmlCommand {
  switch (proposal.type) {
    case "CREATE_CLASS":
      return { type: "CreateClass", classId: createId(), name: proposal.name };
    case "RENAME_CLASS":
      return { type: "RenameClass", classId: proposal.targetId, name: proposal.name };
    case "DELETE_CLASS":
      return { type: "DeleteClass", classId: proposal.targetId };
  }
}

function rejectedProposal(): UmlTextProposalParseResult {
  return {
    success: false,
    message: "Propuesta inválida. Usa CREATE_CLASS name=\"...\", RENAME_CLASS targetId=\"...\" name=\"...\" o DELETE_CLASS targetId=\"...\".",
  };
}
