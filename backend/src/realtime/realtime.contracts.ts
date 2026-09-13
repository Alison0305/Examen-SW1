import type { Diagnostic, ProjectDocument, UmlCommand } from "@examen-sw1/uml-core";
import type { ProjectAccessRole } from "../projects/project-access.service";

export const RealtimeEvent = {
  JOIN_PROJECT: "project.join",
  LEAVE_PROJECT: "project.leave",
  APPLY_OPERATION: "project.operation.apply",
  RESYNC: "project.resync",
  PRESENCE: "project.presence",
  PRESENCE_UPDATED: "project.presence.updated",
  ACCESS_CHANGED: "project.access.changed",
  ACCEPTED: "project.operation.accepted",
  REJECTED: "project.operation.rejected",
  CONFLICT: "project.operation.conflict",
  RESYNCED: "project.resynced",
} as const;

export interface JoinProjectDto {
  projectId: string;
}

export interface PresenceUpdateDto {
  projectId: string;
  selectionId?: string | null;
  cursor?: { x: number; y: number };
  editingElementId?: string | null;
  activity?: boolean;
}

export interface ProjectPresence {
  userId: string;
  displayName: string;
  avatar: string;
  online: boolean;
  selectionId?: string;
  cursor?: { x: number; y: number };
  editingElementId?: string;
  lastActivityAt?: string;
}

export interface ProjectPresenceEvent {
  projectId: string;
  presence: ProjectPresence;
}

export interface ProjectAccessChangedEvent {
  projectId: string;
  accessRole: ProjectAccessRole;
}

export interface ApplyProjectOperationDto {
  operationId: string;
  projectId: string;
  baseRevision: number;
  command: UmlCommand;
}

export interface ProjectOperationAck {
  operationId: string;
  projectId: string;
  revision: number;
  command: UmlCommand;
}

export interface ProjectOperationRejected {
  operationId: string;
  projectId: string;
  code: "INVALID_OPERATION" | "FORBIDDEN";
  diagnostics: Diagnostic[];
}

export interface ProjectOperationConflict {
  operationId: string;
  projectId: string;
  code: "STALE_REVISION";
  revision: number;
  requiresResync: true;
}

export interface ProjectRealtimeState {
  projectId: string;
  revision: number;
  document: ProjectDocument;
  accessRole: Exclude<ProjectAccessRole, "NONE">;
  presence: ProjectPresence[];
}

export type ApplyProjectOperationResult = ProjectOperationAck | ProjectOperationRejected | ProjectOperationConflict;
