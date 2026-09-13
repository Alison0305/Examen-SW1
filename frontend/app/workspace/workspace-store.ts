"use client";

import {
  UmlCommandBus,
  createProjectDocument,
  validateProjectDocument,
  type CommandResult,
  type Diagnostic,
  type ProjectDocument,
  type UmlCommand,
  type UmlRelationshipType,
  type UmlVisibility,
  type Uuid,
} from "@examen-sw1/uml-core";
import { create } from "zustand";
import { calculateAutoLayout } from "./auto-layout";
import { parseMultiplicity, typeFromPrimitiveName } from "./workspace-utils";

export type WorkspaceTool = "select" | "class" | "enum" | UmlRelationshipType;

export interface WorkspaceSelection {
  kind: "class" | "enumeration" | "relationship";
  id: Uuid;
}

interface WorkspaceState {
  document: ProjectDocument;
  activeTool: WorkspaceTool;
  selection: WorkspaceSelection | null;
  pendingRelationshipSourceId: Uuid | null;
  lastResult: CommandResult | null;
  diagnostics: Diagnostic[];
  commandDiagnostics: Diagnostic[];
  documentDiagnostics: Diagnostic[];
  focusedElementId: Uuid | null;
  canUndo: boolean;
  canRedo: boolean;
  fitViewCount: number;
  autoLayoutCount: number;
  setTool: (tool: WorkspaceTool) => void;
  createClass: () => CommandResult;
  createEnumeration: () => CommandResult;
  selectElement: (elementId: Uuid) => void;
  selectRelationship: (relationshipId: Uuid) => void;
  moveElement: (elementId: Uuid, x: number, y: number) => CommandResult;
  updateClass: (classId: Uuid, name: string, visibility: UmlVisibility) => void;
  addAttribute: (classId: Uuid, name: string, typeName: string, visibility: UmlVisibility, multiplicity: string) => CommandResult;
  updateAttribute: (
    classId: Uuid,
    attributeId: Uuid,
    name: string,
    typeName: string,
    visibility: UmlVisibility,
    multiplicity: string,
  ) => CommandResult;
  removeAttribute: (classId: Uuid, attributeId: Uuid) => CommandResult;
  deleteSelectedClass: () => void;
  updateEnumeration: (enumerationId: Uuid, name: string, visibility: UmlVisibility) => void;
  addEnumerationLiteral: (enumerationId: Uuid, literal: string) => void;
  removeEnumerationLiteral: (enumerationId: Uuid, literal: string) => void;
  deleteSelectedEnumeration: () => void;
  updateRelationshipMultiplicity: (relationshipId: Uuid, end: "source" | "target", multiplicity: string) => void;
  updateRelationshipName: (relationshipId: Uuid, name: string) => CommandResult;
  deleteSelectedRelationship: () => void;
  applyAutoLayout: () => Promise<CommandResult>;
  undo: () => void;
  redo: () => void;
  validateDocument: () => void;
  navigateToDiagnostic: (diagnostic: Diagnostic) => void;
  markFitView: () => void;
  applyAuthoritativeCommand: (command: UmlCommand, local?: boolean, preimage?: ProjectDocument) => CommandResult;
  replaceAuthoritativeDocument: (document: ProjectDocument) => void;
}

type SetWorkspaceState = (state: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

let uuidCounter = 1;
let commandBus = new UmlCommandBus(createInitialDocument());
let persistentChangeListener: (() => void) | undefined;
let collaborativeCommandListener: ((command: UmlCommand, preimage: ProjectDocument) => void) | undefined;
let workspaceReadOnly = false;
type CollaborativeHistoryEntry = { command: UmlCommand; undoCommand: UmlCommand };
let collaborativeUndo: CollaborativeHistoryEntry[] = [];
let collaborativeRedo: CollaborativeHistoryEntry[] = [];
let collaborativeHistoryAction: "undo" | "redo" | undefined;

export function setWorkspacePersistentChangeListener(listener?: () => void): void {
  persistentChangeListener = listener;
}

export function setWorkspaceCollaborativeCommandListener(listener?: (command: UmlCommand, preimage: ProjectDocument) => void): void {
  collaborativeCommandListener = listener;
  collaborativeUndo = [];
  collaborativeRedo = [];
  collaborativeHistoryAction = undefined;
  // Local snapshots cannot be replayed against the authoritative revision.
  commandBus = new UmlCommandBus(commandBus.document, { historyLimit: 0 });
  useWorkspaceStore.setState({ canUndo: false, canRedo: false });
}

export function invalidateWorkspaceCollaborativeHistory(): void {
  collaborativeUndo = [];
  collaborativeRedo = [];
  collaborativeHistoryAction = undefined;
  useWorkspaceStore.setState({ canUndo: false, canRedo: false });
}

export function setWorkspaceReadOnly(readOnly = false): void {
  workspaceReadOnly = readOnly;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  document: commandBus.document,
  activeTool: "select",
  selection: null,
  pendingRelationshipSourceId: null,
  lastResult: null,
  diagnostics: [],
  commandDiagnostics: [],
  documentDiagnostics: [],
  focusedElementId: null,
  canUndo: false,
  canRedo: false,
  fitViewCount: 0,
  autoLayoutCount: 0,
  setTool: (tool) => set({ activeTool: tool, pendingRelationshipSourceId: null }),
  createClass: () => {
    const document = get().document;
    const classId = createWorkspaceUuid();
    const result = applyCommand(set, {
      type: "CreateClass",
      classId,
      name: `Clase${document.uml.classes.length + 1}`,
      layout: { x: 100 + document.uml.classes.length * 40, y: 100 + document.uml.classes.length * 30, width: 180, height: 120 },
    });
    if (result.success) {
      set({ selection: { kind: "class", id: classId }, activeTool: "select" });
    }
    return result;
  },
  createEnumeration: () => {
    const document = get().document;
    const enumerationId = createWorkspaceUuid();
    const result = applyCommand(set, {
      type: "CreateEnumeration",
      enumerationId,
      name: `Estado${document.uml.enumerations.length + 1}`,
      literals: [],
      layout: { x: 140 + document.uml.enumerations.length * 40, y: 280 + document.uml.enumerations.length * 30, width: 180, height: 120 },
    });
    if (result.success) {
      set({ selection: { kind: "enumeration", id: enumerationId }, activeTool: "select" });
    }
    return result;
  },
  selectElement: (elementId) => {
    const tool = get().activeTool;
    const document = get().document;
    const selection = resolveSelection(document, elementId);

    if (isRelationshipTool(tool)) {
      const sourceId = get().pendingRelationshipSourceId;
      if (!sourceId) {
        set({ pendingRelationshipSourceId: elementId, selection, focusedElementId: elementId });
        return;
      }

      const relationshipId = createWorkspaceUuid();
      const result = applyCommand(set, {
        type: "CreateRelationship",
        relationshipId,
        relationshipType: tool,
        sourceId,
        targetId: elementId,
      });
      set({
        activeTool: "select",
        pendingRelationshipSourceId: null,
        selection: result.success ? { kind: "relationship", id: relationshipId } : selection,
        focusedElementId: result.success ? relationshipId : elementId,
      });
      return;
    }

    set({ selection, focusedElementId: elementId });
  },
  selectRelationship: (relationshipId) => set({ selection: { kind: "relationship", id: relationshipId }, focusedElementId: relationshipId }),
  moveElement: (elementId, x, y) => applyCommand(set, { type: "MoveElement", elementId, x, y }),
  updateClass: (classId, name, visibility) => {
    const current = get().document.uml.classes.find((umlClass) => umlClass.id === classId);
    if (current?.name !== name) {
      applyCommand(set, { type: "RenameClass", classId, name });
    }
    if (current?.visibility !== visibility) {
      applyCommand(set, { type: "UpdateClassVisibility", classId, visibility });
    }
  },
  addAttribute: (classId, name, typeName, visibility, multiplicity) => {
    return applyCommand(set, {
      type: "AddAttribute",
      classId,
      attributeId: createWorkspaceUuid(),
      name,
      visibility,
      attributeType: typeFromPrimitiveName(typeName),
      multiplicity: parseMultiplicity(multiplicity),
    });
  },
  updateAttribute: (classId, attributeId, name, typeName, visibility, multiplicity) => {
    return applyCommand(set, {
      type: "UpdateAttribute",
      classId,
      attributeId,
      updates: {
        name,
        visibility,
        attributeType: typeFromPrimitiveName(typeName),
        multiplicity: parseMultiplicity(multiplicity),
      },
    });
  },
  removeAttribute: (classId, attributeId) => applyCommand(set, { type: "RemoveAttribute", classId, attributeId }),
  deleteSelectedClass: () => {
    const selection = get().selection;
    if (selection?.kind !== "class") {
      return;
    }
    const result = applyCommand(set, { type: "DeleteClass", classId: selection.id });
    if (result.success) {
      set({ selection: null, focusedElementId: null });
    }
  },
  updateEnumeration: (enumerationId, name, visibility) => {
    const current = get().document.uml.enumerations.find((enumeration) => enumeration.id === enumerationId);
    if (current?.name !== name) {
      applyCommand(set, { type: "RenameEnumeration", enumerationId, name });
    }
    if (current?.visibility !== visibility) {
      applyCommand(set, { type: "UpdateEnumerationVisibility", enumerationId, visibility });
    }
  },
  addEnumerationLiteral: (enumerationId, literal) => applyCommand(set, { type: "AddEnumerationLiteral", enumerationId, literal }),
  removeEnumerationLiteral: (enumerationId, literal) => applyCommand(set, { type: "RemoveEnumerationLiteral", enumerationId, literal }),
  deleteSelectedEnumeration: () => {
    const selection = get().selection;
    if (selection?.kind !== "enumeration") {
      return;
    }
    const result = applyCommand(set, { type: "DeleteEnumeration", enumerationId: selection.id });
    if (result.success) {
      set({ selection: null, focusedElementId: null });
    }
  },
  updateRelationshipMultiplicity: (relationshipId, end, multiplicity) => {
    applyCommand(set, { type: "UpdateMultiplicity", relationshipId, end, multiplicity: parseMultiplicity(multiplicity) });
  },
  updateRelationshipName: (relationshipId, name) => applyCommand(set, { type: "UpdateRelationshipName", relationshipId, name }),
  deleteSelectedRelationship: () => {
    const selection = get().selection;
    if (selection?.kind !== "relationship") {
      return;
    }
    const result = applyCommand(set, { type: "DeleteRelationship", relationshipId: selection.id });
    if (result.success) {
      set({ selection: null });
    }
  },
  applyAutoLayout: async () => {
    const elements = await calculateAutoLayout(get().document);
    const result = applyCommand(set, { type: "ApplyLayout", elements });
    if (result.success) {
      set((state) => ({ autoLayoutCount: state.autoLayoutCount + 1 }));
    }
    return result;
  },
  undo: () => {
    if (workspaceReadOnly) return;
    if (collaborativeCommandListener) {
      const entry = collaborativeUndo.at(-1);
      if (!entry || collaborativeHistoryAction) return;
      collaborativeHistoryAction = "undo";
      collaborativeCommandListener(entry.undoCommand, commandBus.document);
      setCollaborativeHistory(set);
      return;
    }
    const document = commandBus.undo();
      if (document) {
      const documentDiagnostics = validateProjectDocument(document).diagnostics;
        setFromBus(set, { document, lastResult: null, diagnostics: documentDiagnostics, commandDiagnostics: [], documentDiagnostics, selection: null });
        persistentChangeListener?.();
    }
  },
  redo: () => {
    if (workspaceReadOnly) return;
    if (collaborativeCommandListener) {
      const entry = collaborativeRedo.at(-1);
      if (!entry || collaborativeHistoryAction) return;
      collaborativeHistoryAction = "redo";
      collaborativeCommandListener(entry.command, commandBus.document);
      setCollaborativeHistory(set);
      return;
    }
    const document = commandBus.redo();
      if (document) {
      const documentDiagnostics = validateProjectDocument(document).diagnostics;
        setFromBus(set, { document, lastResult: null, diagnostics: documentDiagnostics, commandDiagnostics: [], documentDiagnostics, selection: null });
        persistentChangeListener?.();
    }
  },
  validateDocument: () => {
    const validation = validateProjectDocument(get().document);
    set({ diagnostics: [...get().commandDiagnostics, ...validation.diagnostics], documentDiagnostics: validation.diagnostics, lastResult: null });
  },
  navigateToDiagnostic: (diagnostic) => {
    if (!diagnostic.elementId) {
      return;
    }
    const selection = resolveSelection(get().document, diagnostic.elementId);
    set({ selection, focusedElementId: selection ? diagnostic.elementId : null });
  },
  markFitView: () => set((state) => ({ fitViewCount: state.fitViewCount + 1 })),
    applyAuthoritativeCommand: (command, local = false, preimage?: ProjectDocument) => {
      commandBus = new UmlCommandBus(commandBus.document, { historyLimit: 0 });
      const result = commandBus.execute(command);
      if (result.success && local) {
        if (collaborativeHistoryAction === "undo") {
          const entry = collaborativeUndo.pop();
          if (entry) collaborativeRedo.push(entry);
        } else if (collaborativeHistoryAction === "redo") {
          const entry = collaborativeRedo.pop();
          if (entry) collaborativeUndo.push(entry);
        } else if (preimage) {
          const undoCommand = isDeletionCommand(command) && result.deletionSnapshot
            ? { type: "RestoreDeletionSnapshot" as const, snapshot: result.deletionSnapshot }
            : inverseCommand(command, preimage);
          if (undoCommand) {
            const entry = { command, undoCommand };
            collaborativeUndo.push(entry);
            collaborativeRedo = [];
          }
        }
    } else if (!local) {
      collaborativeUndo = [];
      collaborativeRedo = [];
    }
    collaborativeHistoryAction = undefined;
    const documentDiagnostics = validateProjectDocument(commandBus.document).diagnostics;
    setFromBus(set, { lastResult: result, diagnostics: [...result.diagnostics, ...documentDiagnostics], commandDiagnostics: result.success ? [] : result.diagnostics, documentDiagnostics });
    if (collaborativeCommandListener) setCollaborativeHistory(set);
    return result;
  },
  replaceAuthoritativeDocument: (document) => {
    commandBus = new UmlCommandBus(document);
    collaborativeUndo = [];
    collaborativeRedo = [];
    collaborativeHistoryAction = undefined;
    const documentDiagnostics = validateProjectDocument(document).diagnostics;
    setFromBus(set, { lastResult: null, diagnostics: documentDiagnostics, commandDiagnostics: [], documentDiagnostics, selection: null, pendingRelationshipSourceId: null });
  },
}));

export function resetWorkspaceStore(initialDocument: ProjectDocument = createInitialDocument()): void {
  workspaceReadOnly = false;
  collaborativeCommandListener = undefined;
  collaborativeUndo = [];
  collaborativeRedo = [];
  collaborativeHistoryAction = undefined;
  uuidCounter = 1;
  commandBus = new UmlCommandBus(initialDocument);
  useWorkspaceStore.setState({
    document: commandBus.document,
    activeTool: "select",
    selection: null,
    pendingRelationshipSourceId: null,
    lastResult: null,
    diagnostics: [],
    commandDiagnostics: [],
    documentDiagnostics: [],
    focusedElementId: null,
    canUndo: false,
    canRedo: false,
    fitViewCount: 0,
    autoLayoutCount: 0,
  });
}

function createInitialDocument(): ProjectDocument {
  return createProjectDocument({ uuidFactory: createWorkspaceUuid, now: new Date("2026-09-05T00:00:00.000Z") });
}

function createWorkspaceUuid(): Uuid {
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return cryptoLike?.randomUUID?.() ?? `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`;
}

function applyCommand(set: SetWorkspaceState, command: UmlCommand): CommandResult {
  if (workspaceReadOnly) {
    return { success: false, status: "rejected", document: commandBus.document, diagnostics: [] };
  }
  if (collaborativeCommandListener) {
    const preimage = commandBus.document;
    const result = new UmlCommandBus(preimage, { historyLimit: 0 }).execute(command);
    if (result.success) collaborativeCommandListener(command, preimage);
    return result;
  }
  const result = commandBus.execute(command);
  const documentDiagnostics = validateProjectDocument(commandBus.document).diagnostics;
  const commandDiagnostics = result.success ? [] : result.diagnostics;
  setFromBus(set, {
    lastResult: result,
    diagnostics: [...commandDiagnostics, ...documentDiagnostics],
    commandDiagnostics,
    documentDiagnostics,
  });
  if (result.success) persistentChangeListener?.();
  return result;
}

function setFromBus(set: SetWorkspaceState, state: Partial<WorkspaceState>): void {
  const history = commandBus.getHistoryState();
  set({
    document: commandBus.document,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    ...state,
  });
}

function setCollaborativeHistory(set: SetWorkspaceState): void {
  set({ canUndo: collaborativeUndo.length > 0 && !collaborativeHistoryAction, canRedo: collaborativeRedo.length > 0 && !collaborativeHistoryAction });
}

function isDeletionCommand(command: UmlCommand): boolean {
  return command.type === "DeleteClass" || command.type === "DeleteEnumeration" || command.type === "DeleteRelationship" || command.type === "RemoveAttribute" || command.type === "RemoveEnumerationLiteral";
}

function inverseCommand(command: UmlCommand, document: ProjectDocument): UmlCommand | undefined {
  switch (command.type) {
    case "CreateClass": return command.classId ? { type: "DeleteClass", classId: command.classId } : undefined;
    case "RenameClass": {
      const umlClass = document.uml.classes.find((entry) => entry.id === command.classId);
      return umlClass ? { type: "RenameClass", classId: command.classId, name: umlClass.name } : undefined;
    }
    case "UpdateClassVisibility": {
      const umlClass = document.uml.classes.find((entry) => entry.id === command.classId);
      return umlClass ? { type: "UpdateClassVisibility", classId: command.classId, visibility: umlClass.visibility } : undefined;
    }
    case "AddAttribute": return command.attributeId ? { type: "RemoveAttribute", classId: command.classId, attributeId: command.attributeId } : undefined;
    case "UpdateAttribute": {
      const attribute = document.uml.classes.find((entry) => entry.id === command.classId)?.attributes.find((entry) => entry.id === command.attributeId);
      if (!attribute) return undefined;
      const updates = Object.fromEntries(Object.keys(command.updates).map((key) => [key, structuredClone(attribute[key as keyof typeof attribute])])) as typeof command.updates;
      return { type: "UpdateAttribute", classId: command.classId, attributeId: command.attributeId, updates };
    }
    case "CreateEnumeration": return command.enumerationId ? { type: "DeleteEnumeration", enumerationId: command.enumerationId } : undefined;
    case "RenameEnumeration": {
      const enumeration = document.uml.enumerations.find((entry) => entry.id === command.enumerationId);
      return enumeration ? { type: "RenameEnumeration", enumerationId: command.enumerationId, name: enumeration.name } : undefined;
    }
    case "UpdateEnumerationVisibility": {
      const enumeration = document.uml.enumerations.find((entry) => entry.id === command.enumerationId);
      return enumeration ? { type: "UpdateEnumerationVisibility", enumerationId: command.enumerationId, visibility: enumeration.visibility } : undefined;
    }
    case "AddEnumerationLiteral": return { type: "RemoveEnumerationLiteral", enumerationId: command.enumerationId, literal: command.literal };
    case "CreateRelationship": return command.relationshipId ? { type: "DeleteRelationship", relationshipId: command.relationshipId } : undefined;
    case "UpdateMultiplicity": {
      const relationship = document.uml.relationships.find((entry) => entry.id === command.relationshipId);
      return relationship ? { type: "UpdateMultiplicity", relationshipId: command.relationshipId, end: command.end, multiplicity: relationship[command.end === "source" ? "sourceMultiplicity" : "targetMultiplicity"] } : undefined;
    }
    case "UpdateRelationshipName": {
      const relationship = document.uml.relationships.find((entry) => entry.id === command.relationshipId);
      return relationship ? { type: "UpdateRelationshipName", relationshipId: command.relationshipId, name: relationship.name ?? "" } : undefined;
    }
    case "MoveElement": {
      const layout = document.layout.elements.find((entry) => entry.elementId === command.elementId);
      return layout ? { type: "MoveElement", elementId: command.elementId, x: layout.x, y: layout.y, width: layout.width, height: layout.height } : undefined;
    }
    case "ApplyLayout": return {
      type: "ApplyLayout",
      elements: document.layout.elements.filter((layout) => command.elements.some((entry) => entry.elementId === layout.elementId)).map((layout) => structuredClone(layout)),
    };
    default: return undefined;
  }
}

function isRelationshipTool(tool: WorkspaceTool): tool is UmlRelationshipType {
  return tool === "Association" || tool === "Aggregation" || tool === "Composition" || tool === "Generalization";
}

function resolveSelection(document: ProjectDocument, elementId: Uuid): WorkspaceSelection | null {
  if (document.uml.classes.some((umlClass) => umlClass.id === elementId)) {
    return { kind: "class", id: elementId };
  }
  if (document.uml.enumerations.some((enumeration) => enumeration.id === elementId)) {
    return { kind: "enumeration", id: elementId };
  }
  if (document.uml.relationships.some((relationship) => relationship.id === elementId)) {
    return { kind: "relationship", id: elementId };
  }
  return null;
}
