import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { DiagramElementLayout, ProjectDocument } from "@examen-sw1/uml-core";
import { classifierDimensions } from "./react-flow-adapters";

export type AutoLayoutElement = Pick<DiagramElementLayout, "elementId" | "x" | "y">;

const elk = new ELK({
  defaultLayoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.spacing.nodeNode": "110",
    "elk.layered.spacing.nodeNodeBetweenLayers": "160",
    "elk.layered.nodePlacement.favorStraightEdges": "true",
  },
});

export async function calculateAutoLayout(document: ProjectDocument): Promise<AutoLayoutElement[]> {
  const layoutByElement = new Map(document.layout.elements.map((entry) => [entry.elementId, entry]));
  const nodes = [...document.uml.classes, ...document.uml.enumerations].map((element): ElkNode => {
    const layout = layoutByElement.get(element.id);
    return {
      id: element.id,
      width: layout?.width ?? classifierDimensions(element).width,
      height: layout?.height ?? classifierDimensions(element).height,
    };
  });

  if (nodes.length === 0) {
    return [];
  }

  const graph: ElkNode = {
    id: "workspace-layout",
    children: nodes,
    edges: document.uml.relationships.map((relationship) => ({
      id: relationship.id,
      sources: [relationship.sourceId],
      targets: [relationship.targetId],
    })),
  };

  const result = await elk.layout(graph);
  return (result.children ?? []).map((node) => ({
    elementId: node.id,
    x: Math.round(node.x ?? 0),
    y: Math.round(node.y ?? 0),
  }));
}
