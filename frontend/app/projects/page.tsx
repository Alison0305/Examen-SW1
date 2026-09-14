"use client";

import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { createProjectDocument } from "@examen-sw1/uml-core";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "../auth/protected-page";
import {
  ApiError,
  createApiClient,
  type ApiClient,
  type PendingProjectInvitation,
  type ProjectSummary,
} from "../auth/api";
import { useSession } from "../auth/session";
import { ProjectAccessDialog } from "./project-access-dialog";

const roleLabel = (role: ProjectSummary["accessRole"]) =>
  ({ OWNER: "Propietario", EDITOR: "Editor", VIEWER: "Lector" })[role];

function InvitationsDialog({
  api,
  open,
  onClose,
  onResolved,
}: Readonly<{
  api: ApiClient;
  open: boolean;
  onClose: () => void;
  onResolved: (accepted: boolean) => Promise<void>;
}>) {
  const [items, setItems] = useState<PendingProjectInvitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      setItems(await api.listMyInvitations());
    } catch {
      setError("No fue posible cargar las invitaciones.");
    }
  };
  useEffect(() => {
    if (open) void load();
  }, [open]);
  const resolve = async (item: PendingProjectInvitation, accept: boolean) => {
    setAction(item.id);
    setError(null);
    try {
      if (accept) {
        await api.acceptInvitationById(item.id);
        await onResolved(true);
      } else await api.rejectInvitationById(item.id);
      if (!accept) await onResolved(false);
      await load();
    } catch {
      setError("No fue posible resolver la invitación.");
    } finally {
      setAction(null);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Invitaciones pendientes</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && (
            <Alert
              severity="error"
              action={<Button onClick={() => void load()}>Reintentar</Button>}
            >
              {error}
            </Alert>
          )}
          {items === null && !error && (
            <CircularProgress aria-label="Cargando invitaciones" />
          )}
          {items?.length === 0 && (
            <Typography>No tienes invitaciones pendientes.</Typography>
          )}
          {items?.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardContent>
                <Typography variant="h6">{item.project.name}</Typography>
                <Typography>Rol: {roleLabel(item.role)}</Typography>
                <Typography color="text.secondary">
                  Invitado por: {item.invitedBy.email}
                </Typography>
                <Typography color="text.secondary">
                  {new Date(item.createdAt).toLocaleString()}
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  disabled={action === item.id}
                  onClick={() => void resolve(item, true)}
                >
                  Aceptar
                </Button>
                <Button
                  color="error"
                  disabled={action === item.id}
                  onClick={() => void resolve(item, false)}
                >
                  Rechazar
                </Button>
              </CardActions>
            </Card>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

function ProjectsContent() {
  const { user, logout } = useSession();
  const apiRef = useRef<ApiClient | null>(null);
  const api =
    apiRef.current ??
    createApiClient({
      getToken: () => sessionStorage.getItem("examen-sw1.access-token"),
      onUnauthorized: logout,
    });
  apiRef.current = api;
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<ProjectSummary | null>(null);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [invitationCount, setInvitationCount] = useState<number | null>(null);
  const load = async () => {
    setError(null);
    try {
      setProjects(await api.listProjects());
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 401))
        setError("No fue posible cargar los proyectos.");
    }
  };
  const loadInvitations = async () => {
    try {
      setInvitationCount((await api.listMyInvitations()).length);
    } catch {
      setInvitationCount(0);
    }
  };
  useEffect(() => {
    void load();
    void loadInvitations();
  }, []);
  const valid = name.trim().length > 0 && name.trim().length <= 100;
  const create = async () => {
    if (!valid) return;
    try {
      const project = await api.createProject(
        name.trim(),
        createProjectDocument(),
      );
      router.push(`/projects/${project.id}/workspace`);
    } catch {
      setError("No fue posible crear el proyecto.");
    }
  };
  const rename = async () => {
    if (!editing || !valid) return;
    try {
      const updated = await api.renameProject(editing.id, name.trim());
      setProjects(
        (items) =>
          items?.map((item) => (item.id === updated.id ? updated : item)) ??
          null,
      );
      setEditing(null);
    } catch {
      setError("No fue posible renombrar el proyecto.");
    }
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await api.deleteProject(deleting.id);
      setProjects(
        (items) => items?.filter((item) => item.id !== deleting.id) ?? null,
      );
      setDeleting(null);
    } catch {
      setError("No fue posible eliminar el proyecto.");
    }
  };
  return (
    <Box component="main" sx={{ minHeight: "100vh" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Typography fontWeight={700}>UML Studio</Typography>
          <Button color="inherit" onClick={logout}>
            Cerrar sesión
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            gap={2}
          >
            <Box>
              <Typography variant="h3" component="h1">
                Tus proyectos
              </Typography>
              <Typography color="text.secondary">
                Sesión activa como {user?.email}.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setInvitationsOpen(true)}>
                <Badge badgeContent={invitationCount || undefined} color="error" invisible={!invitationCount}>
                  Invitaciones
                </Badge>
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setName("");
                  setCreating(true);
                }}
              >
                Nuevo proyecto
              </Button>
            </Stack>
          </Stack>
          {error && (
            <Alert
              severity="error"
              action={<Button onClick={() => void load()}>Reintentar</Button>}
            >
              {error}
            </Alert>
          )}
          {projects === null && !error && (
            <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
              <CircularProgress aria-label="Cargando proyectos" />
            </Box>
          )}
          {projects?.length === 0 && (
            <Card>
              <CardContent>
                <Typography>No tienes proyectos todavía.</Typography>
              </CardContent>
              <CardActions>
                <Button onClick={() => setCreating(true)}>
                  Nuevo proyecto
                </Button>
              </CardActions>
            </Card>
          )}
          {projects?.map((project) => (
            <Card key={project.id}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" gap={1}>
                  <Typography variant="h6">{project.name}</Typography>
                  <Chip label={roleLabel(project.accessRole)} size="small" />
                </Stack>
                <Typography color="text.secondary">
                  Última modificación:{" "}
                  {new Date(project.updatedAt).toLocaleString()}
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  onClick={() =>
                    router.push(`/projects/${project.id}/workspace`)
                  }
                >
                  Abrir
                </Button>
                {project.accessRole === "OWNER" && (
                  <>
                    <Button
                      onClick={() => {
                        setName(project.name);
                        setEditing(project);
                      }}
                    >
                      Renombrar
                    </Button>
                    <Button onClick={() => setSharing(project)}>
                      Compartir
                    </Button>
                    <Button color="error" onClick={() => setDeleting(project)}>
                      Eliminar
                    </Button>
                  </>
                )}
              </CardActions>
            </Card>
          ))}
        </Stack>
      </Container>
      <Dialog
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <DialogTitle>
          {editing ? "Renombrar proyecto" : "Nuevo proyecto"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={name.length > 0 && !valid}
            helperText="Entre 1 y 100 caracteres."
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreating(false);
              setEditing(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disabled={!valid}
            onClick={() => void (editing ? rename() : create())}
          >
            {editing ? "Guardar" : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Eliminar proyecto</DialogTitle>
        <DialogContent>
          <Typography>Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button color="error" onClick={() => void remove()}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
      <ProjectAccessDialog
        project={sharing}
        api={api}
        onClose={() => setSharing(null)}
      />
      <InvitationsDialog
        api={api}
        open={invitationsOpen}
        onClose={() => setInvitationsOpen(false)}
        onResolved={async (accepted) => {
          await loadInvitations();
          if (accepted) await load();
        }}
      />
    </Box>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProtectedPage>
        <ProjectsContent />
      </ProtectedPage>
    </Suspense>
  );
}
