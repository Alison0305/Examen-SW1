import { createProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import type { ProjectDetail } from "../auth/api";
import { resetWorkspaceStore, setWorkspacePersistentChangeListener, useWorkspaceStore } from "./workspace-store";

export function createProjectDetailFixture(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  const document = overrides.document ?? createProjectDocument({ now: new Date("2026-09-10T00:00:00.000Z") });
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Proyecto de prueba",
    revision: 8,
    accessRole: "OWNER",
    document,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

export function resetPersistedWorkspaceTest(document?: ProjectDocument): void {
  setWorkspacePersistentChangeListener();
  resetWorkspaceStore(document);
}

export function currentWorkspaceDocument(): ProjectDocument {
  return useWorkspaceStore.getState().document;
}
