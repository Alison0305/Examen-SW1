"use client";

import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ApiError, createApiClient, type ApiClient, type ProjectInvitation } from "../../auth/api";
import { ProtectedPage } from "../../auth/protected-page";
import { useSession } from "../../auth/session";

function InviteContent() {
  const { logout } = useSession(); const router = useRouter(); const { token } = useParams<{ token: string }>();
  const apiRef = useRef<ApiClient | null>(null); const api = apiRef.current ?? createApiClient({ getToken: () => sessionStorage.getItem("examen-sw1.access-token"), onUnauthorized: logout }); apiRef.current = api;
  const [invitation, setInvitation] = useState<ProjectInvitation | null>(null); const [unavailable, setUnavailable] = useState(false); const [resolving, setResolving] = useState(false);
  useEffect(() => { void api.getInvitation(token).then(setInvitation).catch(() => setUnavailable(true)); }, [api, token]);
  const resolve = async (action: "accept" | "reject") => { setResolving(true); try { await (action === "accept" ? api.acceptInvitation(token) : api.rejectInvitation(token)); router.replace("/projects"); } catch (cause) { if (cause instanceof ApiError && cause.status === 404) setUnavailable(true); else setUnavailable(true); } finally { setResolving(false); } };
  return <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}><Paper sx={{ p: 4, width: "100%", maxWidth: 480 }}><Stack spacing={2}>{unavailable ? <Alert severity="error">La invitación no está disponible.</Alert> : !invitation ? <CircularProgress aria-label="Cargando invitación" /> : <><Typography variant="h4">Invitación a proyecto</Typography><Typography>Has sido invitado como {invitation.role === "EDITOR" ? "Editor" : "Lector"}.</Typography><Stack direction="row" spacing={1}><Button variant="contained" disabled={resolving} onClick={() => void resolve("accept")}>Aceptar</Button><Button disabled={resolving} onClick={() => void resolve("reject")}>Rechazar</Button></Stack></>}</Stack></Paper></Box>;
}
export default function InvitePage() { return <Suspense><ProtectedPage><InviteContent /></ProtectedPage></Suspense>; }
