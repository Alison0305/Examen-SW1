import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDetailFixture, currentWorkspaceDocument, resetPersistedWorkspaceTest } from "./persisted-workspace-test-harness";
import { setWorkspacePersistentChangeListener, setWorkspaceReadOnly, useWorkspaceStore } from "./workspace-store";
import { toReactFlowEdges, toReactFlowNodes } from "./react-flow-adapters";
import { createProjectDocument } from "@examen-sw1/uml-core";

afterEach(() => resetPersistedWorkspaceTest());

describe("harness de workspace persistido", () => {
  it("hidrata una association class persistida sin regenerar IDs ni duplicarla", () => {
    const clientId = "22222222-2222-4222-8222-222222222222";
    const productId = "33333333-3333-4333-8333-333333333333";
    const associationClassId = "44444444-4444-4444-8444-444444444444";
    const document = createProjectDocument({ id: "11111111-1111-4111-8111-111111111111" });
    document.uml.classes.push({ id: clientId, name: "Cliente", visibility: "public", attributes: [], operations: [] }, { id: productId, name: "Producto", visibility: "public", attributes: [], operations: [] }, { id: associationClassId, name: "ClienteProducto", visibility: "public", attributes: [], operations: [] });
    document.uml.relationships.push({ id: "55555555-5555-4555-8555-555555555555", type: "Association", sourceId: clientId, targetId: productId, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" }, associationClassId });
    document.layout.elements.push({ elementId: clientId, x: 0, y: 0 }, { elementId: productId, x: 400, y: 0 }, { elementId: associationClassId, x: 210, y: 240 });

    resetPersistedWorkspaceTest(structuredClone(document));
    const hydrated = currentWorkspaceDocument();
    expect(hydrated.uml.classes).toHaveLength(3);
    expect(hydrated.uml.relationships[0]).toMatchObject({ associationClassId });
    expect(toReactFlowNodes(hydrated).find((node) => node.id === associationClassId)?.position).toEqual({ x: 210, y: 240 });
    expect(toReactFlowEdges(hydrated)[0]?.data?.associationClassPosition).toEqual({ x: 300, y: 300 });
  });

  it("mueve una association class hidratada usando su ID persistido", () => {
    const associationClassId = "44444444-4444-4444-8444-444444444444";
    const document = createProjectDocument();
    document.uml.classes.push({ id: associationClassId, name: "ClienteProducto", visibility: "public", attributes: [], operations: [] });
    document.layout.elements.push({ elementId: associationClassId, x: 210, y: 240 });
    resetPersistedWorkspaceTest(document);

    useWorkspaceStore.getState().moveElement(associationClassId, 260, 300);
    expect(currentWorkspaceDocument().layout.elements[0]).toMatchObject({ elementId: associationClassId, x: 260, y: 300 });
  });
  it("hidrata un documento válido sin historial ni notificación persistible", () => {
    const detail = createProjectDetailFixture();
    const listener = vi.fn();
    setWorkspacePersistentChangeListener(listener);
    resetPersistedWorkspaceTest(detail.document);

    expect(currentWorkspaceDocument()).toEqual(detail.document);
    expect(useWorkspaceStore.getState()).toMatchObject({ selection: null, canUndo: false, canRedo: false, diagnostics: [] });
    expect(listener).not.toHaveBeenCalled();
  });

  it("aísla documento e historial entre preparaciones", () => {
    resetPersistedWorkspaceTest();
    useWorkspaceStore.getState().createClass();
    expect(useWorkspaceStore.getState().canUndo).toBe(true);
    const second = createProjectDetailFixture({ name: "Proyecto B" });
    resetPersistedWorkspaceTest(second.document);

    expect(currentWorkspaceDocument()).toEqual(second.document);
    expect(useWorkspaceStore.getState()).toMatchObject({ selection: null, canUndo: false, canRedo: false });
  });

  it("reemplaza el listener persistible en vez de acumularlo", () => {
    const first = vi.fn();
    const second = vi.fn();
    setWorkspacePersistentChangeListener(first);
    setWorkspacePersistentChangeListener(second);
    useWorkspaceStore.getState().createClass();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("notifica una vez por comando aplicado, Undo y Redo", () => {
    const listener = vi.fn();
    setWorkspacePersistentChangeListener(listener);

    useWorkspaceStore.getState().createClass();
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();

    listener.mockClear();
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().document.uml.classes).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();

    listener.mockClear();
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("no notifica Undo o Redo sin historial", () => {
    const listener = vi.fn();
    const document = currentWorkspaceDocument();
    setWorkspacePersistentChangeListener(listener);

    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().redo();

    expect(currentWorkspaceDocument()).toEqual(document);
    expect(listener).not.toHaveBeenCalled();
  });

  it("no notifica una actualización sin cambio ni una selección", () => {
    useWorkspaceStore.getState().createClass();
    const [umlClass] = currentWorkspaceDocument().uml.classes;
    const document = currentWorkspaceDocument();
    const listener = vi.fn();
    setWorkspacePersistentChangeListener(listener);

    useWorkspaceStore.getState().updateClass(umlClass.id, umlClass.name, umlClass.visibility);
    useWorkspaceStore.getState().selectElement(umlClass.id);

    expect(currentWorkspaceDocument()).toEqual(document);
    expect(useWorkspaceStore.getState().selection).toEqual({ kind: "class", id: umlClass.id });
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifica una vez al mover un nodo y persistir su layout", () => {
    useWorkspaceStore.getState().createClass();
    const [umlClass] = currentWorkspaceDocument().uml.classes;
    const originalLayout = currentWorkspaceDocument().layout.elements[0];
    const listener = vi.fn();
    setWorkspacePersistentChangeListener(listener);

    useWorkspaceStore.getState().moveElement(umlClass.id, 420, 260);

    expect(currentWorkspaceDocument().layout.elements[0]).toMatchObject({ ...originalLayout, x: 420, y: 260 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("rechaza MoveElement en solo lectura sin cambiar layout ni notificar persistencia", () => {
    useWorkspaceStore.getState().createClass();
    const [umlClass] = currentWorkspaceDocument().uml.classes;
    const document = structuredClone(currentWorkspaceDocument());
    const listener = vi.fn();
    setWorkspacePersistentChangeListener(listener);
    setWorkspaceReadOnly(true);

    const result = useWorkspaceStore.getState().moveElement(umlClass.id, 420, 260);

    expect(result.success).toBe(false);
    expect(currentWorkspaceDocument()).toEqual(document);
    expect(listener).not.toHaveBeenCalled();
  });

  it("limpia el listener anterior antes de registrar uno nuevo", () => {
    const first = vi.fn();
    const second = vi.fn();
    setWorkspacePersistentChangeListener(first);
    setWorkspacePersistentChangeListener();
    useWorkspaceStore.getState().createClass();
    expect(first).not.toHaveBeenCalled();

    setWorkspacePersistentChangeListener(second);
    useWorkspaceStore.getState().createClass();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
