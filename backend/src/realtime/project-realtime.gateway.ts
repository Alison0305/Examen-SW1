import { Inject, OnModuleDestroy, OnModuleInit, UsePipes, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectAccessInvalidationService, type ProjectAccessInvalidation } from "../projects/project-access-invalidation.service";
import type { ApplyProjectOperationDto, JoinProjectDto, PresenceUpdateDto, ProjectPresence } from "./realtime.contracts";
import { RealtimeEvent } from "./realtime.contracts";
import { ProjectOperationService } from "./project-operation.service";

type AuthenticatedSocket = Socket & { data: { user?: AuthenticatedUser } };
type PresenceRecord = ProjectPresence & { lastCursorEmissionAt: number; lastActivityEmissionAt: number; cursorTimer?: ReturnType<typeof setTimeout> };

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" } })
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ProjectRealtimeGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly presence = new Map<string, Map<string, PresenceRecord>>();
  private unsubscribeAccessInvalidations?: () => void;

  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProjectAccessService) private readonly access: ProjectAccessService,
    @Inject(ProjectAccessInvalidationService) private readonly accessInvalidations: ProjectAccessInvalidationService,
    @Inject(ProjectOperationService) private readonly operations: ProjectOperationService,
  ) {}

  onModuleInit(): void {
    this.unsubscribeAccessInvalidations = this.accessInvalidations.subscribe((invalidation) => this.invalidateAccess(invalidation));
  }

  onModuleDestroy(): void {
    this.unsubscribeAccessInvalidations?.();
  }

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket as AuthenticatedSocket)
        .then(() => next())
        .catch(() => next(Object.assign(new Error("UNAUTHORIZED"), { data: { code: "UNAUTHORIZED" } })));
    });
  }

  private async authenticate(socket: AuthenticatedSocket): Promise<void> {
    try {
      const token = tokenFrom(socket);
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
      if (!payload.sub) throw new Error("invalid token");
      const user = await this.auth.findAuthenticatedUser(payload.sub);
      if (!user) throw new Error("missing user");
      socket.data.user = user;
    } catch { throw new Error("UNAUTHORIZED"); }
  }

  @SubscribeMessage(RealtimeEvent.JOIN_PROJECT)
  async join(@ConnectedSocket() socket: AuthenticatedSocket, @MessageBody() dto: JoinProjectDto) {
    const user = this.user(socket);
    try {
      await this.access.requireView(dto.projectId, user.id);
      const state = await this.operations.getState(dto.projectId, user.id);
      await socket.join(room(dto.projectId));
      const presence = this.joinPresence(dto.projectId, socket.id, user);
      this.server.to(room(dto.projectId)).emit(RealtimeEvent.PRESENCE_UPDATED, { projectId: dto.projectId, presence });
      return { ...state, presence: this.presenceFor(dto.projectId) };
    } catch { return { code: "UNAUTHORIZED" }; }
  }

  @SubscribeMessage(RealtimeEvent.LEAVE_PROJECT)
  async leave(@ConnectedSocket() socket: AuthenticatedSocket, @MessageBody() dto: JoinProjectDto) {
    socket.leave(room(dto.projectId));
    this.leavePresence(dto.projectId, socket.id);
    return { projectId: dto.projectId };
  }

  handleDisconnect(socket: AuthenticatedSocket): void {
    for (const [projectId, members] of this.presence) {
      if (members.has(socket.id)) this.leavePresence(projectId, socket.id);
    }
  }

  private invalidateAccess({ projectId, userId, accessRole }: ProjectAccessInvalidation): void {
    for (const socket of this.server.sockets.sockets.values() as Iterable<AuthenticatedSocket>) {
      if (socket.data.user?.id !== userId || !socket.rooms.has(room(projectId))) continue;
      socket.emit(RealtimeEvent.ACCESS_CHANGED, { projectId, accessRole });
      if (accessRole === "NONE") {
        socket.leave(room(projectId));
        this.leavePresence(projectId, socket.id);
      }
    }
  }

  @SubscribeMessage(RealtimeEvent.PRESENCE)
  async updatePresence(@ConnectedSocket() socket: AuthenticatedSocket, @MessageBody() dto: PresenceUpdateDto) {
    try {
      await this.access.requireView(dto.projectId, this.user(socket).id);
      if (!socket.rooms.has(room(dto.projectId))) return { code: "UNAUTHORIZED" };
      const presence = this.presence.get(dto.projectId)?.get(socket.id);
      if (!presence) return { code: "UNAUTHORIZED" };
      const now = Date.now();
      let changed = false;
      if ("selectionId" in dto && presence.selectionId !== dto.selectionId) {
        presence.selectionId = dto.selectionId ?? undefined;
        changed = true;
      }
      if ("editingElementId" in dto && presence.editingElementId !== dto.editingElementId) {
        presence.editingElementId = dto.editingElementId ?? undefined;
        changed = true;
      }
      if (dto.activity && now - presence.lastActivityEmissionAt >= 5_000) {
        presence.lastActivityEmissionAt = now;
        presence.lastActivityAt = new Date(now).toISOString();
        changed = true;
      }
      if (dto.cursor) this.queueCursor(dto.projectId, socket.id, dto.cursor);
      if (changed) this.emitPresence(dto.projectId, presence);
      return { projectId: dto.projectId };
    } catch { return { code: "UNAUTHORIZED" }; }
  }

  @SubscribeMessage(RealtimeEvent.RESYNC)
  async resync(@ConnectedSocket() socket: AuthenticatedSocket, @MessageBody() dto: JoinProjectDto) {
    try { return await this.operations.getState(dto.projectId, this.user(socket).id); }
    catch { return { code: "UNAUTHORIZED" }; }
  }

  @SubscribeMessage(RealtimeEvent.APPLY_OPERATION)
  async apply(@ConnectedSocket() socket: AuthenticatedSocket, @MessageBody() dto: ApplyProjectOperationDto) {
    const user = this.user(socket);
    try {
      const result = await this.operations.apply(user.id, dto);
      const event = "code" in result && result.code === "STALE_REVISION" ? RealtimeEvent.CONFLICT
        : "code" in result && result.code === "INVALID_OPERATION" ? RealtimeEvent.REJECTED
        : RealtimeEvent.ACCEPTED;
      if (event === RealtimeEvent.ACCEPTED) this.server.to(room(dto.projectId)).emit(event, result);
      return result;
    } catch { return { operationId: dto.operationId, projectId: dto.projectId, code: "FORBIDDEN", diagnostics: [] }; }
  }

  private user(socket: AuthenticatedSocket): AuthenticatedUser {
    if (!socket.data.user) throw new Error("UNAUTHORIZED");
    return socket.data.user;
  }

  private joinPresence(projectId: string, socketId: string, user: AuthenticatedUser): ProjectPresence {
    const members = this.presence.get(projectId) ?? new Map<string, PresenceRecord>();
    this.presence.set(projectId, members);
    const displayName = user.email.split("@")[0] || "Usuario";
    const presence: PresenceRecord = { userId: user.id, displayName, avatar: displayName.slice(0, 2).toUpperCase(), online: true, lastCursorEmissionAt: 0, lastActivityEmissionAt: 0 };
    members.set(socketId, presence);
    return publicPresence(presence);
  }

  private leavePresence(projectId: string, socketId: string): void {
    const members = this.presence.get(projectId);
    const presence = members?.get(socketId);
    if (!members || !presence) return;
    if (presence.cursorTimer) clearTimeout(presence.cursorTimer);
    members.delete(socketId);
    if (members.size === 0) this.presence.delete(projectId);
    this.server.to(room(projectId)).emit(RealtimeEvent.PRESENCE_UPDATED, { projectId, presence: { ...publicPresence(presence), online: false } });
  }

  private queueCursor(projectId: string, socketId: string, cursor: { x: number; y: number }): void {
    const presence = this.presence.get(projectId)?.get(socketId);
    if (!presence) return;
    presence.cursor = cursor;
    const delay = Math.max(0, 100 - (Date.now() - presence.lastCursorEmissionAt));
    if (presence.cursorTimer) return;
    presence.cursorTimer = setTimeout(() => {
      presence.cursorTimer = undefined;
      presence.lastCursorEmissionAt = Date.now();
      this.emitPresence(projectId, presence);
    }, delay);
  }

  private emitPresence(projectId: string, presence: PresenceRecord): void {
    this.server.to(room(projectId)).emit(RealtimeEvent.PRESENCE_UPDATED, { projectId, presence: publicPresence(presence) });
  }

  private presenceFor(projectId: string): ProjectPresence[] {
    return [...(this.presence.get(projectId)?.values() ?? [])].map(publicPresence);
  }
}

function tokenFrom(socket: AuthenticatedSocket): string {
  const authToken = socket.handshake.auth?.token;
  const header = socket.handshake.headers.authorization;
  const token = typeof authToken === "string" ? authToken : typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) throw new Error("missing token");
  return token;
}

function room(projectId: string): string { return `project:${projectId}`; }

function publicPresence(presence: PresenceRecord): ProjectPresence {
  return {
    userId: presence.userId,
    displayName: presence.displayName,
    avatar: presence.avatar,
    online: presence.online,
    selectionId: presence.selectionId,
    cursor: presence.cursor,
    editingElementId: presence.editingElementId,
    lastActivityAt: presence.lastActivityAt,
  };
}
