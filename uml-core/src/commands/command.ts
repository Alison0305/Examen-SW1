import type {
  GenerationMetadata,
  Multiplicity,
  ProjectDocument,
  UmlRelationshipType,
  UmlType,
  UmlVisibility,
  Uuid,
} from "../model.js";
import type { Diagnostic } from "../validation.js";

export interface DiagramElementLayoutInput {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface CreateClassCommand {
  type: "CreateClass";
  classId?: Uuid;
  name: string;
  visibility?: UmlVisibility;
  packageId?: Uuid;
  layout?: DiagramElementLayoutInput;
}

export interface RenameClassCommand {
  type: "RenameClass";
  classId: Uuid;
  name: string;
}

export interface UpdateClassVisibilityCommand {
  type: "UpdateClassVisibility";
  classId: Uuid;
  visibility: UmlVisibility;
}

export interface DeleteClassCommand {
  type: "DeleteClass";
  classId: Uuid;
}

export interface AddAttributeCommand {
  type: "AddAttribute";
  classId: Uuid;
  attributeId?: Uuid;
  name: string;
  visibility?: UmlVisibility;
  attributeType: UmlType;
  multiplicity?: Multiplicity;
  generationMetadata?: GenerationMetadata;
}

export interface UpdateAttributeCommand {
  type: "UpdateAttribute";
  classId: Uuid;
  attributeId: Uuid;
  updates: {
    name?: string;
    visibility?: UmlVisibility;
    attributeType?: UmlType;
    multiplicity?: Multiplicity;
    generationMetadata?: GenerationMetadata;
  };
}

export interface RemoveAttributeCommand {
  type: "RemoveAttribute";
  classId: Uuid;
  attributeId: Uuid;
}

export interface CreateEnumerationCommand {
  type: "CreateEnumeration";
  enumerationId?: Uuid;
  name: string;
  visibility?: UmlVisibility;
  literals?: string[];
  packageId?: Uuid;
  layout?: DiagramElementLayoutInput;
}

export interface RenameEnumerationCommand {
  type: "RenameEnumeration";
  enumerationId: Uuid;
  name: string;
}

export interface UpdateEnumerationVisibilityCommand {
  type: "UpdateEnumerationVisibility";
  enumerationId: Uuid;
  visibility: UmlVisibility;
}

export interface DeleteEnumerationCommand {
  type: "DeleteEnumeration";
  enumerationId: Uuid;
}

export interface AddEnumerationLiteralCommand {
  type: "AddEnumerationLiteral";
  enumerationId: Uuid;
  literal: string;
}

export interface RemoveEnumerationLiteralCommand {
  type: "RemoveEnumerationLiteral";
  enumerationId: Uuid;
  literal: string;
}

export interface CreateRelationshipCommand {
  type: "CreateRelationship";
  relationshipId?: Uuid;
  relationshipType: UmlRelationshipType;
  sourceId: Uuid;
  targetId: Uuid;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
}

export interface DeleteRelationshipCommand {
  type: "DeleteRelationship";
  relationshipId: Uuid;
}

export interface UpdateMultiplicityCommand {
  type: "UpdateMultiplicity";
  relationshipId: Uuid;
  end: "source" | "target";
  multiplicity?: Multiplicity;
}

export interface UpdateRelationshipNameCommand {
  type: "UpdateRelationshipName";
  relationshipId: Uuid;
  name: string;
}

export interface MoveElementCommand {
  type: "MoveElement";
  elementId: Uuid;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ApplyLayoutCommand {
  type: "ApplyLayout";
  elements: Array<DiagramElementLayoutInput & { elementId: Uuid }>;
}

export type UmlCommand =
  | CreateClassCommand
  | RenameClassCommand
  | UpdateClassVisibilityCommand
  | DeleteClassCommand
  | AddAttributeCommand
  | UpdateAttributeCommand
  | RemoveAttributeCommand
  | CreateEnumerationCommand
  | RenameEnumerationCommand
  | UpdateEnumerationVisibilityCommand
  | DeleteEnumerationCommand
  | AddEnumerationLiteralCommand
  | RemoveEnumerationLiteralCommand
  | CreateRelationshipCommand
  | DeleteRelationshipCommand
  | UpdateMultiplicityCommand
  | UpdateRelationshipNameCommand
  | MoveElementCommand
  | ApplyLayoutCommand;

export interface CommandSuccessResult {
  success: true;
  status: "success";
  document: ProjectDocument;
  diagnostics: Diagnostic[];
}

export interface CommandRejectedResult {
  success: false;
  status: "rejected";
  document: ProjectDocument;
  diagnostics: Diagnostic[];
}

export type CommandResult = CommandSuccessResult | CommandRejectedResult;
