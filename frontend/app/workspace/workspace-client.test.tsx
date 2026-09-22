import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { classReferenceType, createProjectDocument, enumerationReferenceType, type ProjectDocument } from "@examen-sw1/uml-core";
import { AppProviders } from "../providers";
import WorkspacePage from "./page";
import { applyVisualNodeChanges, relationshipLabel, toReactFlowEdges, toReactFlowNodes } from "./react-flow-adapters";
import { getMultiplicityLabelPositions, getUmlRelationshipMarkers, UmlRelationshipMultiplicityLabels } from "./uml-edge";
import { resetWorkspaceStore, setWorkspaceCollaborativeCommandListener, useWorkspaceStore } from "./workspace-store";
import { toCanvasCursorPosition, workspaceCanvasInteractionProps } from "./workspace-client";

function renderWorkspace() {
  return render(
    <AppProviders>
      <WorkspacePage />
    </AppProviders>,
  );
}

async function createClass(expectedName = "Clase1") {
  fireEvent.click(screen.getByRole("button", { name: "Clase" }));
  await screen.findByRole("button", { name: `Nodo clase ${expectedName}` });
}

async function createEnum(expectedName = "Estado1") {
  fireEvent.click(screen.getByRole("button", { name: "Enum" }));
  await screen.findByRole("button", { name: `Nodo enum ${expectedName}` });
}

async function clickNode(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
}

function changeSelect(label: string, value: string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}

async function createTwoClassesAndRelationship(type: "Association" | "Aggregation" | "Composition" | "Generalization") {
  await createClass("Clase1");
  await createClass("Clase2");
  fireEvent.click(screen.getByRole("button", { name: type }));
  await clickNode("Nodo clase Clase1");
  await clickNode("Nodo clase Clase2");
  await screen.findByRole("button", { name: new RegExp(`Relación ${type}`) });
}

function documentWithTypeReference(referenceType: "class" | "enumeration"): ProjectDocument {
  const ids = {
    document: "11111111-1111-4111-8111-111111111111",
    target: "22222222-2222-4222-8222-222222222222",
    owner: "33333333-3333-4333-8333-333333333333",
    attribute: "44444444-4444-4444-8444-444444444444",
  };
  const document = createProjectDocument({ id: ids.document, now: new Date("2026-09-07T00:00:00.000Z") });
  document.uml.classes.push({
    id: ids.owner,
    name: "Pedido",
    visibility: "public",
    attributes: [{
      id: ids.attribute,
      name: "referencia",
      visibility: "private",
      type: referenceType === "class" ? classReferenceType(ids.target) : enumerationReferenceType(ids.target),
    }],
    operations: [],
  });
  document.layout.elements.push({ elementId: ids.owner, x: 300, y: 100 });

  if (referenceType === "class") {
    document.uml.classes.push({ id: ids.target, name: "Cliente", visibility: "public", attributes: [], operations: [] });
  } else {
    document.uml.enumerations.push({ id: ids.target, name: "EstadoPedido", visibility: "public", literals: [] });
  }
  document.layout.elements.push({ elementId: ids.target, x: 100, y: 100 });
  return document;
}

describe("Workspace UML manual", () => {
  beforeEach(() => {
    resetWorkspaceStore();
  });

  it("proyecta una posición flow remota al canvas local con pan, zoom y offset de contenedor", () => {
    const flowToScreenPosition = ({ x, y }: { x: number; y: number }) => ({ x: x * 1.5 + 230, y: y * 1.5 + 160 });

    expect(toCanvasCursorPosition({ x: 100, y: 80 }, flowToScreenPosition, { left: 200, top: 100 })).toEqual({ x: 180, y: 180 });
  });

  it("renderiza /workspace con estructura principal, toolbox y controles básicos", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Proyecto UML local" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sidebar")).toBeInTheDocument();
    expect(screen.getByLabelText("Toolbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspector")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-canvas").querySelector(".react-flow")).not.toBeNull();
    expect(screen.getByText("Status Bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selección" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ajustar vista" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Fit view" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Toolbox").querySelector('[aria-label="Ajustar vista"]')).toBeNull();
    expect(screen.getByTestId("workspace-left-column")).toContainElement(screen.getByTestId("workspace-toolbox"));
    expect(screen.getByRole("toolbar", { name: "" })).toHaveAttribute("aria-orientation", "vertical");
    for (const tool of ["Selección", "Clase", "Enum", "Association", "Aggregation", "Composition", "Generalization", "Auto-layout"]) {
      expect(screen.getByRole("button", { name: tool }).querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "Auto-layout" })).toBeEnabled();
    expect(screen.getByText("Zoom y pan activos")).toBeInTheDocument();
  });

  it("renderiza paneles como drawers en pantallas pequeñas", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });

    renderWorkspace();

    expect(screen.getByRole("button", { name: "Abrir sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspector" })).toBeInTheDocument();

    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
  });

  it("crea clase y enum desde Toolbox y renderiza nodos custom", async () => {
    renderWorkspace();

    await createClass();
    await createEnum();

    expect(screen.getByRole("button", { name: "Nodo clase Clase1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nodo enum Estado1" })).toBeInTheDocument();
    expect(screen.getByText("Sin atributos")).toBeInTheDocument();
    expect(screen.getByText("<<enumeration>>")).toBeInTheDocument();
  });

  it("muestra Eliminar clase y la elimina mediante Command Bus con Undo", async () => {
    renderWorkspace();
    await createClass("Clase1");
    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;

    expect(screen.getByRole("button", { name: "Eliminar clase" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar clase" }));

    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
    expect(useWorkspaceStore.getState().document.layout.elements.some((entry) => entry.elementId === classId)).toBe(false);
    expect(useWorkspaceStore.getState().selection).toBeNull();
    expect(screen.queryByRole("button", { name: "Nodo clase Clase1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.uml.classes.map((umlClass) => umlClass.id)).toEqual([classId]);
    expect(useWorkspaceStore.getState().document.layout.elements.some((entry) => entry.elementId === classId)).toBe(true);
    expect(screen.getByRole("button", { name: "Nodo clase Clase1" })).toBeInTheDocument();
  });

  it("muestra Eliminar enum y lo elimina mediante Command Bus con Undo", async () => {
    renderWorkspace();
    await createEnum("Estado1");
    const enumerationId = useWorkspaceStore.getState().document.uml.enumerations[0].id;

    expect(screen.getByRole("button", { name: "Eliminar enum" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar enum" }));

    expect(useWorkspaceStore.getState().document.uml.enumerations).toEqual([]);
    expect(useWorkspaceStore.getState().document.layout.elements.some((entry) => entry.elementId === enumerationId)).toBe(false);
    expect(useWorkspaceStore.getState().selection).toBeNull();
    expect(screen.queryByRole("button", { name: "Nodo enum Estado1" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.uml.enumerations.map((enumeration) => enumeration.id)).toEqual([enumerationId]);
    expect(screen.getByRole("button", { name: "Nodo enum Estado1" })).toBeInTheDocument();
  });

  it("conserva clase y muestra diagnostics cuando DeleteClass tiene una referencia de tipo", () => {
    const document = documentWithTypeReference("class");
    resetWorkspaceStore(document);
    useWorkspaceStore.getState().selectElement("22222222-2222-4222-8222-222222222222");
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar clase" }));

    expect(useWorkspaceStore.getState().document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Pedido", "Cliente"]);
    expect(screen.getByText(/UML_UNKNOWN_TYPE_REFERENCE/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nodo clase Cliente" })).toBeInTheDocument();
  });

  it("conserva enum y muestra diagnostics cuando DeleteEnumeration tiene una referencia de tipo", () => {
    const document = documentWithTypeReference("enumeration");
    resetWorkspaceStore(document);
    useWorkspaceStore.getState().selectElement("22222222-2222-4222-8222-222222222222");
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar enum" }));

    expect(useWorkspaceStore.getState().document.uml.enumerations.map((enumeration) => enumeration.name)).toEqual(["EstadoPedido"]);
    expect(screen.getByText(/UML_UNKNOWN_TYPE_REFERENCE/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nodo enum EstadoPedido" })).toBeInTheDocument();
  });

  it("deshabilita auto-pan de node drag y conserva pan, zoom y Ajustar vista", () => {
    renderWorkspace();

    expect(workspaceCanvasInteractionProps).toEqual({ autoPanOnNodeDrag: false, panOnDrag: true, zoomOnScroll: true });
    expect(screen.getAllByRole("button", { name: "Ajustar vista" })).toHaveLength(1);
  });

  it("sincroniza selección de clase y enum con el Inspector", async () => {
    renderWorkspace();
    await createClass();
    await createEnum();

    await clickNode("Nodo clase Clase1");
    expect(screen.getByText("Clase Clase1")).toBeInTheDocument();

    await clickNode("Nodo enum Estado1");
    expect(screen.getByText("Enum Estado1")).toBeInTheDocument();
  });

  it("crea Association, Aggregation, Composition y Generalization mediante comandos", async () => {
    renderWorkspace();
    await createClass("Clase1");
    await createClass("Clase2");

    for (const type of ["Association", "Aggregation", "Composition", "Generalization"] as const) {
      fireEvent.click(screen.getByRole("button", { name: type }));
      await clickNode("Nodo clase Clase1");
      await clickNode("Nodo clase Clase2");
      expect(await screen.findByRole("button", { name: new RegExp(`Relación ${type}`) })).toBeInTheDocument();
    }

    expect(useWorkspaceStore.getState().document.uml.relationships.map((relationship) => relationship.type)).toEqual([
      "Association",
      "Aggregation",
      "Composition",
      "Generalization",
    ]);

    for (const relationship of useWorkspaceStore.getState().document.uml.relationships) {
      const markers = getUmlRelationshipMarkers(relationship.id, relationship.type);
      if (relationship.type === "Association") {
        expect(markers).toEqual({ markerStartId: undefined, markerEndId: undefined });
      }
      if (relationship.type === "Aggregation") {
        expect(markers.markerStartId).toContain("aggregation-diamond");
        expect(markers.markerEndId).toBeUndefined();
      }
      if (relationship.type === "Composition") {
        expect(markers.markerStartId).toContain("composition-diamond");
        expect(markers.markerEndId).toBeUndefined();
      }
      if (relationship.type === "Generalization") {
        expect(markers.markerStartId).toBeUndefined();
        expect(markers.markerEndId).toContain("generalization-triangle");
      }
    }
  });

  it("selecciona y elimina una relación sin borrar edges directamente", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "tiene" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));

    fireEvent.click(screen.getByRole("button", { name: /Relación tiene/ }));
    expect(screen.getByRole("heading", { name: "Relación Association" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar relación" }));

    expect(screen.queryByRole("button", { name: /Relación tiene/ })).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.relationships).toEqual([]);
  });

  it("guarda, normaliza y cambia el nombre de una Association mediante Command Bus", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");

    expect(screen.getByLabelText("Nombre de relación")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "  tiene  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("tiene");
    expect(relationshipLabel(useWorkspaceStore.getState().document.uml.relationships[0])).toBe("tiene");
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0]?.data?.label).toBe("tiene");

    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "ejecuta" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("ejecuta");

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("tiene");
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("ejecuta");
  });

  it("permite limpiar el nombre de una relación sin afectar multiplicidades", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");
    fireEvent.click(screen.getByRole("button", { name: /Relación Association/ }));
    fireEvent.change(screen.getByLabelText("Multiplicidad origen"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad origen" }));
    fireEvent.change(screen.getByLabelText("Multiplicidad destino"), { target: { value: "0..*" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad destino" }));
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "contiene" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));

    const relationship = useWorkspaceStore.getState().document.uml.relationships[0];
    expect(relationship).not.toHaveProperty("name");
    expect(relationship.sourceMultiplicity).toEqual({ lower: 1, upper: 1 });
    expect(relationship.targetMultiplicity).toEqual({ lower: 0, upper: "unbounded" });
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0]?.data?.label).toBe("");
  });

  it("permite nombres para Aggregation y Composition, pero no ofrece editor para Generalization", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Aggregation");
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "contiene" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0]).toMatchObject({ type: "Aggregation", name: "contiene" });

    fireEvent.click(screen.getByRole("button", { name: "Composition" }));
    await clickNode("Nodo clase Clase1");
    await clickNode("Nodo clase Clase2");
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "pertenece" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[1]).toMatchObject({ type: "Composition", name: "pertenece" });

    fireEvent.click(screen.getByRole("button", { name: "Generalization" }));
    await clickNode("Nodo clase Clase1");
    await clickNode("Nodo clase Clase2");
    expect(screen.queryByLabelText("Nombre de relación")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar nombre" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Multiplicidad origen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Multiplicidad destino")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar multiplicidad origen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar multiplicidad destino" })).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.relationships[2]).toMatchObject({ type: "Generalization" });
    expect(useWorkspaceStore.getState().document.uml.relationships[2]?.sourceMultiplicity).toBeUndefined();
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[2]?.data?.label).toBe("");
  });

  it("conserva el nombre de relación tras MoveElement y auto-layout", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");
    fireEvent.change(screen.getByLabelText("Nombre de relación"), { target: { value: "tiene" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    const [source] = useWorkspaceStore.getState().document.uml.classes;

    act(() => {
      useWorkspaceStore.getState().moveElement(source.id, 420, 200);
    });
    await act(async () => {
      await useWorkspaceStore.getState().applyAutoLayout();
    });
    expect(useWorkspaceStore.getState().document.uml.relationships[0].name).toBe("tiene");
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0]?.data?.label).toBe("tiene");
  });

  it("confirma drag como un solo MoveElement tras movimientos visuales intermedios", async () => {
    renderWorkspace();
    await createClass();
    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;
    const semanticBefore = structuredClone(useWorkspaceStore.getState().document.uml);
    const layoutBefore = structuredClone(useWorkspaceStore.getState().document.layout.elements[0]);
    let visualNodes = toReactFlowNodes(useWorkspaceStore.getState().document, classId);

    visualNodes = applyVisualNodeChanges(visualNodes, [{ id: classId, type: "position", position: { x: 240, y: 180 }, dragging: true }]);
    visualNodes = applyVisualNodeChanges(visualNodes, [{ id: classId, type: "position", position: { x: 360, y: 220 }, dragging: true }]);

    expect(visualNodes[0].position).toEqual({ x: 360, y: 220 });
    expect(useWorkspaceStore.getState().document.layout.elements[0]).toEqual(layoutBefore);
    expect(useWorkspaceStore.getState().document.uml).toEqual(semanticBefore);

    let result: ReturnType<ReturnType<typeof useWorkspaceStore.getState>["moveElement"]> | undefined;
    act(() => {
      result = useWorkspaceStore.getState().moveElement(classId, visualNodes[0].position.x, visualNodes[0].position.y);
    });

    expect(result?.success).toBe(true);
    expect(useWorkspaceStore.getState().document.uml).toEqual(semanticBefore);
    expect(useWorkspaceStore.getState().document.layout.elements[0]).toMatchObject({ elementId: classId, x: 360, y: 220 });

    act(() => {
      useWorkspaceStore.getState().undo();
    });
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(1);
    expect(useWorkspaceStore.getState().document.layout.elements[0]).toEqual(layoutBefore);

    act(() => {
      useWorkspaceStore.getState().undo();
    });
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
  });

  it("ejecuta Ajustar vista como acción de viewport sin mutar UML", async () => {
    renderWorkspace();
    const semanticBefore = structuredClone(useWorkspaceStore.getState().document.uml);

    fireEvent.click(screen.getByRole("button", { name: "Ajustar vista" }));

    await waitFor(() => expect(screen.getByText("Ajustar vista ejecutado 1 veces")).toBeInTheDocument());
    expect(useWorkspaceStore.getState().document.uml).toEqual(semanticBefore);
  });

  it("ejecuta auto-layout como una sola operación undoable sin mutar CanonicalUmlModel", async () => {
    renderWorkspace();
    await createClass("Clase1");
    await createClass("Clase2");
    const semanticBefore = structuredClone(useWorkspaceStore.getState().document.uml);
    const layoutBefore = structuredClone(useWorkspaceStore.getState().document.layout.elements);

    fireEvent.click(screen.getByRole("button", { name: "Auto-layout" }));

    await waitFor(() => expect(screen.getByText("Auto-layout ejecutado 1 veces")).toBeInTheDocument());
    const layoutAfter = structuredClone(useWorkspaceStore.getState().document.layout.elements);
    expect(useWorkspaceStore.getState().document.uml).toEqual(semanticBefore);
    expect(layoutAfter).not.toEqual(layoutBefore);

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.layout.elements).toEqual(layoutBefore);
    expect(useWorkspaceStore.getState().document.uml).toEqual(semanticBefore);

    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(useWorkspaceStore.getState().document.layout.elements).toEqual(layoutAfter);
    expect(useWorkspaceStore.getState().document.uml).toEqual(semanticBefore);
  });

  it("crea, edita, elimina y deshace atributos desde la lista compacta", async () => {
    renderWorkspace();
    await createClass();

    fireEvent.change(screen.getByLabelText("Nombre de clase"), { target: { value: "Cliente" } });
    changeSelect("Visibilidad de clase", "private");
    fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
    expect(await screen.findByRole("button", { name: "Nodo clase Cliente" })).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes[0]).toMatchObject({ name: "Cliente", visibility: "private" });

    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getAllByText("- id: integer").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "codigo" } });
    changeSelect("Visibilidad de atributo", "public");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByText("+ codigo: integer")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes[0]).toMatchObject({ name: "codigo", visibility: "public" });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.queryByText("+ codigo: integer")).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().selection?.kind).toBe("class");

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByText("+ codigo: integer")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes[0].name).toBe("codigo");
  });

  it("muestra formulario de creación bajo demanda y Cancelar no modifica el modelo", async () => {
    renderWorkspace();
    await createClass();

    expect(screen.getByRole("button", { name: "Agregar atributo" })).toBeInTheDocument();
    expect(screen.queryByText("Nuevo atributo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));

    expect(screen.getByText("Nuevo atributo")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de atributo")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tipo de atributo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Visibilidad de atributo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Multiplicidad de atributo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText("Nuevo atributo")).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes).toEqual([]);
  });

  it("muestra filas compactas para varios atributos y cierra borradores al cambiar de clase", async () => {
    renderWorkspace();
    await createClass("Clase1");
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "nombre" } });
    changeSelect("Tipo de atributo", "string");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByTestId("attribute-list").querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByText("id: integer")).toBeInTheDocument();
    expect(screen.getByText("nombre: string")).toBeInTheDocument();
    expect(screen.queryByText("Nuevo atributo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "borrador" } });
    await createClass("Clase2");

    expect(screen.getByText("Clase Clase2")).toBeInTheDocument();
    expect(screen.queryByText("Nuevo atributo")).not.toBeInTheDocument();
    expect(screen.getByTestId("attribute-list").querySelectorAll("button")).toHaveLength(0);
  });

  it("conserva el draft y muestra diagnostics cuando AddAttribute es inválido", async () => {
    renderWorkspace();
    await createClass();
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Nuevo atributo")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de atributo")).toHaveValue("");
    expect(screen.getByText(/UML_REQUIRED_NAME/)).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes).toEqual([]);
  });

  it("precarga, cancela, actualiza y conserva el draft inválido de edición", async () => {
    renderWorkspace();
    await createClass();
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Nombre de atributo")).toHaveValue("id");
    expect(screen.getByRole("combobox", { name: "Tipo de atributo" })).toHaveTextContent("integer");
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "cancelado" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes[0].name).toBe("id");

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "edad" } });
    changeSelect("Tipo de atributo", "number");
    changeSelect("Visibilidad de atributo", "protected");
    fireEvent.change(screen.getByLabelText("Multiplicidad de atributo"), { target: { value: "0..*" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes[0]).toMatchObject({
      name: "edad",
      type: { kind: "primitive", name: "number" },
      visibility: "protected",
      multiplicity: { lower: 0, upper: "unbounded" },
    });
    expect(screen.getByText("edad: number")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByText("Editar atributo edad")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de atributo")).toHaveValue("");
    expect(screen.getByText(/UML_REQUIRED_NAME/)).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes[0].attributes[0].name).toBe("edad");
  });

  it("edita enum y agrega/elimina literales desde Inspector", async () => {
    renderWorkspace();
    await createEnum();

    fireEvent.change(screen.getByLabelText("Nombre de enum"), { target: { value: "EstadoPedido" } });
    changeSelect("Visibilidad de enum", "protected");
    fireEvent.click(screen.getByRole("button", { name: "Guardar enum" }));
    expect(await screen.findByRole("button", { name: "Nodo enum EstadoPedido" })).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.enumerations[0]).toMatchObject({ name: "EstadoPedido", visibility: "protected" });

    fireEvent.click(screen.getByRole("button", { name: "Agregar literal" }));
    expect(screen.getAllByText("PENDIENTE").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Literal de enum"), { target: { value: "PAGADO" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar literal" }));
    expect(screen.getAllByText("PAGADO").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar literal PENDIENTE" }));
    expect(screen.queryByText("PENDIENTE")).not.toBeInTheDocument();
  });

  it("muestra botones compactos y accesibles para literales largos", async () => {
    renderWorkspace();
    await createEnum();
    const literal = "ESTADO_DE_PROCESAMIENTO_MUY_LARGO";

    fireEvent.change(screen.getByLabelText("Literal de enum"), { target: { value: literal } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar literal" }));

    const removeButton = screen.getByRole("button", { name: `Eliminar literal ${literal}` });
    expect(removeButton).toHaveTextContent("Eliminar");
    expect(removeButton).not.toHaveTextContent(literal);
    expect(screen.getAllByText(literal).length).toBeGreaterThan(0);
    fireEvent.click(removeButton);
    expect(useWorkspaceStore.getState().document.uml.enumerations[0].literals).not.toContain(literal);
  });

  it("deriva la visibilidad UML de clases directamente del modelo", async () => {
    renderWorkspace();
    await createClass();
    const node = screen.getByTestId("uml-node-Clase1");

    expect(node).toHaveTextContent("+ Clase1");
    for (const [visibility, symbol] of [["private", "-"], ["protected", "#"], ["package", "~"]] as const) {
      changeSelect("Visibilidad de clase", visibility);
      fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
      expect(useWorkspaceStore.getState().document.uml.classes[0].visibility).toBe(visibility);
      expect(node).toHaveTextContent(`${symbol} Clase1`);
    }
  });

  it("deriva la visibilidad UML de enums directamente del modelo", async () => {
    renderWorkspace();
    await createEnum();
    const node = screen.getByTestId("uml-node-Estado1");

    expect(node).toHaveTextContent("+ Estado1");
    for (const [visibility, symbol] of [["private", "-"], ["protected", "#"], ["package", "~"]] as const) {
      changeSelect("Visibilidad de enum", visibility);
      fireEvent.click(screen.getByRole("button", { name: "Guardar enum" }));
      expect(useWorkspaceStore.getState().document.uml.enumerations[0].visibility).toBe(visibility);
      expect(node).toHaveTextContent(`${symbol} Estado1`);
    }
  });

  it("actualiza multiplicidades de relación con la estructura del modelo", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");
    fireEvent.click(screen.getByRole("button", { name: /Relación Association/ }));

    fireEvent.change(screen.getByLabelText("Multiplicidad origen"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad origen" }));
    fireEvent.change(screen.getByLabelText("Multiplicidad destino"), { target: { value: "0..*" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad destino" }));

    expect(useWorkspaceStore.getState().document.uml.relationships[0].sourceMultiplicity).toEqual({ lower: 1, upper: 1 });
    expect(useWorkspaceStore.getState().document.uml.relationships[0].targetMultiplicity).toEqual({ lower: 0, upper: "unbounded" });
    expect(screen.getByRole("button", { name: "Relación Association" })).toBeInTheDocument();
    expect(screen.queryByText("Association 1..0..*")).not.toBeInTheDocument();

    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0].data).toMatchObject({
      label: "",
      sourceMultiplicityLabel: "1",
      targetMultiplicityLabel: "0..*",
    });
  });

  it("conserva el draft de destino al guardar primero la multiplicidad de origen", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");
    fireEvent.click(screen.getByRole("button", { name: /Relación Association/ }));

    fireEvent.change(screen.getByLabelText("Multiplicidad origen"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Multiplicidad destino"), { target: { value: "0..*" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad origen" }));

    expect(screen.getByLabelText("Multiplicidad origen")).toHaveValue("1");
    expect(screen.getByLabelText("Multiplicidad destino")).toHaveValue("0..*");
    expect(useWorkspaceStore.getState().document.uml.relationships[0].sourceMultiplicity).toEqual({ lower: 1, upper: 1 });
    expect(useWorkspaceStore.getState().document.uml.relationships[0].targetMultiplicity).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad destino" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0]).toMatchObject({
      sourceMultiplicity: { lower: 1, upper: 1 },
      targetMultiplicity: { lower: 0, upper: "unbounded" },
    });
  });

  it("conserva el draft de origen al guardar primero la multiplicidad de destino", async () => {
    renderWorkspace();
    await createTwoClassesAndRelationship("Association");
    fireEvent.click(screen.getByRole("button", { name: /Relación Association/ }));

    fireEvent.change(screen.getByLabelText("Multiplicidad origen"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Multiplicidad destino"), { target: { value: "0..*" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad destino" }));

    expect(screen.getByLabelText("Multiplicidad origen")).toHaveValue("1");
    expect(screen.getByLabelText("Multiplicidad destino")).toHaveValue("0..*");
    expect(useWorkspaceStore.getState().document.uml.relationships[0].sourceMultiplicity).toBeUndefined();
    expect(useWorkspaceStore.getState().document.uml.relationships[0].targetMultiplicity).toEqual({ lower: 0, upper: "unbounded" });

    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad origen" }));
    expect(useWorkspaceStore.getState().document.uml.relationships[0]).toMatchObject({
      sourceMultiplicity: { lower: 1, upper: 1 },
      targetMultiplicity: { lower: 0, upper: "unbounded" },
    });
  });

  it("renderiza multiplicidades independientes de Association y las conserva tras MoveElement, ApplyLayout y Undo/Redo", async () => {
    renderWorkspace();
    await createClass("Clase1");
    fireEvent.change(screen.getByLabelText("Nombre de clase"), { target: { value: "Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
    await screen.findByRole("button", { name: "Nodo clase Cliente" });

    await createClass("Clase2");
    fireEvent.change(screen.getByLabelText("Nombre de clase"), { target: { value: "Pedido" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
    await screen.findByRole("button", { name: "Nodo clase Pedido" });

    fireEvent.click(screen.getByRole("button", { name: "Association" }));
    await clickNode("Nodo clase Cliente");
    await clickNode("Nodo clase Pedido");
    fireEvent.click(await screen.findByRole("button", { name: /Relación Association/ }));

    fireEvent.change(screen.getByLabelText("Multiplicidad origen"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad origen" }));
    fireEvent.change(screen.getByLabelText("Multiplicidad destino"), { target: { value: "0..*" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar multiplicidad destino" }));

    const relationship = useWorkspaceStore.getState().document.uml.relationships[0];
    const cliente = useWorkspaceStore.getState().document.uml.classes.find((umlClass) => umlClass.name === "Cliente");
    expect(relationship.sourceMultiplicity).toEqual({ lower: 1, upper: 1 });
    expect(relationship.targetMultiplicity).toEqual({ lower: 0, upper: "unbounded" });

    const edgeData = toReactFlowEdges(useWorkspaceStore.getState().document)[0].data;
    expect(edgeData).toMatchObject({
      label: "",
      sourceMultiplicityLabel: "1",
      targetMultiplicityLabel: "0..*",
    });
    expect(screen.queryByText("Association 1..0..*")).not.toBeInTheDocument();

    const positions = getMultiplicityLabelPositions({ sourceX: 100, sourceY: 120, targetX: 360, targetY: 120 });
    expect(positions.source.x).toBeLessThan(positions.target.x);
    expect(positions.source.y).toBeGreaterThan(120);
    expect(positions.target.y).toBeLessThan(120);

    render(
      <AppProviders>
        <UmlRelationshipMultiplicityLabels
          edgeId={relationship.id}
          positions={positions}
          sourceMultiplicityLabel={edgeData?.sourceMultiplicityLabel ?? ""}
          targetMultiplicityLabel={edgeData?.targetMultiplicityLabel ?? ""}
        />
      </AppProviders>,
    );
    expect(screen.getByTestId(`uml-edge-${relationship.id}-source-multiplicity`)).toHaveTextContent("1");
    expect(screen.getByTestId(`uml-edge-${relationship.id}-target-multiplicity`)).toHaveTextContent("0..*");

    act(() => {
      useWorkspaceStore.getState().moveElement(cliente?.id ?? "", 420, 200);
    });
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0].data).toMatchObject({
      sourceMultiplicityLabel: "1",
      targetMultiplicityLabel: "0..*",
    });

    await act(async () => {
      await useWorkspaceStore.getState().applyAutoLayout();
    });
    const layoutAfterAutoLayout = structuredClone(useWorkspaceStore.getState().document.layout.elements);
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0].data).toMatchObject({
      sourceMultiplicityLabel: "1",
      targetMultiplicityLabel: "0..*",
    });

    act(() => {
      useWorkspaceStore.getState().undo();
    });
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0].data).toMatchObject({
      sourceMultiplicityLabel: "1",
      targetMultiplicityLabel: "0..*",
    });

    act(() => {
      useWorkspaceStore.getState().redo();
    });
    expect(useWorkspaceStore.getState().document.layout.elements).toEqual(layoutAfterAutoLayout);
    expect(toReactFlowEdges(useWorkspaceStore.getState().document)[0].data).toMatchObject({
      sourceMultiplicityLabel: "1",
      targetMultiplicityLabel: "0..*",
    });
  });

  it("muestra CommandResult rechazado y permite navegar a diagnóstico con elementId", async () => {
    renderWorkspace();
    await createClass();

    fireEvent.change(screen.getByLabelText("Nombre de clase"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));

    expect(screen.getByText(/UML_REQUIRED_NAME/)).toBeInTheDocument();
    expect(screen.getByText(/Path: classes\[0\]\.name/)).toBeInTheDocument();
    expect(screen.getByText("Errores 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir" }));

    expect(screen.getByText("Clase Clase1")).toBeInTheDocument();
    expect(screen.getByText(/Elemento enfocado/)).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes.map((umlClass) => umlClass.name)).toEqual(["Clase1"]);
  });

  it("muestra diagnóstico sin elemento visual navegable sin modificar documento", async () => {
    renderWorkspace();
    await createClass();
    fireEvent.click(screen.getByRole("button", { name: "Agregar atributo" }));
    const snapshot = structuredClone(useWorkspaceStore.getState().document);

    fireEvent.change(screen.getByLabelText("Nombre de atributo"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText(/UML_REQUIRED_NAME/)).toBeInTheDocument();
    expect(screen.getByText(/Path: classes\[0\]\.attributes\[0\]\.name/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ir" })).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(snapshot);
  });

  it("muestra Deshacer/Rehacer como iconos accesibles y conserva su historial", async () => {
    renderWorkspace();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deshacer" })).toHaveTextContent("↶");
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toHaveTextContent("↷");
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redo" })).not.toBeInTheDocument();

    await createClass();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByRole("button", { name: "Nodo clase Clase1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(await screen.findByRole("button", { name: "Nodo clase Clase1" })).toBeInTheDocument();
  });

  it("muestra el ID semántico de una clase seleccionada como solo lectura", async () => {
    renderWorkspace();
    await createClass();
    fireEvent.click(screen.getByRole("button", { name: "Nodo clase Clase1" }));
    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;
    const idInput = screen.getByLabelText("ID de clase") as HTMLInputElement;
    expect(idInput.value).toBe(classId);
    expect(idInput.readOnly).toBe(true);
  });

  it("muestra una propuesta textual válida para revisión sin aplicarla", () => {
    renderWorkspace();
    const input = screen.getByLabelText("Instrucción UML");

    fireEvent.change(input, { target: { value: 'CREATE_CLASS name="ClaseSmoke"' } });
    fireEvent.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(screen.getByText("Propuesta: Crear clase ClaseSmoke")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
  });

  it("mantiene el transcript en el mismo pipeline revisable y bloquea texto vacío", () => {
    renderWorkspace();
    const input = screen.getByLabelText("Instrucción UML");
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'CREATE_CLASS name="Paciente"' } });
    fireEvent.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(screen.getByText("Propuesta: Crear clase Paciente")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
  });

  it("aprueba una propuesta textual mediante Command Bus y conserva Undo/Redo", async () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Instrucción UML"), { target: { value: 'CREATE_CLASS name="ClasePropuesta"' } });
    fireEvent.click(screen.getByRole("button", { name: "Interpretar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));

    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;
    expect(useWorkspaceStore.getState().document.uml.classes).toMatchObject([{ id: classId, name: "ClasePropuesta" }]);
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toMatchObject([{ id: classId, name: "ClasePropuesta" }]);
  });

  it("rechaza una propuesta textual inválida sin mutar documento ni layout", () => {
    renderWorkspace();
    const before = structuredClone(useWorkspaceStore.getState().document);

    fireEvent.change(screen.getByLabelText("Instrucción UML"), { target: { value: "DROP TABLE classes;" } });
    fireEvent.click(screen.getByRole("button", { name: "Interpretar" }));

    expect(screen.getByText(/Propuesta inválida/)).toBeInTheDocument();
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });

  it("requiere una segunda confirmación antes de eliminar una clase propuesta", async () => {
    renderWorkspace();
    await createClass("Clase1");
    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;
    const input = screen.getByLabelText("Instrucción UML");

    fireEvent.change(input, { target: { value: `DELETE_CLASS targetId="${classId}"` } });
    fireEvent.click(screen.getByRole("button", { name: "Interpretar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(screen.getByRole("heading", { name: "Confirmar eliminación de clase" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Interpretar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useWorkspaceStore.getState().document.uml.classes.map((umlClass) => umlClass.id)).toEqual([classId]);
  });

  it("confirma por ACK un renombrado, ignora su eco y emite Undo/Redo colaborativos", async () => {
    renderWorkspace();
    await createClass();
    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;
    const operations: Array<{ command: Parameters<ReturnType<typeof useWorkspaceStore.getState>["applyAuthoritativeCommand"]>[0]; preimage: ProjectDocument }> = [];
    act(() => setWorkspaceCollaborativeCommandListener((command, preimage) => operations.push({ command, preimage })));

    fireEvent.change(screen.getByLabelText("Nombre de clase"), { target: { value: "Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clase" }));
    expect(useWorkspaceStore.getState().document.uml.classes[0].name).toBe("Clase1");
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();

    act(() => useWorkspaceStore.getState().applyAuthoritativeCommand(operations[0].command, true, operations[0].preimage));
    expect(useWorkspaceStore.getState().document.uml.classes[0]).toMatchObject({ id: classId, name: "Cliente" });
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();
    // The page's operation id ledger drops the Socket.IO echo after this ACK.
    expect(operations).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(operations[1].command).toEqual({ type: "RenameClass", classId, name: "Clase1" });
    act(() => useWorkspaceStore.getState().applyAuthoritativeCommand(operations[1].command, true, operations[1].preimage));
    expect(useWorkspaceStore.getState().document.uml.classes[0].name).toBe("Clase1");
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(operations[2].command).toEqual({ type: "RenameClass", classId, name: "Cliente" });
    act(() => useWorkspaceStore.getState().applyAuthoritativeCommand(operations[2].command, true, operations[2].preimage));
    expect(useWorkspaceStore.getState().document.uml.classes[0].name).toBe("Cliente");
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();

    act(() => useWorkspaceStore.getState().applyAuthoritativeCommand({ type: "UpdateClassVisibility", classId, visibility: "private" }));
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeDisabled();
  });

  it("conserva el snapshot de una eliminación colaborativa hasta que ACK confirma Undo", async () => {
    renderWorkspace();
    await createClass();
    const classId = useWorkspaceStore.getState().document.uml.classes[0].id;
    const operations: Array<{ command: Parameters<ReturnType<typeof useWorkspaceStore.getState>["applyAuthoritativeCommand"]>[0]; preimage: ProjectDocument }> = [];
    act(() => setWorkspaceCollaborativeCommandListener((command, preimage) => operations.push({ command, preimage })));

    fireEvent.click(screen.getByRole("button", { name: "Eliminar clase" }));
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(1);
    act(() => useWorkspaceStore.getState().applyAuthoritativeCommand(operations[0].command, true, operations[0].preimage));
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(operations[1].command.type).toBe("RestoreDeletionSnapshot");
    act(() => useWorkspaceStore.getState().applyAuthoritativeCommand(operations[1].command, true, operations[1].preimage));
    expect(useWorkspaceStore.getState().document.uml.classes.map((umlClass) => umlClass.id)).toEqual([classId]);
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();
  });
});
