import {
  createUuid,
  type CanonicalUmlModel,
  type DiagramElementLayout,
  type ProjectDocument,
  type UmlAttribute,
  type UmlClass,
  type UmlEnumeration,
  type UmlRelationship,
  type UmlType,
  type Uuid,
} from "../model.js";
import { validateProjectDocument, type Diagnostic } from "../validation.js";
import type { CommandResult, DiagramElementLayoutInput, UmlCommand } from "./command.js";

export interface UmlCommandExecutorOptions {
  uuidFactory?: () => Uuid;
  nowFactory?: () => Date;
}

export class UmlCommandExecutor {
  private readonly uuidFactory: () => Uuid;
  private readonly nowFactory: () => Date;

  constructor(options: UmlCommandExecutorOptions = {}) {
    this.uuidFactory = options.uuidFactory ?? createUuid;
    this.nowFactory = options.nowFactory ?? (() => new Date());
  }

  execute(document: ProjectDocument, command: UmlCommand): CommandResult {
    switch (command.type) {
      case "CreateClass": {
        const candidate = cloneDocument(document);
        const classId = command.classId ?? this.uuidFactory();
        candidate.uml.classes.push({
          id: classId,
          name: command.name,
          visibility: command.visibility ?? "public",
          packageId: command.packageId,
          attributes: [],
          operations: [],
        });
        candidate.layout.elements.push(createLayoutEntry(classId, command.layout));
        return this.validateCandidate(document, candidate);
      }
      case "RenameClass": {
        const candidate = cloneDocument(document);
        const umlClass = findClass(candidate.uml, command.classId);
        if (!umlClass) {
          return rejected(document, [unknownReference(command.classId, "classes", "La clase a renombrar no existe.")]);
        }
        umlClass.name = command.name;
        return this.validateCandidate(document, candidate);
      }
      case "UpdateClassVisibility": {
        const candidate = cloneDocument(document);
        const umlClass = findClass(candidate.uml, command.classId);
        if (!umlClass) {
          return rejected(document, [unknownReference(command.classId, "classes", "La clase a actualizar no existe.")]);
        }
        umlClass.visibility = command.visibility;
        return this.validateCandidate(document, candidate);
      }
      case "DeleteClass": {
        const references = collectTypeReferenceDiagnostics(document.uml, "class", command.classId, command.classId);
        if (references.length > 0) {
          return rejected(document, references);
        }
        const candidate = cloneDocument(document);
        const classIndex = candidate.uml.classes.findIndex((umlClass) => umlClass.id === command.classId);
        if (classIndex < 0) {
          return rejected(document, [unknownReference(command.classId, "classes", "La clase a eliminar no existe.")]);
        }
        const removedRelationshipIds = candidate.uml.relationships
          .filter((relationship) => relationship.sourceId === command.classId || relationship.targetId === command.classId)
          .map((relationship) => relationship.id);
        candidate.uml.classes.splice(classIndex, 1);
        candidate.uml.relationships = candidate.uml.relationships.filter(
          (relationship) => relationship.sourceId !== command.classId && relationship.targetId !== command.classId,
        );
        candidate.layout.elements = candidate.layout.elements.filter(
          (entry) => entry.elementId !== command.classId && !removedRelationshipIds.includes(entry.elementId),
        );
        return this.validateCandidate(document, candidate);
      }
      case "AddAttribute": {
        const candidate = cloneDocument(document);
        const umlClass = findClass(candidate.uml, command.classId);
        if (!umlClass) {
          return rejected(document, [unknownReference(command.classId, "classes", "La clase del atributo no existe.")]);
        }
        umlClass.attributes.push({
          id: command.attributeId ?? this.uuidFactory(),
          name: command.name,
          visibility: command.visibility ?? "private",
          type: command.attributeType,
          multiplicity: command.multiplicity,
          generationMetadata: command.generationMetadata,
        });
        return this.validateCandidate(document, candidate);
      }
      case "UpdateAttribute": {
        const candidate = cloneDocument(document);
        const attribute = findAttribute(candidate.uml, command.classId, command.attributeId);
        if (!attribute) {
          return rejected(document, [unknownReference(command.attributeId, "classes.attributes", "El atributo a actualizar no existe.")]);
        }
        attribute.name = command.updates.name ?? attribute.name;
        attribute.visibility = command.updates.visibility ?? attribute.visibility;
        attribute.type = command.updates.attributeType ?? attribute.type;
        if ("multiplicity" in command.updates) {
          attribute.multiplicity = command.updates.multiplicity;
        }
        if ("generationMetadata" in command.updates) {
          attribute.generationMetadata = command.updates.generationMetadata;
        }
        return this.validateCandidate(document, candidate);
      }
      case "RemoveAttribute": {
        const candidate = cloneDocument(document);
        const umlClass = findClass(candidate.uml, command.classId);
        const attributeIndex = umlClass?.attributes.findIndex((attribute) => attribute.id === command.attributeId) ?? -1;
        if (!umlClass || attributeIndex < 0) {
          return rejected(document, [unknownReference(command.attributeId, "classes.attributes", "El atributo a remover no existe.")]);
        }
        umlClass.attributes.splice(attributeIndex, 1);
        return this.validateCandidate(document, candidate);
      }
      case "CreateEnumeration": {
        const candidate = cloneDocument(document);
        const enumerationId = command.enumerationId ?? this.uuidFactory();
        candidate.uml.enumerations.push({
          id: enumerationId,
          name: command.name,
          visibility: command.visibility ?? "public",
          literals: command.literals ?? [],
          packageId: command.packageId,
        });
        candidate.layout.elements.push(createLayoutEntry(enumerationId, command.layout));
        return this.validateCandidate(document, candidate);
      }
      case "RenameEnumeration": {
        const candidate = cloneDocument(document);
        const enumeration = findEnumeration(candidate.uml, command.enumerationId);
        if (!enumeration) {
          return rejected(document, [unknownReference(command.enumerationId, "enumerations", "La enumeración a renombrar no existe.")]);
        }
        enumeration.name = command.name;
        return this.validateCandidate(document, candidate);
      }
      case "UpdateEnumerationVisibility": {
        const candidate = cloneDocument(document);
        const enumeration = findEnumeration(candidate.uml, command.enumerationId);
        if (!enumeration) {
          return rejected(document, [unknownReference(command.enumerationId, "enumerations", "La enumeración a actualizar no existe.")]);
        }
        enumeration.visibility = command.visibility;
        return this.validateCandidate(document, candidate);
      }
      case "DeleteEnumeration": {
        const references = collectTypeReferenceDiagnostics(document.uml, "enumeration", command.enumerationId);
        if (references.length > 0) {
          return rejected(document, references);
        }
        const candidate = cloneDocument(document);
        const enumerationIndex = candidate.uml.enumerations.findIndex((enumeration) => enumeration.id === command.enumerationId);
        if (enumerationIndex < 0) {
          return rejected(document, [unknownReference(command.enumerationId, "enumerations", "La enumeración a eliminar no existe.")]);
        }
        candidate.uml.enumerations.splice(enumerationIndex, 1);
        candidate.layout.elements = candidate.layout.elements.filter((entry) => entry.elementId !== command.enumerationId);
        return this.validateCandidate(document, candidate);
      }
      case "AddEnumerationLiteral": {
        const candidate = cloneDocument(document);
        const enumeration = findEnumeration(candidate.uml, command.enumerationId);
        if (!enumeration) {
          return rejected(document, [unknownReference(command.enumerationId, "enumerations", "La enumeración del literal no existe.")]);
        }
        enumeration.literals.push(command.literal);
        return this.validateCandidate(document, candidate);
      }
      case "RemoveEnumerationLiteral": {
        const candidate = cloneDocument(document);
        const enumeration = findEnumeration(candidate.uml, command.enumerationId);
        const literalIndex = enumeration?.literals.indexOf(command.literal) ?? -1;
        if (!enumeration || literalIndex < 0) {
          return rejected(document, [unknownReference(command.enumerationId, "enumerations.literals", "El literal a remover no existe.")]);
        }
        enumeration.literals.splice(literalIndex, 1);
        return this.validateCandidate(document, candidate);
      }
      case "CreateRelationship": {
        if (command.relationshipType === "Generalization" && (command.sourceMultiplicity || command.targetMultiplicity)) {
          return rejected(document, [{ severity: "error", code: "UML_INVALID_RELATIONSHIP", message: "Las generalizaciones no admiten multiplicidades.", path: "relationships.multiplicity" }]);
        }
        const candidate = cloneDocument(document);
        candidate.uml.relationships.push({
          id: command.relationshipId ?? this.uuidFactory(),
          type: command.relationshipType,
          sourceId: command.sourceId,
          targetId: command.targetId,
          sourceMultiplicity: command.sourceMultiplicity,
          targetMultiplicity: command.targetMultiplicity,
        });
        return this.validateCandidate(document, candidate);
      }
      case "DeleteRelationship": {
        const candidate = cloneDocument(document);
        const relationshipIndex = candidate.uml.relationships.findIndex(
          (relationship) => relationship.id === command.relationshipId,
        );
        if (relationshipIndex < 0) {
          return rejected(document, [unknownReference(command.relationshipId, "relationships", "La relación a eliminar no existe.")]);
        }
        candidate.uml.relationships.splice(relationshipIndex, 1);
        candidate.layout.elements = candidate.layout.elements.filter((entry) => entry.elementId !== command.relationshipId);
        return this.validateCandidate(document, candidate);
      }
      case "UpdateMultiplicity": {
        const candidate = cloneDocument(document);
        const relationship = findRelationship(candidate.uml, command.relationshipId);
        if (!relationship) {
          return rejected(document, [unknownReference(command.relationshipId, "relationships", "La relación a actualizar no existe.")]);
        }
        if (relationship.type === "Generalization") {
          return rejected(document, [{ severity: "error", code: "UML_INVALID_RELATIONSHIP", message: "Las generalizaciones no admiten multiplicidades.", path: "relationships.multiplicity", elementId: command.relationshipId }]);
        }
        if (command.end === "source") {
          relationship.sourceMultiplicity = command.multiplicity;
        } else {
          relationship.targetMultiplicity = command.multiplicity;
        }
        return this.validateCandidate(document, candidate);
      }
      case "UpdateRelationshipName": {
        const candidate = cloneDocument(document);
        const relationship = findRelationship(candidate.uml, command.relationshipId);
        if (!relationship) {
          return rejected(document, [unknownReference(command.relationshipId, "relationships", "La relación a actualizar no existe.")]);
        }
        if (relationship.type === "Generalization") {
          return rejected(document, [{
            severity: "error",
            code: "UML_INVALID_RELATIONSHIP",
            message: "Las generalizaciones no admiten nombre en este workspace.",
            path: "relationships.name",
            elementId: command.relationshipId,
          }]);
        }

        const name = command.name.trim();
        if (name) {
          relationship.name = name;
        } else {
          delete relationship.name;
        }
        return this.validateCandidate(document, candidate);
      }
      case "MoveElement": {
        if (!hasModelElement(document.uml, command.elementId)) {
          return rejected(document, [unknownReference(command.elementId, "layout.elements", "El elemento a mover no existe.")]);
        }
        const candidate = cloneDocument(document);
        const layoutIndex = candidate.layout.elements.findIndex((entry) => entry.elementId === command.elementId);
        if (layoutIndex < 0) {
          return rejected(document, [unknownReference(command.elementId, "layout.elements", "La entrada de layout a mover no existe.")]);
        }
        candidate.layout.elements[layoutIndex] = {
          ...candidate.layout.elements[layoutIndex],
          x: command.x,
          y: command.y,
          width: command.width ?? candidate.layout.elements[layoutIndex].width,
          height: command.height ?? candidate.layout.elements[layoutIndex].height,
        };
        return this.validateCandidate(document, candidate);
      }
      case "ApplyLayout": {
        const diagnostics = collectLayoutCommandDiagnostics(document, command.elements);
        if (diagnostics.length > 0) {
          return rejected(document, diagnostics);
        }

        const candidate = cloneDocument(document);
        command.elements.forEach((element) => {
          const layoutIndex = candidate.layout.elements.findIndex((entry) => entry.elementId === element.elementId);
          candidate.layout.elements[layoutIndex] = {
            ...candidate.layout.elements[layoutIndex],
            x: element.x,
            y: element.y,
            width: element.width ?? candidate.layout.elements[layoutIndex].width,
            height: element.height ?? candidate.layout.elements[layoutIndex].height,
          };
        });
        return this.validateCandidate(document, candidate);
      }
    }
  }

  private validateCandidate(original: ProjectDocument, candidate: ProjectDocument): CommandResult {
    candidate.revision = original.revision + 1;
    candidate.updatedAt = this.nowFactory().toISOString();
    const validation = validateProjectDocument(candidate);
    if (validation.hasErrors) {
      return rejected(original, validation.diagnostics);
    }

    return {
      success: true,
      status: "success",
      document: candidate,
      diagnostics: validation.diagnostics,
    };
  }
}

function createLayoutEntry(elementId: Uuid, layout: DiagramElementLayoutInput | undefined): DiagramElementLayout {
  return {
    elementId,
    x: layout?.x ?? 0,
    y: layout?.y ?? 0,
    width: layout?.width,
    height: layout?.height,
  };
}

function cloneDocument(document: ProjectDocument): ProjectDocument {
  return JSON.parse(JSON.stringify(document)) as ProjectDocument;
}

function rejected(document: ProjectDocument, diagnostics: Diagnostic[]): CommandResult {
  return {
    success: false,
    status: "rejected",
    document: cloneDocument(document),
    diagnostics: [...diagnostics].sort(compareDiagnostics),
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

function unknownReference(elementId: Uuid, path: string, message: string): Diagnostic {
  return {
    severity: "error",
    code: "UML_UNKNOWN_REFERENCE",
    message,
    path,
    elementId,
  };
}

function typeReferenceDiagnostic(elementId: Uuid, path: string, message: string): Diagnostic {
  return {
    severity: "error",
    code: "UML_UNKNOWN_TYPE_REFERENCE",
    message,
    path,
    elementId,
  };
}

function findClass(model: CanonicalUmlModel, classId: Uuid): UmlClass | undefined {
  return model.classes.find((umlClass) => umlClass.id === classId);
}

function findEnumeration(model: CanonicalUmlModel, enumerationId: Uuid): UmlEnumeration | undefined {
  return model.enumerations.find((enumeration) => enumeration.id === enumerationId);
}

function findRelationship(model: CanonicalUmlModel, relationshipId: Uuid): UmlRelationship | undefined {
  return model.relationships.find((relationship) => relationship.id === relationshipId);
}

function findAttribute(model: CanonicalUmlModel, classId: Uuid, attributeId: Uuid): UmlAttribute | undefined {
  return findClass(model, classId)?.attributes.find((attribute) => attribute.id === attributeId);
}

function hasModelElement(model: CanonicalUmlModel, elementId: Uuid): boolean {
  return (
    model.packages.some((umlPackage) => umlPackage.id === elementId) ||
    model.enumerations.some((enumeration) => enumeration.id === elementId) ||
    model.classes.some((umlClass) => umlClass.id === elementId) ||
    model.relationships.some((relationship) => relationship.id === elementId)
  );
}

function collectLayoutCommandDiagnostics(
  document: ProjectDocument,
  elements: Array<DiagramElementLayoutInput & { elementId: Uuid }>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<Uuid>();

  elements.forEach((element, index) => {
    const path = `layout.elements[${index}]`;
    if (seen.has(element.elementId)) {
      diagnostics.push({
        severity: "error",
        code: "UML_DUPLICATE_ID",
        message: "El comando de layout contiene más de una posición para el mismo elemento.",
        path: `${path}.elementId`,
        elementId: element.elementId,
      });
    }
    seen.add(element.elementId);

    if (!hasModelElement(document.uml, element.elementId)) {
      diagnostics.push(unknownReference(element.elementId, `${path}.elementId`, "El elemento de layout no existe."));
      return;
    }

    if (!document.layout.elements.some((entry) => entry.elementId === element.elementId)) {
      diagnostics.push(unknownReference(element.elementId, `${path}.elementId`, "La entrada de layout a actualizar no existe."));
    }
  });

  return diagnostics;
}

function collectTypeReferenceDiagnostics(
  model: CanonicalUmlModel,
  referenceType: "class" | "enumeration",
  referencedId: Uuid,
  excludedClassId?: Uuid,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const classifier = referenceType === "class" ? "la clase" : "la enumeración";
  const message = `No se puede eliminar ${classifier} porque otro elemento la referencia como tipo.`;

  model.classes.forEach((umlClass, classIndex) => {
    if (umlClass.id === excludedClassId) {
      return;
    }

    umlClass.attributes.forEach((attribute, attributeIndex) => {
      if (typeReferences(attribute.type, referenceType, referencedId)) {
        diagnostics.push(
          typeReferenceDiagnostic(attribute.id, `classes[${classIndex}].attributes[${attributeIndex}].type.elementId`, message),
        );
      }
    });

    umlClass.operations.forEach((operation, operationIndex) => {
      if (operation.returnType && typeReferences(operation.returnType, referenceType, referencedId)) {
        diagnostics.push(
          typeReferenceDiagnostic(operation.id, `classes[${classIndex}].operations[${operationIndex}].returnType.elementId`, message),
        );
      }

      operation.parameters.forEach((parameter, parameterIndex) => {
        if (typeReferences(parameter.type, referenceType, referencedId)) {
          diagnostics.push(
            typeReferenceDiagnostic(
              parameter.id,
              `classes[${classIndex}].operations[${operationIndex}].parameters[${parameterIndex}].type.elementId`,
              message,
            ),
          );
        }
      });
    });
  });

  return diagnostics;
}

function typeReferences(type: UmlType, referenceType: "class" | "enumeration", referencedId: Uuid): boolean {
  return type.kind === "reference" && type.referenceType === referenceType && type.elementId === referencedId;
}
