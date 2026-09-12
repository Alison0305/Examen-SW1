import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../providers";
import { WorkspaceClient } from "./workspace-client";
import { resetWorkspaceStore, useWorkspaceStore } from "./workspace-store";

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  const { createElement, Fragment } = await import("react");
  type FlowNode = { id: string; draggable?: boolean; position: { x: number; y: number }; selected?: boolean };
  type FlowProps = {
    nodes: FlowNode[];
    nodesDraggable?: boolean;
    onNodesChange: (changes: Array<{ id: string; type: "select"; selected: boolean } | { id: string; type: "position"; position: { x: number; y: number }; dragging: boolean }>) => void;
    onNodeDragStop: (event: unknown, node: FlowNode) => void;
  };

  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    ReactFlow: ({ nodes, nodesDraggable, onNodesChange, onNodeDragStop }: FlowProps) => createElement(
      "div",
      { "data-testid": "react-flow-probe", "data-nodes-draggable": String(nodesDraggable) },
      nodes.map((node) => createElement("div", {
        key: node.id,
        "data-testid": `react-flow-node-${node.id}`,
        "data-draggable": String(node.draggable),
        "data-position": `${node.position.x},${node.position.y}`,
        "data-selected": String(node.selected),
      })),
      createElement("button", { type: "button", onClick: () => onNodesChange([{ id: nodes[0].id, type: "select", selected: true }]) }, "Cambio selección"),
      createElement("button", { type: "button", onClick: () => onNodesChange([{ id: nodes[0].id, type: "position", position: { x: 420, y: 260 }, dragging: true }]) }, "Cambio posición"),
      createElement("button", { type: "button", onClick: () => onNodeDragStop({}, { ...nodes[0], position: { x: 420, y: 260 } }) }, "Fin arrastre"),
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useNodes: () => [],
    useReactFlow: () => ({ fitView: async () => undefined, setCenter: async () => undefined }),
  };
});

afterEach(() => resetWorkspaceStore());

function renderWorkspace(readOnly: boolean, onPersistentChange = vi.fn()) {
  act(() => { useWorkspaceStore.getState().createClass(); });
  const [umlClass] = useWorkspaceStore.getState().document.uml.classes;
  render(<AppProviders><WorkspaceClient readOnly={readOnly} onPersistentChange={onPersistentChange} /></AppProviders>);
  return { umlClass, onPersistentChange };
}

describe("WorkspaceContent readonly React Flow callbacks", () => {
  it("permite selección pero descarta posición y persistencia para VIEWER", () => {
    const { umlClass, onPersistentChange } = renderWorkspace(true);
    const node = screen.getByTestId(`react-flow-node-${umlClass.id}`);
    const documentBefore = structuredClone(useWorkspaceStore.getState().document);

    expect(screen.getByTestId("react-flow-probe")).toHaveAttribute("data-nodes-draggable", "false");
    expect(node).toHaveAttribute("data-draggable", "false");
    fireEvent.click(screen.getByRole("button", { name: "Cambio selección" }));
    expect(node).toHaveAttribute("data-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Cambio posición" }));
    fireEvent.click(screen.getByRole("button", { name: "Fin arrastre" }));
    expect(node).toHaveAttribute("data-position", "100,100");
    expect(useWorkspaceStore.getState().document).toEqual(documentBefore);
    expect(onPersistentChange).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "EDITOR", "legacy"])("permite posición y persistencia para %s editable", () => {
    const { umlClass, onPersistentChange } = renderWorkspace(false);
    const node = screen.getByTestId(`react-flow-node-${umlClass.id}`);

    expect(screen.getByTestId("react-flow-probe")).toHaveAttribute("data-nodes-draggable", "true");
    expect(node).toHaveAttribute("data-draggable", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cambio posición" }));
    expect(node).toHaveAttribute("data-position", "420,260");
    expect(useWorkspaceStore.getState().document.layout.elements[0]).toMatchObject({ x: 100, y: 100 });

    fireEvent.click(screen.getByRole("button", { name: "Fin arrastre" }));
    expect(useWorkspaceStore.getState().document.layout.elements[0]).toMatchObject({ x: 420, y: 260 });
    expect(onPersistentChange).toHaveBeenCalledOnce();
  });
});
