import {
  UML_PRIMITIVE_TYPES,
  UML_RELATIONSHIP_TYPES,
  UML_VISIBILITIES,
  type CanonicalUmlModel,
  type DiagramLayout,
  type GenerationMetadata,
  type Multiplicity,
  type ProjectDocument,
  type UmlAttribute,
  type UmlClass,
  type UmlEnumeration,
  type UmlOperation,
  type UmlPackage,
  type UmlParameter,
  type UmlRelationship,
  type UmlType,
  type Uuid,
} from "./model.js";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "UML_INVALID_ID"
  | "UML_DUPLICATE_ID"
  | "UML_REQUIRED_NAME"
  | "UML_DUPLICATE_NAME"
  | "UML_UNKNOWN_REFERENCE"
  | "UML_UNKNOWN_TYPE_REFERENCE"
  | "UML_INVALID_RELATIONSHIP"
  | "UML_INVALID_RELATIONSHIP_TYPE"
  | "UML_SELF_GENERALIZATION"
  | "UML_INHERITANCE_CYCLE"
  | "UML_INVALID_MULTIPLICITY"
  | "UML_PACKAGE_CYCLE"
  | "UML_INVALID_REVISION"
  | "UML_INVALID_GENERATION_METADATA"
  | "UML_INCOHERENT_GENERATION_METADATA"
  | "UML_INVALID_VISIBILITY"
  | "UML_INVALID_TYPE";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  path: string;
  elementId?: Uuid;
}

export interface ValidationResult {
  diagnostics: Diagnostic[];
  hasErrors: boolean;
}

interface ElementRef {
  id: Uuid;
  path: string;
}

interface ValidationContext {
  diagnostics: Diagnostic[];
  ids: Map<Uuid, string>;
  elements: Map<Uuid, string>;
  classIds: Set<Uuid>;
  enumerationIds: Set<Uuid>;
  packageIds: Set<Uuid>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCanonicalUmlModel(model: CanonicalUmlModel): ValidationResult {
  const context: ValidationContext = {
    diagnostics: [],
    ids: new Map(),
    elements: new Map(),
    classIds: new Set(),
    enumerationIds: new Set(),
    packageIds: new Set(),
  };

  indexModel(model, context);
  validatePackages(model.packages, context);
  validateClasses(model.classes, context);
  validateEnumerations(model.enumerations, context);
  validateRelationships(model.relationships, context);
  validateDuplicateClassifierNames(model, context);
  validateInheritanceCycles(model.relationships, context);
  validatePackageCycles(model.packages, context);

  return createValidationResult(context.diagnostics);
}

export function validateProjectDocument(document: ProjectDocument): ValidationResult {
  const modelResult = validateCanonicalUmlModel(document.uml);
  const diagnostics = [...modelResult.diagnostics];

  validateUuid(document.id, "id", diagnostics, document.id);
  if (!Number.isInteger(document.revision) || document.revision < 1) {
    diagnostics.push({
      severity: "error",
      code: "UML_INVALID_REVISION",
      message: "La revisión del documento debe ser un entero mayor o igual a 1.",
      path: "revision",
      elementId: document.id,
    });
  }

  validateLayout(document.layout, document.uml, diagnostics);

  return createValidationResult(diagnostics);
}

function createValidationResult(diagnostics: Diagnostic[]): ValidationResult {
  const ordered = [...diagnostics].sort(compareDiagnostics);
  return {
    diagnostics: ordered,
    hasErrors: ordered.some((diagnostic) => diagnostic.severity === "error"),
  };
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    (left.elementId ?? "").localeCompare(right.elementId ?? "") ||
    left.message.localeCompare(right.message)
  );
}

function indexModel(model: CanonicalUmlModel, context: ValidationContext): void {
  model.packages.forEach((umlPackage, packageIndex) => {
    registerElement(context, umlPackage.id, `packages[${packageIndex}].id`);
    context.packageIds.add(umlPackage.id);
    context.elements.set(umlPackage.id, `packages[${packageIndex}]`);
  });

  model.enumerations.forEach((enumeration, enumerationIndex) => {
    registerElement(context, enumeration.id, `enumerations[${enumerationIndex}].id`);
    context.enumerationIds.add(enumeration.id);
    context.elements.set(enumeration.id, `enumerations[${enumerationIndex}]`);
  });

  model.classes.forEach((umlClass, classIndex) => {
    registerElement(context, umlClass.id, `classes[${classIndex}].id`);
    context.classIds.add(umlClass.id);
    context.elements.set(umlClass.id, `classes[${classIndex}]`);

    umlClass.attributes.forEach((attribute, attributeIndex) => {
      registerElement(context, attribute.id, `classes[${classIndex}].attributes[${attributeIndex}].id`);
      context.elements.set(attribute.id, `classes[${classIndex}].attributes[${attributeIndex}]`);
    });

    umlClass.operations.forEach((operation, operationIndex) => {
      registerElement(context, operation.id, `classes[${classIndex}].operations[${operationIndex}].id`);
      context.elements.set(operation.id, `classes[${classIndex}].operations[${operationIndex}]`);

      operation.parameters.forEach((parameter, parameterIndex) => {
        registerElement(
          context,
          parameter.id,
          `classes[${classIndex}].operations[${operationIndex}].parameters[${parameterIndex}].id`,
        );
        context.elements.set(
          parameter.id,
          `classes[${classIndex}].operations[${operationIndex}].parameters[${parameterIndex}]`,
        );
      });
    });
  });

  model.relationships.forEach((relationship, relationshipIndex) => {
    registerElement(context, relationship.id, `relationships[${relationshipIndex}].id`);
    context.elements.set(relationship.id, `relationships[${relationshipIndex}]`);
  });
}

function registerElement(context: ValidationContext, id: Uuid, path: string): void {
  validateUuid(id, path, context.diagnostics, id);

  if (context.ids.has(id)) {
    context.diagnostics.push({
      severity: "error",
      code: "UML_DUPLICATE_ID",
      message: "Existe más de un elemento con el mismo UUID.",
      path,
      elementId: id,
    });
    return;
  }

  context.ids.set(id, path);
}

function validateUuid(id: Uuid, path: string, diagnostics: Diagnostic[], elementId?: Uuid): void {
  if (!UUID_REGEX.test(id)) {
    diagnostics.push({
      severity: "error",
      code: "UML_INVALID_ID",
      message: "El identificador debe ser un UUID válido.",
      path,
      elementId,
    });
  }
}

function validatePackages(packages: UmlPackage[], context: ValidationContext): void {
  packages.forEach((umlPackage, packageIndex) => {
    validateRequiredName(umlPackage.name, `packages[${packageIndex}].name`, context.diagnostics, umlPackage.id);
    if (umlPackage.parentPackageId && !context.packageIds.has(umlPackage.parentPackageId)) {
      addUnknownReference(
        context,
        `packages[${packageIndex}].parentPackageId`,
        umlPackage.id,
        "El paquete padre referenciado no existe.",
      );
    }
  });
}

function validateClasses(classes: UmlClass[], context: ValidationContext): void {
  classes.forEach((umlClass, classIndex) => {
    validateRequiredName(umlClass.name, `classes[${classIndex}].name`, context.diagnostics, umlClass.id);
    validateVisibility(umlClass.visibility, `classes[${classIndex}].visibility`, context.diagnostics, umlClass.id);
    validateOptionalPackage(umlClass.packageId, `classes[${classIndex}].packageId`, umlClass.id, context);
    validateGenerationMetadata(
      umlClass.generationMetadata,
      `classes[${classIndex}].generationMetadata`,
      umlClass.id,
      context.diagnostics,
    );
    validateAttributes(umlClass.attributes, classIndex, context);
    validateOperations(umlClass.operations, classIndex, context);
  });
}

function validateAttributes(attributes: UmlAttribute[], classIndex: number, context: ValidationContext): void {
  const names = new Map<string, ElementRef>();

  attributes.forEach((attribute, attributeIndex) => {
    const basePath = `classes[${classIndex}].attributes[${attributeIndex}]`;
    validateRequiredName(attribute.name, `${basePath}.name`, context.diagnostics, attribute.id);
    validateVisibility(attribute.visibility, `${basePath}.visibility`, context.diagnostics, attribute.id);
    validateUmlType(attribute.type, `${basePath}.type`, attribute.id, context);
    validateMultiplicity(attribute.multiplicity, `${basePath}.multiplicity`, attribute.id, context.diagnostics);
    validateGenerationMetadata(attribute.generationMetadata, `${basePath}.generationMetadata`, attribute.id, context.diagnostics);
    registerName(names, attribute.name, `${basePath}.name`, attribute.id, context.diagnostics);
  });
}

function validateOperations(operations: UmlOperation[], classIndex: number, context: ValidationContext): void {
  operations.forEach((operation, operationIndex) => {
    const basePath = `classes[${classIndex}].operations[${operationIndex}]`;
    validateRequiredName(operation.name, `${basePath}.name`, context.diagnostics, operation.id);
    validateVisibility(operation.visibility, `${basePath}.visibility`, context.diagnostics, operation.id);
    if (operation.returnType) {
      validateUmlType(operation.returnType, `${basePath}.returnType`, operation.id, context);
    }
    operation.parameters.forEach((parameter, parameterIndex) => {
      validateParameter(parameter, `${basePath}.parameters[${parameterIndex}]`, context);
    });
  });
}

function validateParameter(parameter: UmlParameter, path: string, context: ValidationContext): void {
  validateRequiredName(parameter.name, `${path}.name`, context.diagnostics, parameter.id);
  validateUmlType(parameter.type, `${path}.type`, parameter.id, context);
}

function validateEnumerations(enumerations: UmlEnumeration[], context: ValidationContext): void {
  enumerations.forEach((enumeration, enumerationIndex) => {
    validateRequiredName(enumeration.name, `enumerations[${enumerationIndex}].name`, context.diagnostics, enumeration.id);
    validateVisibility(enumeration.visibility, `enumerations[${enumerationIndex}].visibility`, context.diagnostics, enumeration.id);
    validateOptionalPackage(enumeration.packageId, `enumerations[${enumerationIndex}].packageId`, enumeration.id, context);
    enumeration.literals.forEach((literal, literalIndex) => {
      validateRequiredName(
        literal,
        `enumerations[${enumerationIndex}].literals[${literalIndex}]`,
        context.diagnostics,
        enumeration.id,
      );
    });
  });
}

function validateRelationships(relationships: UmlRelationship[], context: ValidationContext): void {
  relationships.forEach((relationship, relationshipIndex) => {
    const basePath = `relationships[${relationshipIndex}]`;
    if (!UML_RELATIONSHIP_TYPES.includes(relationship.type)) {
      context.diagnostics.push({
        severity: "error",
        code: "UML_INVALID_RELATIONSHIP_TYPE",
        message: "El tipo de relación UML no está soportado.",
        path: `${basePath}.type`,
        elementId: relationship.id,
      });
    }
    if (!context.elements.has(relationship.sourceId)) {
      addInvalidRelationship(context, `${basePath}.sourceId`, relationship.id, "El origen de la relación no existe.");
    }
    if (!context.elements.has(relationship.targetId)) {
      addInvalidRelationship(context, `${basePath}.targetId`, relationship.id, "El destino de la relación no existe.");
    }
    if (relationship.type === "Generalization") {
      if (relationship.sourceId === relationship.targetId) {
        context.diagnostics.push({
          severity: "error",
          code: "UML_SELF_GENERALIZATION",
          message: "Una generalización no puede apuntar a sí misma.",
          path: `${basePath}.targetId`,
          elementId: relationship.id,
        });
      }
      if (!context.classIds.has(relationship.sourceId) || !context.classIds.has(relationship.targetId)) {
        addInvalidRelationship(
          context,
          basePath,
          relationship.id,
          "Una generalización debe conectar clases existentes.",
        );
      }
    }
    validateMultiplicity(relationship.sourceMultiplicity, `${basePath}.sourceMultiplicity`, relationship.id, context.diagnostics);
    validateMultiplicity(relationship.targetMultiplicity, `${basePath}.targetMultiplicity`, relationship.id, context.diagnostics);
  });
}

function validateDuplicateClassifierNames(model: CanonicalUmlModel, context: ValidationContext): void {
  const names = new Map<string, ElementRef>();

  model.classes.forEach((umlClass, classIndex) => {
    registerName(names, scopedName(umlClass.packageId, umlClass.name), `classes[${classIndex}].name`, umlClass.id, context.diagnostics);
  });

  model.enumerations.forEach((enumeration, enumerationIndex) => {
    registerName(
      names,
      scopedName(enumeration.packageId, enumeration.name),
      `enumerations[${enumerationIndex}].name`,
      enumeration.id,
      context.diagnostics,
    );
  });
}

function scopedName(packageId: Uuid | undefined, name: string): string {
  return `${packageId ?? "<root>"}:${name.trim().toLocaleLowerCase()}`;
}

function registerName(names: Map<string, ElementRef>, name: string, path: string, elementId: Uuid, diagnostics: Diagnostic[]): void {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) {
    return;
  }

  if (names.has(normalized)) {
    diagnostics.push({
      severity: "error",
      code: "UML_DUPLICATE_NAME",
      message: "Existe más de un elemento con el mismo nombre dentro del mismo ámbito.",
      path,
      elementId,
    });
  } else {
    names.set(normalized, { id: elementId, path });
  }
}

function validateRequiredName(name: string, path: string, diagnostics: Diagnostic[], elementId: Uuid): void {
  if (!name.trim()) {
    diagnostics.push({
      severity: "error",
      code: "UML_REQUIRED_NAME",
      message: "El nombre es obligatorio.",
      path,
      elementId,
    });
  }
}

function validateVisibility(
  visibility: string,
  path: string,
  diagnostics: Diagnostic[],
  elementId: Uuid,
): void {
  if (!UML_VISIBILITIES.includes(visibility as (typeof UML_VISIBILITIES)[number])) {
    diagnostics.push({
      severity: "error",
      code: "UML_INVALID_VISIBILITY",
      message: "La visibilidad UML no está soportada.",
      path,
      elementId,
    });
  }
}

function validateOptionalPackage(
  packageId: Uuid | undefined,
  path: string,
  elementId: Uuid,
  context: ValidationContext,
): void {
  if (packageId && !context.packageIds.has(packageId)) {
    addUnknownReference(context, path, elementId, "El paquete referenciado no existe.");
  }
}

function validateUmlType(type: UmlType, path: string, elementId: Uuid, context: ValidationContext): void {
  if (type.kind === "primitive") {
    if (!UML_PRIMITIVE_TYPES.includes(type.name)) {
      context.diagnostics.push({
        severity: "error",
        code: "UML_INVALID_TYPE",
        message: "El tipo primitivo UML no está soportado.",
        path: `${path}.name`,
        elementId,
      });
    }
    return;
  }

  if (type.kind === "reference") {
    const targetExists =
      type.referenceType === "class" ? context.classIds.has(type.elementId) : context.enumerationIds.has(type.elementId);
    if (!targetExists) {
      context.diagnostics.push({
        severity: "error",
        code: "UML_UNKNOWN_TYPE_REFERENCE",
        message: "El tipo referenciado no existe en el modelo UML.",
        path: `${path}.elementId`,
        elementId,
      });
    }
    return;
  }

  context.diagnostics.push({
    severity: "error",
    code: "UML_INVALID_TYPE",
    message: "La estructura del tipo UML no es válida.",
    path,
    elementId,
  });
}

function validateMultiplicity(
  value: Multiplicity | undefined,
  path: string,
  elementId: Uuid,
  diagnostics: Diagnostic[],
): void {
  if (!value) {
    return;
  }

  const upperIsValid = value.upper === "unbounded" || Number.isInteger(value.upper);
  const lowerIsValid = Number.isInteger(value.lower) && value.lower >= 0;
  const rangeIsValid = value.upper === "unbounded" || !upperIsValid || value.upper >= value.lower;

  if (!lowerIsValid || !upperIsValid || !rangeIsValid) {
    diagnostics.push({
      severity: "error",
      code: "UML_INVALID_MULTIPLICITY",
      message: "La multiplicidad debe tener lower >= 0 y upper ilimitado o mayor/igual a lower.",
      path,
      elementId,
    });
  }
}

function validateGenerationMetadata(
  metadata: GenerationMetadata | undefined,
  path: string,
  elementId: Uuid,
  diagnostics: Diagnostic[],
): void {
  if (!metadata) {
    return;
  }

  const booleanKeys: Array<keyof GenerationMetadata> = [
    "entity",
    "auditable",
    "readOnly",
    "searchable",
    "required",
    "unique",
    "sortable",
  ];

  booleanKeys.forEach((key) => {
    const value = metadata[key];
    if (value !== undefined && typeof value !== "boolean") {
      diagnostics.push({
        severity: "error",
        code: "UML_INVALID_GENERATION_METADATA",
        message: "Los metadatos booleanos del generador deben usar true o false.",
        path: `${path}.${key}`,
        elementId,
      });
    }
  });

  if (metadata.defaultSort !== undefined && metadata.defaultSort !== "asc" && metadata.defaultSort !== "desc") {
    diagnostics.push({
      severity: "error",
      code: "UML_INVALID_GENERATION_METADATA",
      message: "defaultSort debe ser asc o desc.",
      path: `${path}.defaultSort`,
      elementId,
    });
  }

  if (metadata.defaultSort !== undefined && metadata.sortable !== true) {
    diagnostics.push({
      severity: "warning",
      code: "UML_INCOHERENT_GENERATION_METADATA",
      message: "defaultSort solo tendrá efecto si sortable está habilitado.",
      path: `${path}.defaultSort`,
      elementId,
    });
  }

  if (metadata.crud) {
    (["create", "read", "update", "delete"] as const).forEach((key) => {
      const value = metadata.crud?.[key];
      if (value !== undefined && typeof value !== "boolean") {
        diagnostics.push({
          severity: "error",
          code: "UML_INVALID_GENERATION_METADATA",
          message: "Las capacidades CRUD deben usar true o false.",
          path: `${path}.crud.${key}`,
          elementId,
        });
      }
    });
  }
}

function validateInheritanceCycles(relationships: UmlRelationship[], context: ValidationContext): void {
  const graph = new Map<Uuid, Uuid[]>();

  relationships.forEach((relationship) => {
    if (relationship.type !== "Generalization") {
      return;
    }
    const targets = graph.get(relationship.sourceId) ?? [];
    targets.push(relationship.targetId);
    graph.set(relationship.sourceId, targets);
  });

  detectCycles(graph, "classes", "UML_INHERITANCE_CYCLE", "Existe un ciclo de herencia.", context);
}

function validatePackageCycles(packages: UmlPackage[], context: ValidationContext): void {
  const graph = new Map<Uuid, Uuid[]>();

  packages.forEach((umlPackage) => {
    if (!umlPackage.parentPackageId) {
      return;
    }
    graph.set(umlPackage.id, [umlPackage.parentPackageId]);
  });

  detectCycles(graph, "packages", "UML_PACKAGE_CYCLE", "Existe un ciclo entre paquetes.", context);
}

function detectCycles(
  graph: Map<Uuid, Uuid[]>,
  pathPrefix: string,
  code: "UML_INHERITANCE_CYCLE" | "UML_PACKAGE_CYCLE",
  message: string,
  context: ValidationContext,
): void {
  const visiting = new Set<Uuid>();
  const visited = new Set<Uuid>();
  const emitted = new Set<Uuid>();
  const nodes = [...graph.keys()].sort();

  const visit = (node: Uuid): void => {
    if (visited.has(node)) {
      return;
    }
    if (visiting.has(node)) {
      if (!emitted.has(node)) {
        emitted.add(node);
        context.diagnostics.push({
          severity: "error",
          code,
          message,
          path: `${pathPrefix}.${node}`,
          elementId: node,
        });
      }
      return;
    }

    visiting.add(node);
    const targets = [...(graph.get(node) ?? [])].sort();
    targets.forEach(visit);
    visiting.delete(node);
    visited.add(node);
  };

  nodes.forEach(visit);
}

function validateLayout(layout: DiagramLayout, model: CanonicalUmlModel, diagnostics: Diagnostic[]): void {
  const elements = new Set<Uuid>();
  model.packages.forEach((umlPackage) => elements.add(umlPackage.id));
  model.enumerations.forEach((enumeration) => elements.add(enumeration.id));
  model.classes.forEach((umlClass) => elements.add(umlClass.id));
  model.relationships.forEach((relationship) => elements.add(relationship.id));

  layout.elements.forEach((entry, entryIndex) => {
    if (!elements.has(entry.elementId)) {
      diagnostics.push({
        severity: "error",
        code: "UML_UNKNOWN_REFERENCE",
        message: "El layout referencia un elemento que no existe en el modelo UML.",
        path: `layout.elements[${entryIndex}].elementId`,
        elementId: entry.elementId,
      });
    }
  });
}

function addUnknownReference(context: ValidationContext, path: string, elementId: Uuid, message: string): void {
  context.diagnostics.push({
    severity: "error",
    code: "UML_UNKNOWN_REFERENCE",
    message,
    path,
    elementId,
  });
}

function addInvalidRelationship(context: ValidationContext, path: string, elementId: Uuid, message: string): void {
  context.diagnostics.push({
    severity: "error",
    code: "UML_INVALID_RELATIONSHIP",
    message,
    path,
    elementId,
  });
}
