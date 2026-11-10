"use client";

import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import type { MentorQueryResponse, UmlAnalysisFocus, UmlAnalysisResponse } from "../auth/api";
import { MentorHistorySection, type MentorHistoryLoader } from "./mentor-history-section";
import { UmlAnalysisSection, type UmlAnalysisSelection } from "./uml-analysis-section";

// Optional CU-2P-04 section ("Explicar"); without it the panel is exactly the CU-2P-01 free query.
export type MentorPanelAnalysis = Readonly<{ selection: UmlAnalysisSelection | null; onAnalyze: (focus: UmlAnalysisFocus) => Promise<UmlAnalysisResponse> }>;
// Optional CU-2P-07 section. `projectKey` identifies the project: when it changes the section starts from scratch.
export type MentorPanelHistory = Readonly<{ projectKey: string; onLoad: MentorHistoryLoader }>;

export function MentorPanel({ projectName, onQuery, analysis, history }: Readonly<{ projectName: string; onQuery: (question: string) => Promise<MentorQueryResponse>; analysis?: MentorPanelAnalysis; history?: MentorPanelHistory }>) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<MentorQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumped after each successful query, so an open (or already loaded) history picks up the new interaction.
  const [interactionVersion, setInteractionVersion] = useState(0);
  const trimmed = question.trim();

  async function submit() {
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await onQuery(trimmed));
      setInteractionVersion((version) => version + 1);
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
          {analysis && <Divider />}
          {analysis && <UmlAnalysisSection selection={analysis.selection} onAnalyze={analysis.onAnalyze} />}
          {history && <Divider />}
          {history && <MentorHistorySection key={history.projectKey} onLoad={history.onLoad} refreshKey={interactionVersion} />}
        </Stack>
      </CardContent>
    </Card>
  );
}
