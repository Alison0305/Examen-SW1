import { describe, expect, it } from "vitest";
import { calculateDiamondGeometry, calculateUmlEdgeRoute, routeMultiplicityLabelPositions, routePath } from "./uml-edge-routing";

describe("routing UML de edges", () => {
  it("crea una ruta horizontal recta y conecta derecha con izquierda", () => {
    const route = calculateUmlEdgeRoute({ x: 0, y: 0, width: 180, height: 120 }, { x: 360, y: 0, width: 180, height: 120 });
    expect(route.points).toEqual([{ x: 180, y: 60 }, { x: 360, y: 60 }]);
    expect(routePath(route)).not.toContain("C");
  });

  it("crea rutas verticales y ortogonales deterministas", () => {
    const vertical = calculateUmlEdgeRoute({ x: 0, y: 0, width: 180, height: 120 }, { x: 0, y: 300, width: 180, height: 120 });
    const diagonal = calculateUmlEdgeRoute({ x: 0, y: 0, width: 180, height: 120 }, { x: 360, y: 260, width: 180, height: 120 });
    expect(vertical.points).toEqual([{ x: 90, y: 120 }, { x: 90, y: 300 }]);
    expect(diagonal.points).toHaveLength(4);
    expect(routeMultiplicityLabelPositions(vertical)).not.toEqual(routeMultiplicityLabelPositions(diagonal));
  });

  it.each([
    [{ x: 180, y: 60 }, { x: 360, y: 60 }],
    [{ x: 180, y: 60 }, { x: 0, y: 60 }],
    [{ x: 90, y: 120 }, { x: 90, y: 300 }],
    [{ x: 90, y: 120 }, { x: 90, y: 0 }],
  ])("calcula rombo fuera del nodo para %o", (endpoint, nextPoint) => {
    const geometry = calculateDiamondGeometry(endpoint, nextPoint);
    expect(geometry.points).toHaveLength(4);
    expect(geometry.points[0]).toEqual(endpoint);
    expect(geometry.lineStart).not.toEqual(endpoint);
  });
});
