"use client";

import { Alert, Box, Button, CircularProgress, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { safeReturnPath, useSession } from "./session";

export function AuthForm({ mode }: Readonly<{ mode: "login" | "register" }>) {
  const { status, login, register } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSubmitted = useRef(false);
  const isLogin = mode === "login";
  const title = isLogin ? "Iniciar sesión" : "Crear cuenta";

  useEffect(() => {
    if (status === "authenticated" && !hasSubmitted.current) {
      router.replace("/projects");
    }
  }, [router, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    hasSubmitted.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.replace(safeReturnPath(searchParams.get("returnTo")));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "No fue posible completar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: { xs: 2, sm: 3 } }}>
      <Paper component="section" elevation={2} sx={{ width: "100%", maxWidth: 440, p: { xs: 3, sm: 4 } }}>
        <Stack component="form" spacing={2.5} onSubmit={submit} noValidate>
          <Box>
            <Typography component="h1" variant="h4" fontWeight={700}>{title}</Typography>
            <Typography color="text.secondary">Accede a tus proyectos UML.</Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth />
          <TextField label="Contraseña" type="password" autoComplete={isLogin ? "current-password" : "new-password"} helperText={isLogin ? undefined : "Mínimo 8 caracteres"} value={password} onChange={(event) => setPassword(event.target.value)} required fullWidth />
          <Button type="submit" variant="contained" size="large" disabled={submitting || status === "loading"}>
            {submitting ? <CircularProgress size={22} color="inherit" aria-label="Enviando" /> : title}
          </Button>
          <Typography variant="body2" textAlign="center">
            {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
            <MuiLink component={Link} href={isLogin ? "/register" : "/login"}>{isLogin ? "Regístrate" : "Inicia sesión"}</MuiLink>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
