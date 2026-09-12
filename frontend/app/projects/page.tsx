"use client";

import { Alert, AppBar, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Toolbar, Typography } from "@mui/material";
import { createProjectDocument } from "@examen-sw1/uml-core";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "../auth/protected-page";
import { ApiError, createApiClient, type ApiClient, type ProjectSummary } from "../auth/api";
import { useSession } from "../auth/session";
import { ProjectAccessDialog } from "./project-access-dialog";

const roleLabel = (role: ProjectSummary["accessRole"]) => ({ OWNER: "Propietario", EDITOR: "Editor", VIEWER: "Lector" })[role];

function ProjectsContent() {
  const { user, logout } = useSession();
  const apiRef = useRef<ApiClient | null>(null);
  const api = apiRef.current ?? createApiClient({ getToken: () => sessionStorage.getItem("examen-sw1.access-token"), onUnauthorized: logout });
  apiRef.current = api;
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<ProjectSummary | null>(null);
  const load = async () => { setError(null); try { setProjects(await api.listProjects()); } catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) setError("No fue posible cargar los proyectos."); } };
  useEffect(() => { void load(); }, []);
  const valid = name.trim().length > 0 && name.trim().length <= 100;
  const create = async () => { if (!valid) return; try { const project = await api.createProject(name.trim(), createProjectDocument()); router.push(`/projects/${project.id}/workspace`); } catch { setError("No fue posible crear el proyecto."); } };
  const rename = async () => { if (!editing || !valid) return; try { const updated = await api.renameProject(editing.id, name.trim()); setProjects((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? null); setEditing(null); } catch { setError("No fue posible renombrar el proyecto."); } };
  const remove = async () => { if (!deleting) return; try { await api.deleteProject(deleting.id); setProjects((items) => items?.filter((item) => item.id !== deleting.id) ?? null); setDeleting(null); } catch { setError("No fue posible eliminar el proyecto."); } };
  return <Box component="main" sx={{ minHeight: "100vh" }}><AppBar position="static" elevation={0}><Toolbar sx={{ justifyContent: "space-between" }}><Typography fontWeight={700}>UML Studio</Typography><Button color="inherit" onClick={logout}>Cerrar sesión</Button></Toolbar></AppBar><Container maxWidth="md" sx={{ py: 5 }}><Stack spacing={3}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}><Box><Typography variant="h3" component="h1">Tus proyectos</Typography><Typography color="text.secondary">Sesión activa como {user?.email}.</Typography></Box><Button variant="contained" onClick={() => { setName(""); setCreating(true); }}>Nuevo proyecto</Button></Stack>{error && <Alert severity="error" action={<Button onClick={() => void load()}>Reintentar</Button>}>{error}</Alert>}{projects === null && !error && <Box sx={{ display: "grid", placeItems: "center", py: 8 }}><CircularProgress aria-label="Cargando proyectos" /></Box>}{projects?.length === 0 && <Card><CardContent><Typography>No tienes proyectos todavía.</Typography></CardContent><CardActions><Button onClick={() => setCreating(true)}>Nuevo proyecto</Button></CardActions></Card>}{projects?.map((project) => <Card key={project.id}><CardContent><Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="h6">{project.name}</Typography><Chip label={roleLabel(project.accessRole)} size="small" /></Stack><Typography color="text.secondary">Última modificación: {new Date(project.updatedAt).toLocaleString()}</Typography></CardContent><CardActions><Button onClick={() => router.push(`/projects/${project.id}/workspace`)}>Abrir</Button>{project.accessRole === "OWNER" && <><Button onClick={() => { setName(project.name); setEditing(project); }}>Renombrar</Button><Button onClick={() => setSharing(project)}>Compartir</Button><Button color="error" onClick={() => setDeleting(project)}>Eliminar</Button></>}</CardActions></Card>)}</Stack></Container><Dialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }}><DialogTitle>{editing ? "Renombrar proyecto" : "Nuevo proyecto"}</DialogTitle><DialogContent><TextField autoFocus fullWidth label="Nombre" value={name} onChange={(event) => setName(event.target.value)} error={name.length > 0 && !valid} helperText="Entre 1 y 100 caracteres." sx={{ mt: 1 }} /></DialogContent><DialogActions><Button onClick={() => { setCreating(false); setEditing(null); }}>Cancelar</Button><Button variant="contained" disabled={!valid} onClick={() => void (editing ? rename() : create())}>{editing ? "Guardar" : "Crear"}</Button></DialogActions></Dialog><Dialog open={!!deleting} onClose={() => setDeleting(null)}><DialogTitle>Eliminar proyecto</DialogTitle><DialogContent><Typography>Esta acción no se puede deshacer.</Typography></DialogContent><DialogActions><Button onClick={() => setDeleting(null)}>Cancelar</Button><Button color="error" onClick={() => void remove()}>Eliminar</Button></DialogActions></Dialog><ProjectAccessDialog project={sharing} api={api} onClose={() => setSharing(null)} /></Box>;
}

export default function ProjectsPage() { return <Suspense><ProtectedPage><ProjectsContent /></ProtectedPage></Suspense>; }
