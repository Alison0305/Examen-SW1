import {
  createUuid,
  isManyToManyRelationship,
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
import type { CommandResult, DeletionSnapshot, DiagramElementLayoutInput, IndexedDeletionEntry, UmlCommand } from "./command.js";

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
          .filter((relationship) => relationship.sourceId === command.classId || relationship.targetId === command.classId || relationship.associationClassId === command.classId)
          .map((relationship) => relationship.id);
        candidate.uml.classes.splice(classIndex, 1);
        candidate.uml.relationships = candidate.uml.relationships.filter(
          (relationship) => relationship.sourceId !== command.classId && relationship.targetId !== command.classId && relationship.associationClassId !== command.classId,
        );
        candidate.layout.elements = candidate.layout.elements.filter(
          (entry) => entry.elementId !== command.classId && !removedRelationshipIds.includes(entry.elementId),
        );
        return this.validateCandidate(document, candidate, captureDeletionSnapshot(document, command));
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
        return this.validateCandidate(document, candidate, captureDeletionSnapshot(document, command));
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
        return this.validateCandidate(document, candidate, captureDeletionSnapshot(document, command));
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
        return this.validateCandidate(document, candidate, captureDeletionSnapshot(document, command));
      }
      case "CreateRelationship": {
        if (command.relationshipType === "Generalization" && (command.sourceMultiplicity || command.targetMultiplicity)) {
          return rejected(document, [{ severity: "error", code: "UML_INVALID_RELATIONSHIP", message: "Las generalizaciones no admiten multiplicidades.", path: "relationships.multiplicity" }]);
        }
        const relationship: UmlRelationship = {
          id: command.relationshipId ?? this.uuidFactory(),
          type: command.relationshipType,
          sourceId: command.sourceId,
          targetId: command.targetId,
          sourceMultiplicity: command.sourceMultiplicity,
          targetMultiplicity: command.targetMultiplicity,
        };
        if (isManyToManyRelationship(relationship)) {
          return this.createManyToManyAssociation(document, {
            type: "CreateManyToManyAssociation",
            sourceId: relationship.sourceId,
            targetId: relationship.targetId,
            associationId: relationship.id,
          }, relationship);
        }
        const candidate = cloneDocument(document);
        candidate.uml.relationships.push(relationship);
        return this.validateCandidate(document, candidate);
      }
      case "CreateManyToManyAssociation":
        return this.createManyToManyAssociation(document, command);
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
        return this.validateCandidate(document, candidate, captureDeletionSnapshot(document, command));
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
        if (isManyToManyRelationship(relationship)) {
          if (relationship.associationClassId) {
            return this.validateCandidate(document, candidate);
          }
          return this.createManyToManyAssociation(document, {
            type: "CreateManyToManyAssociation",
            sourceId: relationship.sourceId,
            targetId: relationship.targetId,
            associationId: relationship.id,
            intermediateClassId: command.associationClassId,
          }, relationship);
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
      case "RestoreDeletionSnapshot": {
        const candidate = cloneDocument(document);
        const diagnostics = restoreDeletionSnapshot(candidate, command.snapshot);
        return diagnostics.length > 0 ? rejected(document, diagnostics) : this.validateCandidate(document, candidate);
      }
    }
  }

  private createManyToManyAssociation(document: ProjectDocument, command: Extract<UmlCommand, { type: "CreateManyToManyAssociation" }>, existingAssociation?: UmlRelationship): CommandResult {
    const source = findClass(document.uml, command.sourceId);
    const target = findClass(document.uml, command.targetId);
    if (!source || !target || source.id === target.id) {
      return rejected(document, [unknownReference(!source ? command.sourceId : command.targetId, "relationships", "Las clases de la asociación N:M deben existir y ser diferentes.")]);
    }

    if (hasIntermediateAssociation(document.uml, source.id, target.id)) {
      return rejected(document, [{ severity: "error", code: "UML_INVALID_RELATIONSHIP", message: "La asociación N:M ya tiene una clase intermedia.", path: "relationships" }]);
    }

    const candidate = cloneDocument(document);
    const className = intermediateClassName(candidate.uml, source.name, target.name);
    const intermediateClassId = command.intermediateClassId ?? this.uuidFactory();
    candidate.uml.classes.push({
      id: intermediateClassId,
      name: className,
      visibility: "public",
      attributes: [],
      operations: [],
    });
    candidate.layout.elements.push(intermediateLayout(document, source.id, target.id, intermediateClassId));
    const association = existingAssociation ?? { id: command.associationId ?? this.uuidFactory(), type: "Association" as const, sourceId: source.id, targetId: target.id, sourceMultiplicity: { lower: 0, upper: "unbounded" as const }, targetMultiplicity: { lower: 0, upper: "unbounded" as const } };
    association.associationClassId = intermediateClassId;
    const associationIndex = candidate.uml.relationships.findIndex((relationship) => relationship.id === association.id);
    if (associationIndex >= 0) candidate.uml.relationships[associationIndex] = association;
    else candidate.uml.relationships.push(association);
    return this.validateCandidate(document, candidate);
  }

  private validateCandidate(original: ProjectDocument, candidate: ProjectDocument, deletionSnapshot?: DeletionSnapshot): CommandResult {
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
      deletionSnapshot,
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

function intermediateLayout(document: ProjectDocument, sourceId: Uuid, targetId: Uuid, intermediateId: Uuid): DiagramElementLayout {
  const source = document.layout.elements.find((entry) => entry.elementId === sourceId);
  const target = document.layout.elements.find((entry) => entry.elementId === targetId);
  let x = source && target ? (source.x + target.x) / 2 : source ? source.x + 220 : target ? target.x - 220 : 100 + document.uml.classes.length * 40;
  let y = source && target ? (source.y + target.y) / 2 : source?.y ?? target?.y ?? 100 + document.uml.classes.length * 30;

  while (document.layout.elements.some((entry) => Math.abs(entry.x - x) < 180 && Math.abs(entry.y - y) < 120)) {
    y += 140;
  }
  return { elementId: intermediateId, x, y, width: 180, height: 120 };
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

function hasIntermediateAssociation(model: CanonicalUmlModel, sourceId: Uuid, targetId: Uuid): boolean {
  return model.classes.some((intermediate) => {
    return model.relationships.some((relationship) => relationship.sourceId === sourceId && relationship.targetId === targetId && relationship.associationClassId === intermediate.id);
  });
}

function intermediateClassName(model: CanonicalUmlModel, sourceName: string, targetName: string): string {
  const base = `${pascalCase(sourceName)}${pascalCase(targetName)}`;
  if (!model.classes.some((umlClass) => umlClass.name === base)) return base;
  const related = `${base}Relacion`;
  if (!model.classes.some((umlClass) => umlClass.name === related)) return related;
  let index = 2;
  while (model.classes.some((umlClass) => umlClass.name === `${related}${index}`)) index += 1;
  return `${related}${index}`;
}

function pascalCase(name: string): string {
  return name ? `${name[0]!.toUpperCase()}${name.slice(1)}` : name;
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

function captureDeletionSnapshot(document: ProjectDocument, command: UmlCommand): DeletionSnapshot | undefined {
  switch (command.type) {
    case "DeleteClass": {
      const classIndex = document.uml.classes.findIndex((item) => item.id === command.classId);
      if (classIndex < 0) return undefined;
      const relationships = document.uml.relationships
        .map((value, index) => ({ value, index }))
        .filter(({ value }) => value.sourceId === command.classId || value.targetId === command.classId);
      return { kind: "class", umlClass: document.uml.classes[classIndex], classIndex, relationships, layouts: indexedLayouts(document, [command.classId, ...relationships.map(({ value }) => value.id)]) };
    }
    case "DeleteEnumeration": {
      const enumerationIndex = document.uml.enumerations.findIndex((item) => item.id === command.enumerationId);
      if (enumerationIndex < 0) return undefined;
      return { kind: "enumeration", enumeration: document.uml.enumerations[enumerationIndex], enumerationIndex, layouts: indexedLayouts(document, [command.enumerationId]) };
    }
    case "DeleteRelationship": {
      const relationshipIndex = document.uml.relationships.findIndex((item) => item.id === command.relationshipId);
      if (relationshipIndex < 0) return undefined;
      return { kind: "relationship", relationship: document.uml.relationships[relationshipIndex], relationshipIndex, layouts: indexedLayouts(document, [command.relationshipId]) };
    }
    case "RemoveAttribute": {
      const umlClass = findClass(document.uml, command.classId);
      const attributeIndex = umlClass?.attributes.findIndex((item) => item.id === command.attributeId) ?? -1;
      return umlClass && attributeIndex >= 0 ? { kind: "attribute", classId: command.classId, attribute: umlClass.attributes[attributeIndex], attributeIndex } : undefined;
    }
    case "RemoveEnumerationLiteral": {
      const enumeration = findEnumeration(document.uml, command.enumerationId);
      const literalIndex = enumeration?.literals.indexOf(command.literal) ?? -1;
      return enumeration && literalIndex >= 0 ? { kind: "literal", enumerationId: command.enumerationId, literal: command.literal, literalIndex } : undefined;
    }
    default:
      return undefined;
  }
}

function indexedLayouts(document: ProjectDocument, elementIds: Uuid[]): Array<IndexedDeletionEntry<DiagramElementLayout>> {
  return document.layout.elements.map((value, index) => ({ value, index })).filter(({ value }) => elementIds.includes(value.elementId));
}

function restoreDeletionSnapshot(candidate: ProjectDocument, snapshot: DeletionSnapshot): Diagnostic[] {
  if (!snapshot || typeof snapshot !== "object" || !("kind" in snapshot)) return [invalidSnapshot("snapshot", "El snapshot de eliminación es incompleto.")];
  switch (snapshot.kind) {
    case "class": {
      if (!hasId(snapshot.umlClass) || !Array.isArray(snapshot.relationships) || !Array.isArray(snapshot.layouts)) return [invalidSnapshot("snapshot", "El snapshot de clase es incompleto.")];
      const diagnostics = insertIndexed(candidate.uml.classes, [{ value: snapshot.umlClass, index: snapshot.classIndex }], "classes");
      diagnostics.push(...insertIndexed(candidate.uml.relationships, snapshot.relationships, "relationships"));
      diagnostics.push(...insertIndexed(candidate.layout.elements, snapshot.layouts, "layout.elements"));
      return diagnostics;
    }
    case "enumeration":
      return hasId(snapshot.enumeration) && Array.isArray(snapshot.layouts)
        ? [...insertIndexed(candidate.uml.enumerations, [{ value: snapshot.enumeration, index: snapshot.enumerationIndex }], "enumerations"), ...insertIndexed(candidate.layout.elements, snapshot.layouts, "layout.elements")]
        : [invalidSnapshot("snapshot", "El snapshot de enumeración es incompleto.")];
    case "relationship":
      return hasId(snapshot.relationship) && Array.isArray(snapshot.layouts)
        ? [...insertIndexed(candidate.uml.relationships, [{ value: snapshot.relationship, index: snapshot.relationshipIndex }], "relationships"), ...insertIndexed(candidate.layout.elements, snapshot.layouts, "layout.elements")]
        : [invalidSnapshot("snapshot", "El snapshot de relación es incompleto.")];
    case "attribute": {
      const umlClass = findClass(candidate.uml, snapshot.classId);
      return umlClass && hasId(snapshot.attribute)
        ? insertIndexed(umlClass.attributes, [{ value: snapshot.attribute, index: snapshot.attributeIndex }], "classes.attributes")
        : [invalidSnapshot("snapshot", "El snapshot de atributo es incompatible con el documento actual.")];
    }
    case "literal": {
      const enumeration = findEnumeration(candidate.uml, snapshot.enumerationId);
      return enumeration && typeof snapshot.literal === "string"
        ? insertIndexed(enumeration.literals, [{ value: snapshot.literal, index: snapshot.literalIndex }], "enumerations.literals")
        : [invalidSnapshot("snapshot", "El snapshot de literal es incompatible con el documento actual.")];
    }
    default:
      return [invalidSnapshot("snapshot", "El tipo de snapshot no es válido.")];
  }
}

function insertIndexed<T>(collection: T[], entries: Array<IndexedDeletionEntry<T>>, path: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const indexes = new Set<number>();
  for (const [entryIndex, entry] of entries.entries()) {
    if (!entry || !Number.isSafeInteger(entry.index) || entry.index < 0) diagnostics.push(invalidSnapshot(`${path}[${entryIndex}].index`, "El índice de restauración no es un entero seguro válido."));
    else if (indexes.has(entry.index)) diagnostics.push(invalidSnapshot(`${path}[${entryIndex}].index`, "El snapshot contiene índices duplicados."));
    else indexes.add(entry.index);
  }
  if (diagnostics.length > 0) return diagnostics;
  const ordered = [...entries].sort((left, right) => left.index - right.index);
  let length = collection.length;
  for (const entry of ordered) {
    if (entry.index > length) diagnostics.push(invalidSnapshot(`${path}[${entry.index}].index`, "El índice de restauración está fuera del rango de inserción."));
    length += 1;
  }
  if (diagnostics.length > 0) return diagnostics;
  for (const entry of ordered) collection.splice(entry.index, 0, entry.value);
  return diagnostics;
}

function hasId(value: unknown): value is { id: Uuid } {
  return Boolean(value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string");
}

function invalidSnapshot(path: string, message: string): Diagnostic {
  return { severity: "error", code: "UML_INVALID_TYPE", message, path };
}
