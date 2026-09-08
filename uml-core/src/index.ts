export type {
  AddAttributeCommand,
  AddEnumerationLiteralCommand,
  ApplyLayoutCommand,
  CommandRejectedResult,
  CommandResult,
  CommandSuccessResult,
  CreateClassCommand,
  CreateEnumerationCommand,
  CreateRelationshipCommand,
  DeleteClassCommand,
  DeleteEnumerationCommand,
  DeleteRelationshipCommand,
  DiagramElementLayoutInput,
  MoveElementCommand,
  RemoveAttributeCommand,
  RemoveEnumerationLiteralCommand,
  RenameClassCommand,
  RenameEnumerationCommand,
  UpdateClassVisibilityCommand,
  UpdateEnumerationVisibilityCommand,
  UpdateRelationshipNameCommand,
  UmlCommand,
  UpdateAttributeCommand,
  UpdateMultiplicityCommand,
} from "./commands/command.js";

export type { UmlCommandBusHistoryState, UmlCommandBusOptions } from "./commands/command-bus.js";

export type { UmlCommandExecutorOptions } from "./commands/executor.js";

export type {
  CanonicalUmlModel,
  CrudGenerationMetadata,
  DiagramElementLayout,
  DiagramLayout,
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
  multiplicity,
  primitiveType,
  serializeProjectDocument,
} from "./model.js";

export { validateCanonicalUmlModel, validateProjectDocument } from "./validation.js";

export { UmlCommandBus } from "./commands/command-bus.js";
export { UmlCommandExecutor } from "./commands/executor.js";
