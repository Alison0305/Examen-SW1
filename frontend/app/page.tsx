"use client";

import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useSession } from "./auth/session";

export default function Home() {
  const { status } = useSession();
  const destination = status === "authenticated" ? "/projects" : "/register";
  return (
    <Box component="main" sx={{ minHeight: "100vh", py: { xs: 3, md: 7 } }}>
      <Container maxWidth="lg">
        <Stack spacing={{ xs: 5, md: 8 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
            <Typography fontWeight={800} color="primary.main">UML Studio</Typography>
            <Button component={Link} href={status === "authenticated" ? "/projects" : "/login"} variant="text">{status === "authenticated" ? "Mis proyectos" : "Iniciar sesión"}</Button>
          </Stack>
          <Paper elevation={0} sx={{ p: { xs: 3, sm: 5, md: 8 }, border: "1px solid", borderColor: "divider" }}>
            <Stack spacing={3} maxWidth="md">
              <Typography component="h1" variant="h2" sx={{ fontSize: { xs: "2.5rem", md: "4.25rem" }, fontWeight: 800, lineHeight: 1.05 }}>
                Diseña modelos UML con una base técnica clara.
              </Typography>
              <Typography variant="h6" color="text.secondary">Modela clases, relaciones y decisiones de diseño en un workspace pensado para trabajo académico y técnico.</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button component={Link} href={destination} variant="contained" size="large">{status === "authenticated" ? "Ir a proyectos" : "Crear cuenta"}</Button>
                {status !== "authenticated" && <Button component={Link} href="/login" variant="outlined" size="large">Iniciar sesión</Button>}
              </Stack>
            </Stack>
          </Paper>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            {[["Modelo canónico", "Separa la semántica UML de la disposición visual."], ["Edición controlada", "Mantiene las mutaciones mediante Command Bus."], ["Trabajo responsive", "Accede al flujo principal desde pantallas pequeñas."]].map(([title, description]) => (
              <Paper key={title} variant="outlined" sx={{ p: 3, flex: 1 }}><Typography variant="h6">{title}</Typography><Typography color="text.secondary">{description}</Typography></Paper>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
