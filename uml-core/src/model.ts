import { randomUUID } from "node:crypto";

export type Uuid = string;

export const UML_VISIBILITIES = ["public", "private", "protected", "package"] as const;

export type UmlVisibility = (typeof UML_VISIBILITIES)[number];

export const UML_PRIMITIVE_TYPES = [
  "string",
  "integer",
  "boolean",
  "number",
  "date",
  "datetime",
] as const;

export type UmlPrimitiveTypeName = (typeof UML_PRIMITIVE_TYPES)[number];

export interface UmlPrimitiveType {
  kind: "primitive";
  name: UmlPrimitiveTypeName;
}

export interface UmlReferenceType {
  kind: "reference";
  referenceType: "class" | "enumeration";
  elementId: Uuid;
}

export type UmlType = UmlPrimitiveType | UmlReferenceType;

export interface Multiplicity {
  lower: number;
  upper: number | "unbounded";
}

export interface CrudGenerationMetadata {
  create?: boolean;
  read?: boolean;
  update?: boolean;
  delete?: boolean;
}

export interface GenerationMetadata {
  entity?: boolean;
  auditable?: boolean;
  readOnly?: boolean;
  searchable?: boolean;
  crud?: CrudGenerationMetadata;
  required?: boolean;
  unique?: boolean;
  sortable?: boolean;
  defaultSort?: "asc" | "desc";
}

export interface UmlParameter {
  id: Uuid;
  name: string;
  type: UmlType;
}

export interface UmlOperation {
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  parameters: UmlParameter[];
  returnType?: UmlType;
}

export interface UmlAttribute {
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  type: UmlType;
  multiplicity?: Multiplicity;
  generationMetadata?: GenerationMetadata;
}

export interface UmlClass {
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  packageId?: Uuid;
  attributes: UmlAttribute[];
  operations: UmlOperation[];
  generationMetadata?: GenerationMetadata;
}

export interface UmlEnumeration {
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  literals: string[];
  packageId?: Uuid;
}

export interface UmlPackage {
  id: Uuid;
  name: string;
  parentPackageId?: Uuid;
}

export const UML_RELATIONSHIP_TYPES = [
  "Association",
  "Aggregation",
  "Composition",
  "Generalization",
] as const;

export type UmlRelationshipType = (typeof UML_RELATIONSHIP_TYPES)[number];

export interface UmlRelationship {
  id: Uuid;
  type: UmlRelationshipType;
  sourceId: Uuid;
  targetId: Uuid;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
}

export interface CanonicalUmlModel {
  classes: UmlClass[];
  enumerations: UmlEnumeration[];
  packages: UmlPackage[];
  relationships: UmlRelationship[];
}

export interface DiagramElementLayout {
  elementId: Uuid;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface DiagramLayout {
  elements: DiagramElementLayout[];
}

export interface ProjectDocument {
  id: Uuid;
  revision: number;
  createdAt: string;
  updatedAt: string;
  uml: CanonicalUmlModel;
  layout: DiagramLayout;
}

export interface ProjectDocumentOptions {
  id?: Uuid;
  now?: Date;
  uuidFactory?: () => Uuid;
}

export function createUuid(): Uuid {
  return randomUUID();
}

export function createEmptyCanonicalUmlModel(): CanonicalUmlModel {
  return {
    classes: [],
    enumerations: [],
    packages: [],
    relationships: [],
  };
}

export function createEmptyDiagramLayout(): DiagramLayout {
  return {
    elements: [],
  };
}

export function primitiveType(name: UmlPrimitiveTypeName): UmlPrimitiveType {
  return { kind: "primitive", name };
}

export function classReferenceType(elementId: Uuid): UmlReferenceType {
  return { kind: "reference", referenceType: "class", elementId };
}

export function enumerationReferenceType(elementId: Uuid): UmlReferenceType {
  return { kind: "reference", referenceType: "enumeration", elementId };
}

export function multiplicity(lower: number, upper: number | "unbounded" = lower): Multiplicity {
  return { lower, upper };
}

export function createProjectDocument(options: ProjectDocumentOptions = {}): ProjectDocument {
  const now = (options.now ?? new Date()).toISOString();
  const uuidFactory = options.uuidFactory ?? createUuid;

  return {
    id: options.id ?? uuidFactory(),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    uml: createEmptyCanonicalUmlModel(),
    layout: createEmptyDiagramLayout(),
  };
}

export function serializeProjectDocument(document: ProjectDocument): string {
  return JSON.stringify(document);
}

export function deserializeProjectDocument(json: string): ProjectDocument {
  return JSON.parse(json) as ProjectDocument;
}
