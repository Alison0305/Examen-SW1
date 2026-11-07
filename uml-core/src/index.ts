export type {
  AddAttributeCommand,
  AddEnumerationLiteralCommand,
  ApplyLayoutCommand,
  CommandRejectedResult,
  CommandResult,
  CommandSuccessResult,
  CreateClassCommand,
  CreateEnumerationCommand,
  CreateManyToManyAssociationCommand,
  CreateRelationshipCommand,
  DeleteClassCommand,
  DeleteEnumerationCommand,
  DeleteRelationshipCommand,
  DeletionSnapshot,
  DiagramElementLayoutInput,
  ImportUmlFragmentCommand,
  IndexedDeletionEntry,
  MoveElementCommand,
  RemoveAttributeCommand,
  RemoveEnumerationLiteralCommand,
  RemoveUmlFragmentCommand,
  RestoreDeletionSnapshotCommand,
  RenameClassCommand,
  RenameEnumerationCommand,
  UpdateClassVisibilityCommand,
  UpdateEnumerationVisibilityCommand,
  UpdateRelationshipNameCommand,
  UmlCommand,
  UpdateAttributeCommand,
  UpdateMultiplicityCommand,
  UmlFragment,
} from "./commands/command.js";
export { UML_FRAGMENT_MAX_ELEMENTS } from "./commands/command.js";

export type { UmlCommandBusHistoryState, UmlCommandBusOptions } from "./commands/command-bus.js";

export type { UmlCommandExecutorOptions } from "./commands/executor.js";

export type {
  CanonicalUmlModel,
  CrudGenerationMetadata,
  DiagramElementLayout,
  DiagramLayout,
  ForeignKeyOwner,
  GenerationMetadata,
  Multiplicity,
  ProjectDocument,
  ProjectDocumentOptions,
  UmlAttribute,
  UmlClass,
  UmlEnumeration,
  UmlOperation,
  UmlPackage,
  UmlParameter,
  UmlPrimitiveType,
  UmlPrimitiveTypeName,
  UmlReferenceType,
  UmlRelationship,
  UmlRelationshipType,
  UmlType,
  UmlVisibility,
  Uuid,
} from "./model.js";

export type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  ValidationResult,
} from "./validation.js";

export type { UmlTextProposal, UmlTextProposalParseResult } from "./text-proposal.js";

export {
  UML_PRIMITIVE_TYPES,
  UML_RELATIONSHIP_TYPES,
  UML_VISIBILITIES,
  classReferenceType,
  createEmptyCanonicalUmlModel,
  createEmptyDiagramLayout,
  createProjectDocument,
  createUuid,
  deserializeProjectDocument,
  enumerationReferenceType,
  isManyMultiplicity,
  isManyToManyRelationship,
  multiplicity,
  primitiveType,
  serializeProjectDocument,
} from "./model.js";

export { validateCanonicalUmlModel, validateProjectDocument } from "./validation.js";

export { UmlCommandBus } from "./commands/command-bus.js";
export { UmlCommandExecutor } from "./commands/executor.js";
export { adaptUmlTextProposal, parseUmlTextProposal } from "./text-proposal.js";
export { buildImportFragment, normalizePrimitiveTypeName, previewImportFragment } from "./import-proposal.js";
export type {
  ImportAttribute,
  ImportClass,
  ImportDiagnostic,
  ImportDiagnosticSeverity,
  ImportEnumeration,
  ImportFragmentOptions,
  ImportFragmentResult,
  ImportPreview,
  ImportRelationship,
  UmlImportProposal,
} from "./import-proposal.js";
