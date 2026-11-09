import { Injectable } from "@nestjs/common";
import type { ProjectDocument, UmlType } from "@examen-sw1/uml-core";
import type { MentorProjectContext } from "./mentor.contracts";

const MAX_CLASSES = 40;
const MAX_ATTRIBUTES = 20;
const MAX_ENUMERATIONS = 20;
const MAX_RELATIONSHIPS = 60;

function multiplicity(value: { lower: number; upper: number | "unbounded" } | undefined): string | undefined {
  return value ? `${value.lower}..${value.upper === "unbounded" ? "*" : value.upper}` : undefined;
}

function relationshipStatement(subject: string, related: string, relatedMultiplicity: string | undefined): string | undefined {
  return relatedMultiplicity ? `Por cada ${subject}, existen ${relatedMultiplicity} instancias de ${related} relacionadas.` : undefined;
}

function typeName(type: UmlType, names: ReadonlyMap<string, string>): string {
  return type.kind === "primitive" ? type.name : names.get(type.elementId) ?? "referencia desconocida";
}

@Injectable()
export class MentorContextBuilder {
  build(project: Readonly<{ name: string; revision: number; document: ProjectDocument }>): MentorProjectContext {
    const uml = project.document.uml;
    const namedElements = [...uml.classes, ...uml.enumerations].map((element) => [element.id, element.name] as const);
    const names = new Map(namedElements);
    const classes = [...uml.classes]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, MAX_CLASSES)
      .map((umlClass) => ({
        name: umlClass.name,
        attributes: [...umlClass.attributes]
          .sort((left, right) => left.name.localeCompare(right.name))
          .slice(0, MAX_ATTRIBUTES)
          .map((attribute) => ({ name: attribute.name, type: typeName(attribute.type, names), multiplicity: multiplicity(attribute.multiplicity) })),
      }));
    const enumerations = [...uml.enumerations]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, MAX_ENUMERATIONS)
      .map((enumeration) => ({ name: enumeration.name, literals: [...enumeration.literals].sort() }));
    const relationships = [...uml.relationships]
      .sort((left, right) => `${names.get(left.sourceId) ?? ""}:${names.get(left.targetId) ?? ""}:${left.type}`.localeCompare(`${names.get(right.sourceId) ?? ""}:${names.get(right.targetId) ?? ""}:${right.type}`))
      .slice(0, MAX_RELATIONSHIPS)
      .map((relationship) => {
        const source = names.get(relationship.sourceId) ?? "elemento desconocido";
        const target = names.get(relationship.targetId) ?? "elemento desconocido";
        return {
          type: relationship.type,
          source,
          target,
          // UML multiplicity at one end constrains instances of that end per opposite instance.
          sourceToTarget: relationshipStatement(source, target, multiplicity(relationship.targetMultiplicity)),
          targetToSource: relationshipStatement(target, source, multiplicity(relationship.sourceMultiplicity)),
        };
      });
    return { projectName: project.name, revision: project.revision, classes, enumerations, relationships, elementNames: [...new Set([...classes.map((item) => item.name), ...enumerations.map((item) => item.name)])].sort((left, right) => left.localeCompare(right)) };
  }
}
