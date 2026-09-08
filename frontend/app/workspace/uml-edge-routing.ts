export type UmlEdgeSide = "left" | "right" | "top" | "bottom";

export interface UmlNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UmlEdgeRoute {
  points: Array<{ x: number; y: number }>;
  sourceSide: UmlEdgeSide;
  targetSide: UmlEdgeSide;
}

export interface DiamondGeometry {
  points: Array<{ x: number; y: number }>;
  lineStart: { x: number; y: number };
}

export function calculateDiamondGeometry(endpoint: { x: number; y: number }, nextPoint: { x: number; y: number }, size = 15): DiamondGeometry {
  const length = Math.hypot(nextPoint.x - endpoint.x, nextPoint.y - endpoint.y) || 1;
  const unitX = (nextPoint.x - endpoint.x) / length;
  const unitY = (nextPoint.y - endpoint.y) / length;
  const lineStart = { x: endpoint.x + unitX * size, y: endpoint.y + unitY * size };
  const halfHeight = size / 2;
  return {
    points: [
      endpoint,
      { x: endpoint.x + unitX * (size / 2) - unitY * halfHeight, y: endpoint.y + unitY * (size / 2) + unitX * halfHeight },
      lineStart,
      { x: endpoint.x + unitX * (size / 2) + unitY * halfHeight, y: endpoint.y + unitY * (size / 2) - unitX * halfHeight },
    ],
    lineStart,
  };
}

export function calculateUmlEdgeRoute(source: UmlNodeBounds, target: UmlNodeBounds): UmlEdgeRoute {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const horizontal = Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);
  const sourceSide = horizontal ? (targetCenter.x >= sourceCenter.x ? "right" : "left") : (targetCenter.y >= sourceCenter.y ? "bottom" : "top");
  const targetSide = opposite(sourceSide);
  const start = edgePoint(source, sourceSide);
  const end = edgePoint(target, targetSide);

  if ((horizontal && start.y === end.y) || (!horizontal && start.x === end.x)) {
    return { points: [start, end], sourceSide, targetSide };
  }

  if (horizontal) {
    const middleX = (start.x + end.x) / 2;
    return { points: [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end], sourceSide, targetSide };
  }

  const middleY = (start.y + end.y) / 2;
  return { points: [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end], sourceSide, targetSide };
}

export function routePath(route: UmlEdgeRoute): string {
  return route.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function routeLabelPosition(route: UmlEdgeRoute): { x: number; y: number } {
  const middle = route.points[Math.floor(route.points.length / 2)] ?? route.points[0];
  return middle;
}

export function routeMultiplicityLabelPositions(route: UmlEdgeRoute): { source: { x: number; y: number }; target: { x: number; y: number } } {
  return {
    source: offsetFromEndpoint(route.points[0], route.points[1] ?? route.points[0]),
    target: offsetFromEndpoint(route.points.at(-1) ?? route.points[0], route.points.at(-2) ?? route.points[0]),
  };
}

function offsetFromEndpoint(endpoint: { x: number; y: number }, adjacent: { x: number; y: number }): { x: number; y: number } {
  const directionX = Math.sign(adjacent.x - endpoint.x);
  const directionY = Math.sign(adjacent.y - endpoint.y);
  const distance = 28;
  const perpendicular = 16;
  return {
    x: endpoint.x + directionX * distance - directionY * perpendicular,
    y: endpoint.y + directionY * distance + directionX * perpendicular,
  };
}

function center(bounds: UmlNodeBounds): { x: number; y: number } {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function edgePoint(bounds: UmlNodeBounds, side: UmlEdgeSide): { x: number; y: number } {
  const point = center(bounds);
  if (side === "left") point.x = bounds.x;
  if (side === "right") point.x = bounds.x + bounds.width;
  if (side === "top") point.y = bounds.y;
  if (side === "bottom") point.y = bounds.y + bounds.height;
  return point;
}

function opposite(side: UmlEdgeSide): UmlEdgeSide {
  return side === "left" ? "right" : side === "right" ? "left" : side === "top" ? "bottom" : "top";
}
