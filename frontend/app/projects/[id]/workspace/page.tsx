"use client";

import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { ProjectDocument, UmlCommand } from "@examen-sw1/uml-core";
import { ProtectedPage } from "../../../auth/protected-page";
import { ApiError, createApiClient, type ApiClient, type ProjectDetail } from "../../../auth/api";
import { useSession } from "../../../auth/session";
import { WorkspaceClient } from "../../../workspace/workspace-client";
import { invalidateWorkspaceCollaborativeHistory, resetWorkspaceStore, setWorkspaceCollaborativeCommandListener, useWorkspaceStore } from "../../../workspace/workspace-store";
import { RealtimeEvent, WorkspaceRealtimeClient, type OperationAck, type OperationConflict, type ProjectAccessChangedEvent, type ProjectPresence, type ProjectRealtimeState } from "../../../workspace/realtime-client";

function PersistedWorkspace() {
  const { logout } = useSession();
  const apiRef = useRef<ApiClient | null>(null);
  const api = apiRef.current ?? createApiClient({ getToken: () => sessionStorage.getItem("examen-sw1.access-token"), onUnauthorized: logout });
  apiRef.current = api;
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving">("clean");
  const [staleConflict, setStaleConflict] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "disconnected" | "resyncing" | "conflict">("connecting");
  const [presence, setPresence] = useState<ProjectPresence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const realtimeRef = useRef<WorkspaceRealtimeClient | null>(null);
  const projectRef = useRef<ProjectDetail | null>(null);
  const connectionRef = useRef(connection);
  const receivedOperations = useRef(new Set<string>());
  const pendingOperations = useRef(new Map<string, { command: UmlCommand; preimage: ProjectDocument }>());
  projectRef.current = project;
  connectionRef.current = connection;
  useEffect(() => {
    void api.getProject(params.id).then((detail) => {
      resetWorkspaceStore(detail.document);
      setProject(detail);
      setSaveState("clean");
      setStaleConflict(false);
    }).catch((cause) => setError(cause instanceof ApiError && cause.status === 404 ? "Proyecto no encontrado o no disponible." : "No fue posible cargar el proyecto."));
  }, [api, params.id]);
  useEffect(() => {
    if (!project) return;
    const realtime = new WorkspaceRealtimeClient();
    realtimeRef.current = realtime;
    const applyState = (state: ProjectRealtimeState) => {
      useWorkspaceStore.getState().replaceAuthoritativeDocument(state.document);
      if (projectRef.current) projectRef.current = { ...projectRef.current, document: state.document, revision: state.revision };
      setProject((current) => current ? { ...current, document: state.document, revision: state.revision } : current);
      setPresence(state.presence);
      setStaleConflict(false);
      setConnection("connected");
      setWorkspaceCollaborativeCommandListener((command, preimage) => {
        const current = projectRef.current;
        if (!current || current.accessRole === "VIEWER" || connectionRef.current !== "connected") return;
        const operationId = crypto.randomUUID();
        pendingOperations.current.set(operationId, { command, preimage });
        void realtime.apply(operationId, current.id, current.revision, command).then((result) => {
            if (!("code" in result)) accepted(result);
            if ("code" in result && result.code === "STALE_REVISION") conflict(result);
            if ("code" in result && result.code === "FORBIDDEN") void reconcileForbidden(current.id);
            if ("code" in result && result.code === "INVALID_OPERATION") {
              pendingOperations.current.delete(operationId);
              invalidateWorkspaceCollaborativeHistory();
              setError("El servidor rechazó la operación UML.");
          }
        }).catch(() => {
          // A timeout is ambiguous: never replay it blindly; resync before editing again.
          setConnection("resyncing");
          void realtime.resync(current.id).then(applyState).catch(() => setConnection("disconnected"));
        });
      });
    };
    const socket = realtime.connect(sessionStorage.getItem("examen-sw1.access-token") ?? "");
    const accepted = (ack: OperationAck) => {
      if (receivedOperations.current.has(ack.operationId)) return;
      receivedOperations.current.add(ack.operationId);
      const local = pendingOperations.current.get(ack.operationId);
      pendingOperations.current.delete(ack.operationId);
      useWorkspaceStore.getState().applyAuthoritativeCommand(ack.command, local !== undefined, local?.preimage);
      if (projectRef.current) projectRef.current = { ...projectRef.current, revision: ack.revision, document: useWorkspaceStore.getState().document };
      setProject((current) => current ? { ...current, revision: ack.revision, document: useWorkspaceStore.getState().document } : current);
      setConnection("connected");
    };
    const conflict = (result: OperationConflict) => {
      setStaleConflict(true);
      pendingOperations.current.clear();
      invalidateWorkspaceCollaborativeHistory();
      setConnection("conflict");
      setProject((current) => current ? { ...current, revision: result.revision } : current);
    };
    const reconcileForbidden = async (projectId: string) => {
      pendingOperations.current.clear();
      invalidateWorkspaceCollaborativeHistory();
      try {
        const detail = await api.getProject(projectId);
        if (detail.accessRole !== "VIEWER") throw new Error("FORBIDDEN_ROLE_UNCHANGED");
        useWorkspaceStore.getState().replaceAuthoritativeDocument(detail.document);
        projectRef.current = detail;
        setProject(detail);
        setSaveState("clean");
        setStaleConflict(false);
      } catch (cause) {
        realtime.leave(projectId);
        realtime.disconnect();
        realtimeRef.current = null;
        setPresence([]);
        setConnection("disconnected");
        setError(cause instanceof ApiError && cause.status === 404 ? "Proyecto no encontrado o no disponible." : "El servidor rechazó la operación UML.");
      }
    };
    const accessChanged = ({ projectId, accessRole }: ProjectAccessChangedEvent) => {
      if (projectId !== project.id) return;
      pendingOperations.current.clear();
      invalidateWorkspaceCollaborativeHistory();
      setSaveState("clean");
      setStaleConflict(false);
      if (accessRole !== "NONE") {
        setProject((current) => current ? { ...current, accessRole } : current);
        return;
      }
      realtime.leave(projectId);
      realtime.disconnect();
      realtimeRef.current = null;
      setPresence([]);
      resetWorkspaceStore();
      setConnection("disconnected");
      setError("El acceso al proyecto fue revocado.");
    };
    const presenceUpdated = ({ presence: update }: { presence: ProjectPresence }) => setPresence((current) => update.online ? [...current.filter((item) => item.userId !== update.userId), update] : current.filter((item) => item.userId !== update.userId));
    socket.on("connect", () => { setConnection("resyncing"); void realtime.join(project.id).then(applyState).catch(() => setConnection("disconnected")); });
    socket.on("disconnect", () => { pendingOperations.current.clear(); setConnection("disconnected"); });
    socket.on(RealtimeEvent.ACCEPTED, accepted);
    socket.on(RealtimeEvent.CONFLICT, conflict);
    socket.on(RealtimeEvent.PRESENCE_UPDATED, presenceUpdated);
    socket.on(RealtimeEvent.ACCESS_CHANGED, accessChanged);
    return () => {
      setWorkspaceCollaborativeCommandListener();
      pendingOperations.current.clear();
      realtime.leave(project.id);
      realtime.disconnect();
      realtimeRef.current = null;
    };
  }, [project?.id]);
  if (error) return <Box sx={{ p: 4 }}><Stack spacing={2}><Alert severity="error">{error}</Alert><Button onClick={() => router.push("/projects")}>Volver a proyectos</Button></Stack></Box>;
  if (!project) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress aria-label="Cargando proyecto" /></Box>;
  const readOnly = project?.accessRole === "VIEWER";
  const save = async () => {
    if (readOnly || saveState === "saving") return;
    setSaveState("saving");
    try {
      const updated = await api.saveProject(project.id, useWorkspaceStore.getState().document, project.revision);
      setProject(updated);
      setSaveState("clean");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setStaleConflict(true);
      setSaveState("dirty");
    }
  };
  const reload = async () => {
    if (connection !== "connected") {
      if (saveState === "dirty" && !window.confirm("Los cambios locales se perderán.")) return;
      const detail = await api.getProject(project.id);
      resetWorkspaceStore(detail.document);
      setProject(detail);
      setSaveState("clean");
      setStaleConflict(false);
      return;
    }
    setConnection("resyncing");
    try {
      const state = await realtimeRef.current?.resync(project.id);
      if (!state) throw new Error("REALTIME_DISCONNECTED");
      useWorkspaceStore.getState().replaceAuthoritativeDocument(state.document);
      pendingOperations.current.clear();
      setProject((current) => current ? { ...current, document: state.document, revision: state.revision } : current);
      setPresence(state.presence);
      setStaleConflict(false);
      setConnection("connected");
    } catch { setConnection("disconnected"); }
  };
  return <><WorkspaceClient projectName={project.name} saveState={connection === "connected" ? "clean" : saveState} onSave={readOnly || connection === "connected" ? undefined : save} onBack={() => router.push("/projects")} onPersistentChange={readOnly || connection === "connected" ? undefined : () => setSaveState((state) => state === "saving" ? state : "dirty")} staleConflict={staleConflict} onReloadServerVersion={reload} readOnly={readOnly} collaboration={{ connection, revision: project.revision, presence, onSelection: (selectionId) => realtimeRef.current?.presence(project.id, { selectionId, activity: true }), onCursor: (cursor) => realtimeRef.current?.presence(project.id, { cursor }), onEditing: (editingElementId) => realtimeRef.current?.presence(project.id, { editingElementId, activity: true }), onResync: () => void reload() }} />{readOnly && <Alert severity="info">Acceso de solo lectura.</Alert>}{staleConflict && <Alert severity="warning">El proyecto tiene una versión más reciente en el servidor.</Alert>}</>;
}

export default function PersistedWorkspacePage() { return <Suspense><ProtectedPage><PersistedWorkspace /></ProtectedPage></Suspense>; }
