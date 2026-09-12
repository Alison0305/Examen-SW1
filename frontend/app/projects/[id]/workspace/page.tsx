"use client";

import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ProtectedPage } from "../../../auth/protected-page";
import { ApiError, createApiClient, type ApiClient, type ProjectDetail } from "../../../auth/api";
import { useSession } from "../../../auth/session";
import { WorkspaceClient } from "../../../workspace/workspace-client";
import { resetWorkspaceStore, useWorkspaceStore } from "../../../workspace/workspace-store";

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
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.getProject(params.id).then((detail) => {
      resetWorkspaceStore(detail.document);
      setProject(detail);
      setSaveState("clean");
      setStaleConflict(false);
    }).catch((cause) => setError(cause instanceof ApiError && cause.status === 404 ? "Proyecto no encontrado o no disponible." : "No fue posible cargar el proyecto."));
  }, [api, params.id]);
  if (error) return <Box sx={{ p: 4 }}><Stack spacing={2}><Alert severity="error">{error}</Alert><Button onClick={() => router.push("/projects")}>Volver a proyectos</Button></Stack></Box>;
  if (!project) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress aria-label="Cargando proyecto" /></Box>;
  const readOnly = project?.accessRole === "VIEWER";
  const save = async () => {
    if (readOnly) return;
    if (saveState === "saving") return;
    setSaveState("saving");
    try {
      const updated = await api.saveProject(project.id, useWorkspaceStore.getState().document, project.revision);
      setProject(updated);
      setSaveState("clean");
      setStaleConflict(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setStaleConflict(true);
      if (!(cause instanceof ApiError && cause.status === 401)) setSaveState("dirty");
    }
  };
  const reload = async () => {
    if (saveState === "dirty" && !window.confirm("Los cambios locales se perderán.")) return;
    const detail = await api.getProject(project.id);
    resetWorkspaceStore(detail.document);
    setProject(detail);
    setSaveState("clean");
    setStaleConflict(false);
  };
  return <><WorkspaceClient projectName={project.name} saveState={saveState} onSave={readOnly ? undefined : save} onBack={() => router.push("/projects")} onPersistentChange={readOnly ? undefined : () => setSaveState((state) => state === "saving" ? state : "dirty")} staleConflict={staleConflict} onReloadServerVersion={reload} readOnly={readOnly} />{readOnly && <Alert severity="info">Acceso de solo lectura.</Alert>}{staleConflict && <Alert severity="warning">El proyecto tiene una versión más reciente en el servidor.</Alert>}</>;
}

export default function PersistedWorkspacePage() { return <Suspense><ProtectedPage><PersistedWorkspace /></ProtectedPage></Suspense>; }
