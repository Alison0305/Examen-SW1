"use client";

import { Alert, Box, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type ApiConnectionState = "checking" | "available" | "unavailable";

export async function checkApiHealth(apiBaseUrl = API_BASE_URL, fetcher = fetch): Promise<boolean> {
  try {
    const response = await fetcher(`${apiBaseUrl}/health`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export function ApiStatus({ apiBaseUrl = API_BASE_URL }: Readonly<{ apiBaseUrl?: string }>) {
  const [state, setState] = useState<ApiConnectionState>("checking");

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      const isAvailable = await checkApiHealth(apiBaseUrl);

      if (active) {
        setState(isAvailable ? "available" : "unavailable");
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  const isAvailable = state === "available";
  const isUnavailable = state === "unavailable";

  return (
    <Box component="main" sx={{ minHeight: "100vh", py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Card variant="outlined" sx={{ boxShadow: "0 16px 40px rgba(15, 76, 129, 0.12)" }}>
          <CardContent>
            <Stack spacing={3}>
              <Stack spacing={1}>
                <Typography component="h1" variant="h4">
                  Base del proyecto
                </Typography>
                <Typography color="text.secondary" variant="body1">
                  CU-00 verifica que el frontend Next.js consulta el backend NestJS/Fastify.
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center">
                <Typography component="span" fontWeight={600}>
                  Estado:
                </Typography>
                {state === "checking" && <Chip label="Comprobando API" color="default" />}
                {isAvailable && <Chip label="API disponible" color="success" />}
                {isUnavailable && <Chip label="API no disponible" color="error" />}
              </Stack>

              {isAvailable && <Alert severity="success">API disponible</Alert>}
              {isUnavailable && <Alert severity="error">API no disponible</Alert>}

              <Typography color="text.secondary" variant="body2">
                Endpoint consultado: {apiBaseUrl}/health
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
