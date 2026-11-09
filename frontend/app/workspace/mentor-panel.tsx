"use client";

import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import type { MentorQueryResponse } from "../auth/api";

export function MentorPanel({ projectName, onQuery }: Readonly<{ projectName: string; onQuery: (question: string) => Promise<MentorQueryResponse> }>) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<MentorQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmed = question.trim();

  async function submit() {
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await onQuery(trimmed));
    } catch {
      setError("No fue posible consultar al Mentor IA. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined" aria-label="Mentor IA">
      <CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Mentor IA</Typography>
            <Typography variant="body2" color="text.secondary">Consulta sobre el modelo UML vigente de {projectName}.</Typography>
          </Box>
          <TextField label="Consulta" value={question} onChange={(event) => setQuestion(event.target.value)} inputProps={{ maxLength: 500 }} multiline minRows={2} disabled={loading} />
          <Box><Button variant="contained" onClick={() => void submit()} disabled={!trimmed || loading}>{loading ? <CircularProgress size={20} color="inherit" aria-label="Consultando Mentor IA" /> : "Consultar"}</Button></Box>
          {error && <Alert severity="error">{error}</Alert>}
          {result && <Alert severity={result.grounded ? "success" : "info"}>{result.answer}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}
