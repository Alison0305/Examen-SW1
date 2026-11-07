import { afterEach, describe, expect, it } from "vitest";
import type { ProjectDocument, UmlCommand, UmlFragment } from "@examen-sw1/uml-core";
import { resetWorkspaceStore, setWorkspaceCollaborativeCommandListener, useWorkspaceStore } from "./workspace-store";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const fragment = (): UmlFragment => ({
  classes: [
    { id: id(1), name: "Cliente", visibility: "public", attributes: [], operations: [] },
    { id: id(2), name: "Pedido", visibility: "public", attributes: [], operations: [] },
  ],
  enumerations: [{ id: id(3), name: "Estado", visibility: "public", literals: ["NUEVO"] }],
  relationships: [{ id: id(4), type: "Association", sourceId: id(1), targetId: id(2) }],
  layout: [{ elementId: id(1), x: 80, y: 80, width: 180, height: 120 }, { elementId: id(2), x: 320, y: 80, width: 180, height: 120 }, { elementId: id(3), x: 560, y: 80, width: 180, height: 120 }],
});

afterEach(() => {
  setWorkspaceCollaborativeCommandListener(undefined);
  resetWorkspaceStore();
});

describe("importación de fragmentos en el workspace", () => {
  it("aplica el fragmento en un paso y Deshacer local lo retira completo", () => {
    const before = structuredClone(useWorkspaceStore.getState().document);
    expect(useWorkspaceStore.getState().importFragment(fragment()).success).toBe(true);
    expect(useWorkspaceStore.getState().document.uml.classes.map((entry) => entry.name)).toEqual(["Cliente", "Pedido"]);

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().document.uml).toEqual(before.uml);
    expect(useWorkspaceStore.getState().document.layout).toEqual(before.layout);
  });

  it("en colaboración envía un comando y deshace con un único RemoveUmlFragment", () => {
    const operations: Array<{ command: UmlCommand; preimage: ProjectDocument }> = [];
    setWorkspaceCollaborativeCommandListener((command, preimage) => operations.push({ command, preimage }));
    const before = structuredClone(useWorkspaceStore.getState().document);

    useWorkspaceStore.getState().importFragment(fragment());
    expect(operations.map((entry) => entry.command.type)).toEqual(["ImportUmlFragment"]);
    useWorkspaceStore.getState().applyAuthoritativeCommand(operations[0]!.command, true, operations[0]!.preimage);
    expect(useWorkspaceStore.getState().document.uml.classes).toHaveLength(2);

    useWorkspaceStore.getState().undo();
    expect(operations[1]!.command).toEqual({ type: "RemoveUmlFragment", classIds: [id(1), id(2)], enumerationIds: [id(3)], relationshipIds: [id(4)] });
    useWorkspaceStore.getState().applyAuthoritativeCommand(operations[1]!.command, true, operations[1]!.preimage);
    expect(useWorkspaceStore.getState().document.uml).toEqual(before.uml);

    useWorkspaceStore.getState().redo();
    expect(operations[2]!.command.type).toBe("ImportUmlFragment");
  });

  it("un fragmento inválido no cambia el documento", () => {
    const before = structuredClone(useWorkspaceStore.getState().document);
    const invalid = fragment();
    invalid.classes[1] = { ...invalid.classes[1]!, name: "Cliente" };
    expect(useWorkspaceStore.getState().importFragment(invalid).success).toBe(false);
    expect(useWorkspaceStore.getState().document).toEqual(before);
  });
});
