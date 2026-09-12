import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDetailFixture, currentWorkspaceDocument, resetPersistedWorkspaceTest } from "./persisted-workspace-test-harness";
import { setWorkspacePersistentChangeListener, setWorkspaceReadOnly, useWorkspaceStore } from "./workspace-store";

afterEach(() => resetPersistedWorkspaceTest());

describe("harness de workspace persistido", () => {
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
