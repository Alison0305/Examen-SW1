import { applyNodeChanges, type Edge, type Node, type NodeChange } from "@xyflow/react";
import type { ProjectDocument, UmlClass, UmlEnumeration, UmlRelationship, UmlVisibility } from "@examen-sw1/uml-core";
import { formatMultiplicity } from "./workspace-utils";
import { calculateUmlEdgeRoute, type UmlEdgeRoute } from "./uml-edge-routing";

export interface UmlNodeData extends Record<string, unknown> {
  kind: "class" | "enumeration";
  selected: boolean;
  label: string;
  visibility: UmlVisibility;
  attributes?: string[];
  literals?: string[];
}

export interface UmlEdgeData extends Record<string, unknown> {
  relationshipType: UmlRelationship["type"];
  label: string;
  sourceMultiplicityLabel: string;
  targetMultiplicityLabel: string;
  selected: boolean;
  route: UmlEdgeRoute;
}

export type UmlReactFlowNode = Node<UmlNodeData>;
export type UmlReactFlowEdge = Edge<UmlEdgeData>;

export function toReactFlowNodes(document: ProjectDocument, selectedId?: string, readOnly = false, remoteSelectionIds: string[] = []): UmlReactFlowNode[] {
  const layout = new Map(document.layout.elements.map((entry) => [entry.elementId, entry]));

  const classNodes = document.uml.classes.map((umlClass, index): UmlReactFlowNode => {
    const entry = layout.get(umlClass.id);
    return {
      id: umlClass.id,
      type: "umlClass",
      position: { x: entry?.x ?? 100 + index * 40, y: entry?.y ?? 100 + index * 30 },
      data: {
        kind: "class",
        selected: selectedId === umlClass.id,
        label: umlClass.name,
        visibility: umlClass.visibility,
        attributes: umlClass.attributes.map((attribute) => `${attribute.visibility}:${attribute.name}:${attribute.type.kind === "primitive" ? attribute.type.name : attribute.type.elementId}`),
      },
      selected: selectedId === umlClass.id,
      draggable: !readOnly,
      style: remoteSelectionIds.includes(umlClass.id) ? { outline: "2px solid #f59e0b", outlineOffset: 3 } : undefined,
    };
  });

  const enumNodes = document.uml.enumerations.map((enumeration, index): UmlReactFlowNode => {
    const entry = layout.get(enumeration.id);
    return {
      id: enumeration.id,
      type: "umlEnumeration",
      position: { x: entry?.x ?? 160 + index * 40, y: entry?.y ?? 300 + index * 30 },
      data: {
        kind: "enumeration",
        selected: selectedId === enumeration.id,
        label: enumeration.name,
        visibility: enumeration.visibility,
        literals: enumeration.literals,
      },
      selected: selectedId === enumeration.id,
      draggable: !readOnly,
      style: remoteSelectionIds.includes(enumeration.id) ? { outline: "2px solid #f59e0b", outlineOffset: 3 } : undefined,
    };
  });

  return [...classNodes, ...enumNodes];
}

export function toReactFlowEdges(document: ProjectDocument, selectedId?: string, measuredNodes: ReadonlyArray<Node> = []): UmlReactFlowEdge[] {
  const layout = new Map(document.layout.elements.map((entry) => [entry.elementId, entry]));
  const measuredById = new Map(measuredNodes.map((node) => [node.id, node]));
  return document.uml.relationships.map((relationship): UmlReactFlowEdge => ({
    id: relationship.id,
    type: "umlRelationship",
    source: relationship.sourceId,
    target: relationship.targetId,
    label: relationshipLabel(relationship),
    animated: false,
    selected: selectedId === relationship.id,
    data: {
      relationshipType: relationship.type,
      label: relationshipLabel(relationship),
      sourceMultiplicityLabel: formatMultiplicity(relationship.sourceMultiplicity),
      targetMultiplicityLabel: formatMultiplicity(relationship.targetMultiplicity),
      selected: selectedId === relationship.id,
      route: calculateUmlEdgeRoute(nodeBounds(document, layout.get(relationship.sourceId), relationship.sourceId, measuredById.get(relationship.sourceId)), nodeBounds(document, layout.get(relationship.targetId), relationship.targetId, measuredById.get(relationship.targetId))),
    },
  }));
}

export function relationshipLabel(relationship: UmlRelationship): string {
  return relationship.type === "Generalization" ? "" : relationship.name || "";
}

export function classifierDimensions(element: UmlClass | UmlEnumeration): { width: number; height: number } {
  const rows = "attributes" in element ? element.attributes.length : element.literals.length;
  return { width: 180, height: Math.max(120, 78 + rows * 20) };
}

function nodeBounds(document: ProjectDocument, entry: { x: number; y: number; width?: number; height?: number } | undefined, elementId: string, measured: Node | undefined) {
  const element = [...document.uml.classes, ...document.uml.enumerations].find((candidate) => candidate.id === elementId);
  const dimensions = element ? classifierDimensions(element) : { width: 180, height: 120 };
  return { x: measured?.position.x ?? entry?.x ?? 0, y: measured?.position.y ?? entry?.y ?? 0, width: measured?.measured?.width ?? entry?.width ?? dimensions.width, height: measured?.measured?.height ?? entry?.height ?? dimensions.height };
}

export function applyVisualNodeChanges(nodes: UmlReactFlowNode[], changes: NodeChange<UmlReactFlowNode>[]): UmlReactFlowNode[] {
  return applyNodeChanges(changes, nodes);
}
