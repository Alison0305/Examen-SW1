import type { ProjectDocument } from "../model.js";
import type { CommandResult, UmlCommand } from "./command.js";
import { UmlCommandExecutor } from "./executor.js";

export interface UmlCommandBusOptions {
  executor?: UmlCommandExecutor;
  historyLimit?: number;
}

export interface UmlCommandBusHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  historyLimit: number;
}

export class UmlCommandBus {
  static readonly DEFAULT_HISTORY_LIMIT = 100;

  private readonly executor: UmlCommandExecutor;
  private readonly limit: number;
  private currentDocument: ProjectDocument;
  private readonly undoStack: ProjectDocument[] = [];
  private readonly redoStack: ProjectDocument[] = [];

  constructor(initialDocument: ProjectDocument, options: UmlCommandBusOptions = {}) {
    this.executor = options.executor ?? new UmlCommandExecutor();
    this.limit = Math.max(0, options.historyLimit ?? UmlCommandBus.DEFAULT_HISTORY_LIMIT);
    this.currentDocument = cloneDocument(initialDocument);
  }

  get document(): ProjectDocument {
    return cloneDocument(this.currentDocument);
  }

  get historyLimit(): number {
    return this.limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(command: UmlCommand): CommandResult {
    const previous = cloneDocument(this.currentDocument);
    const result = this.executor.execute(this.currentDocument, command);
    if (!result.success) {
      return cloneCommandResult(result);
    }

    if (this.limit > 0) {
      this.undoStack.push(previous);
      while (this.undoStack.length > this.limit) {
        this.undoStack.shift();
      }
    }
    this.redoStack.length = 0;
    this.currentDocument = cloneDocument(result.document);
    return cloneCommandResult(result);
  }

  undo(): ProjectDocument | undefined {
    const previous = this.undoStack.pop();
    if (!previous) {
      return undefined;
    }

    this.redoStack.push(cloneDocument(this.currentDocument));
    this.currentDocument = previous;
    return cloneDocument(this.currentDocument);
  }

  redo(): ProjectDocument | undefined {
    const next = this.redoStack.pop();
    if (!next) {
      return undefined;
    }

    this.undoStack.push(cloneDocument(this.currentDocument));
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.currentDocument = next;
    return cloneDocument(this.currentDocument);
  }

  getHistoryState(): UmlCommandBusHistoryState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      historyLimit: this.limit,
    };
  }
}

function cloneDocument(document: ProjectDocument): ProjectDocument {
  return JSON.parse(JSON.stringify(document)) as ProjectDocument;
}

function cloneCommandResult(result: CommandResult): CommandResult {
  if (result.success) {
    return {
      ...result,
      document: cloneDocument(result.document),
      diagnostics: structuredClone(result.diagnostics),
    };
  }

  return {
    ...result,
    document: cloneDocument(result.document),
    diagnostics: structuredClone(result.diagnostics),
  };
}
