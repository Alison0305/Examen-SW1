"use client";

import { io, type Socket } from "socket.io-client";
import type { ProjectDocument, UmlCommand } from "@examen-sw1/uml-core";
import { API_BASE_URL, type ProjectAccessRole } from "../auth/api";

export const RealtimeEvent = {
  JOIN_PROJECT: "project.join",
  LEAVE_PROJECT: "project.leave",
  APPLY_OPERATION: "project.operation.apply",
  RESYNC: "project.resync",
  ACCEPTED: "project.operation.accepted",
  REJECTED: "project.operation.rejected",
  CONFLICT: "project.operation.conflict",
  PRESENCE: "project.presence",
  PRESENCE_UPDATED: "project.presence.updated",
  ACCESS_CHANGED: "project.access.changed",
} as const;

export type ProjectPresence = {
  userId: string;
  displayName: string;
  avatar: string;
  online: boolean;
  selectionId?: string;
  cursor?: { x: number; y: number };
  editingElementId?: string;
  lastActivityAt?: string;
};

export type ProjectRealtimeState = {
  projectId: string;
  revision: number;
  document: ProjectDocument;
  accessRole: ProjectAccessRole;
  presence: ProjectPresence[];
};

export type ProjectAccessChangedEvent = { projectId: string; accessRole: ProjectAccessRole | "NONE" };

export type OperationAck = { operationId: string; projectId: string; revision: number; command: UmlCommand };
export type OperationConflict = { operationId: string; projectId: string; code: "STALE_REVISION"; revision: number; requiresResync: true };
export type OperationRejected = { operationId: string; projectId: string; code: "INVALID_OPERATION" | "FORBIDDEN"; diagnostics: unknown[] };
export type OperationResult = OperationAck | OperationConflict | OperationRejected;

export class WorkspaceRealtimeClient {
  private socket: Socket | null = null;

  connect(token: string): Socket {
    if (this.socket) return this.socket;
    this.socket = io(API_BASE_URL, { auth: { token }, autoConnect: true, transports: ["websocket"] });
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  async join(projectId: string): Promise<ProjectRealtimeState> {
    return this.emitWithAck<ProjectRealtimeState>(RealtimeEvent.JOIN_PROJECT, { projectId });
  }

  leave(projectId: string): void {
    this.socket?.emit(RealtimeEvent.LEAVE_PROJECT, { projectId });
  }

  resync(projectId: string): Promise<ProjectRealtimeState> {
    return this.emitWithAck<ProjectRealtimeState>(RealtimeEvent.RESYNC, { projectId });
  }

  apply(operationId: string, projectId: string, baseRevision: number, command: UmlCommand): Promise<OperationResult> {
    return this.emitWithAck<OperationResult>(RealtimeEvent.APPLY_OPERATION, { operationId, projectId, baseRevision, command });
  }

  presence(projectId: string, update: Omit<Partial<ProjectPresence>, "userId" | "displayName" | "avatar" | "online" | "selectionId" | "editingElementId"> & { selectionId?: string | null; editingElementId?: string | null; activity?: boolean }): void {
    this.socket?.emit(RealtimeEvent.PRESENCE, { projectId, ...update });
  }

  on(event: string, listener: Parameters<Socket["on"]>[1]): void { this.socket?.on(event, listener); }
  off(event: string, listener?: Parameters<Socket["off"]>[1]): void { this.socket?.off(event, listener); }
  get connected(): boolean { return this.socket?.connected ?? false; }

  private emitWithAck<T>(event: string, payload: object): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) return reject(new Error("REALTIME_DISCONNECTED"));
      this.socket.timeout(10_000).emit(event, payload, (error: Error | null, response: T) => error ? reject(error) : resolve(response));
    });
  }
}
