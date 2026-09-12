"use client";

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { ApiError, type ApiClient, type ProjectInvitation, type ProjectMemberRole, type ProjectSummary } from "../auth/api";

const roles: ProjectMemberRole[] = ["EDITOR", "VIEWER"];
const roleLabel = (role: ProjectMemberRole) => role === "EDITOR" ? "Editor" : "Lector";

export function ProjectAccessDialog({ project, api, onClose }: Readonly<{ project: ProjectSummary | null; api: ApiClient; onClose: () => void }>) {
  const [members, setMembers] = useState<Awaited<ReturnType<ApiClient["listMembers"]>> | null>(null);
  const [invitations, setInvitations] = useState<ProjectInvitation[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectMemberRole>("EDITOR");
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const load = async () => {
    if (!project) return;
    setError(null);
    try { const [nextMembers, nextInvitations] = await Promise.all([api.listMembers(project.id), api.listInvitations(project.id)]); setMembers(nextMembers); setInvitations(nextInvitations); }
    catch { setError("No fue posible cargar los accesos del proyecto."); }
  };
  useEffect(() => { setMembers(null); setInvitations(null); setEmail(""); setCopyMessage(null); void load(); }, [project?.id]);
  const message = (cause: unknown) => cause instanceof ApiError && cause.status === 409 ? "Ya existe una membresía o invitación pendiente para este email." : cause instanceof ApiError && cause.status === 400 ? "Revisa el email y el rol de la invitación." : "No fue posible completar la acción.";
  const invite = async () => {
    if (!project || !email.trim()) return;
    setError(null);
    try {
      const invitation = await api.createInvitation(project.id, email.trim(), role);
      const link = `${window.location.origin}/invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      setCopyMessage("Enlace temporal copiado al portapapeles."); setEmail(""); await load();
    } catch (cause) { setError(message(cause)); }
  };
  const changeMember = async (userId: string, nextRole: ProjectMemberRole) => { if (!project) return; try { const updated = await api.updateMember(project.id, userId, nextRole); setMembers((items) => items?.map((item) => item.userId === userId ? updated : item) ?? null); } catch (cause) { setError(message(cause)); } };
  const removeMember = async (userId: string) => { if (!project) return; try { await api.removeMember(project.id, userId); setMembers((items) => items?.filter((item) => item.userId !== userId) ?? null); } catch (cause) { setError(message(cause)); } };
  const revoke = async (id: string) => { if (!project) return; try { await api.revokeInvitation(project.id, id); setInvitations((items) => items?.map((item) => item.id === id ? { ...item, status: "REVOKED" } : item) ?? null); } catch (cause) { setError(message(cause)); } };
  return <Dialog open={Boolean(project)} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>Compartir {project?.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
    {error && <Alert severity="error">{error}</Alert>}{copyMessage && <Alert severity="success">{copyMessage}</Alert>}
    <Typography variant="subtitle2">Invitar persona</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth /><Select aria-label="Rol de invitación" value={role} onChange={(event) => setRole(event.target.value as ProjectMemberRole)}>{roles.map((item) => <MenuItem key={item} value={item}>{roleLabel(item)}</MenuItem>)}</Select><Button variant="contained" onClick={() => void invite()} disabled={!email.trim()}>Crear invitación</Button></Stack>
    <Typography variant="subtitle2">Miembros</Typography>{members === null ? <Typography>Cargando miembros...</Typography> : members.length === 0 ? <Typography color="text.secondary">No hay miembros.</Typography> : members.map((member) => <Stack key={member.userId} direction="row" spacing={1} alignItems="center"><Typography sx={{ flexGrow: 1 }}>{member.email}</Typography><Select size="small" aria-label={`Rol de ${member.email}`} value={member.role} onChange={(event) => void changeMember(member.userId, event.target.value as ProjectMemberRole)}>{roles.map((item) => <MenuItem key={item} value={item}>{roleLabel(item)}</MenuItem>)}</Select><Button color="error" onClick={() => void removeMember(member.userId)}>Quitar</Button></Stack>)}
    <Typography variant="subtitle2">Invitaciones</Typography>{invitations === null ? <Typography>Cargando invitaciones...</Typography> : invitations.length === 0 ? <Typography color="text.secondary">No hay invitaciones.</Typography> : invitations.map((invitation) => <Stack key={invitation.id} direction="row" spacing={1} alignItems="center"><Typography sx={{ flexGrow: 1 }}>{invitation.email} · {roleLabel(invitation.role)} · {invitation.status}</Typography>{invitation.status === "PENDING" && <Button color="error" onClick={() => void revoke(invitation.id)}>Revocar</Button>}</Stack>)}
  </Stack></DialogContent><DialogActions><Button onClick={onClose}>Cerrar</Button></DialogActions></Dialog>;
}
