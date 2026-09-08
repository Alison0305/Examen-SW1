import { fireEvent, render, screen } from "@testing-library/react";
import { createProjectDocument, type ProjectDocument, type UmlRelationshipType } from "@examen-sw1/uml-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateUmlEdgeRoute } from "./uml-edge-routing";
import { UmlRelationshipEdge } from "./uml-edge";
import { resetWorkspaceStore, useWorkspaceStore } from "./workspace-store";
import type { ReactNode } from "react";
import type { EdgeProps } from "@xyflow/react";
import type { UmlReactFlowEdge } from "./react-flow-adapters";

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <>{children}</> };
});

const ids = { source: "11111111-1111-4111-8111-111111111111", target: "22222222-2222-4222-8222-222222222222", relationship: "33333333-3333-4333-8333-333333333333" };

function documentWithRelationship(type: UmlRelationshipType, name?: string): ProjectDocument {
  const document = createProjectDocument({ id: "44444444-4444-4444-8444-444444444444", now: new Date("2026-09-08T00:00:00.000Z") });
  document.uml.classes.push({ id: ids.source, name: "Clase1", visibility: "public", attributes: [], operations: [] }, { id: ids.target, name: "Clase2", visibility: "public", attributes: [], operations: [] });
  document.uml.relationships.push({ id: ids.relationship, type, sourceId: ids.source, targetId: ids.target, ...(name ? { name } : {}) });
  return document;
}

function renderEdge(type: UmlRelationshipType, name?: string) {
  resetWorkspaceStore(documentWithRelationship(type, name));
  return render(<EdgeHarness type={type} />);
}

function EdgeHarness({ type }: { type: UmlRelationshipType }) {
  const document = useWorkspaceStore((state) => state.document);
  const relationship = document.uml.relationships[0];
  const route = calculateUmlEdgeRoute({ x: 0, y: 0, width: 180, height: 120 }, { x: 360, y: 0, width: 180, height: 120 });
  const props = { id: ids.relationship, sourceX: 180, sourceY: 60, targetX: 360, targetY: 60, selected: false, data: { relationshipType: type, label: relationship?.name ?? "", sourceMultiplicityLabel: "", targetMultiplicityLabel: "", selected: false, route } } as EdgeProps<UmlReactFlowEdge>;
  return <UmlRelationshipEdge {...props} />;
}

function openEditor() {
  fireEvent.doubleClick(screen.getByTestId(`uml-edge-path-${ids.relationship}`));
  return screen.getByRole("textbox", { name: "Editar nombre de relación" });
}

describe("UmlRelationshipEdge", () => {
  beforeEach(() => resetWorkspaceStore());

  it.each(["Association", "Aggregation", "Composition"] as const)("abre y guarda %s inline", (type) => {
    renderEdge(type);
    if (type === "Aggregation") expect(screen.getByTestId(`uml-aggregation-diamond-${ids.relationship}`)).toHaveAttribute("fill", "white");
    if (type === "Composition") expect(screen.getByTestId(`uml-composition-diamond-${ids.relationship}`)).toHaveAttribute("fill", "#111827");
    const input = openEditor();
    fireEvent.change(input, { target: { value: "  tiene  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("tiene");
    expect(screen.queryByTestId(`uml-edge-name-editor-${ids.relationship}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`uml-edge-${ids.relationship}`)).toHaveTextContent("tiene");
  });

  it("mantiene Generalization sin editor ni label", () => {
    renderEdge("Generalization");
    fireEvent.doubleClick(screen.getByTestId(`uml-edge-path-${ids.relationship}`));
    expect(screen.queryByTestId(`uml-edge-name-editor-${ids.relationship}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`uml-edge-${ids.relationship}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`uml-marker-${ids.relationship}-generalization`)).toBeInTheDocument();
  });

  it("cancela Escape, guarda blur una vez, limpia el nombre y permite Undo/Redo", () => {
    renderEdge("Association", "tiene");
    let input = openEditor();
    fireEvent.change(input, { target: { value: "ejecuta" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("tiene");
    input = openEditor();
    fireEvent.change(input, { target: { value: "posee" } });
    fireEvent.blur(input);
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("posee");
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("tiene");
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("posee");
    input = openEditor();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(useWorkspaceStore.getState().document.uml.relationships[0]).not.toHaveProperty("name");
    expect(screen.queryByTestId(`uml-edge-${ids.relationship}`)).not.toBeInTheDocument();
  });
});
