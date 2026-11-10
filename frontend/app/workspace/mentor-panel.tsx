"use client";

import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";
import { useRef, useState } from "react";
import type { MentorQueryResponse, MentorRecommendationResponse, UmlAnalysisFocus, UmlAnalysisResponse } from "../auth/api";
import { UmlAnalysisSection, type UmlAnalysisSelection } from "./uml-analysis-section";

// Optional CU-2P-04 section ("Explicar"); without it the panel is exactly the CU-2P-01 free query.
export type MentorPanelAnalysis = Readonly<{ selection: UmlAnalysisSelection | null; onAnalyze: (focus: UmlAnalysisFocus) => Promise<UmlAnalysisResponse> }>;

export function MentorPanel({ projectName, onQuery, onRecommend, analysis }: Readonly<{ projectName: string; onQuery: (question: string) => Promise<MentorQueryResponse>; onRecommend?: (question: string) => Promise<MentorRecommendationResponse>; analysis?: MentorPanelAnalysis }>) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<MentorQueryResponse | null>(null);
  const [recommendation, setRecommendation] = useState<MentorRecommendationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOperation, setLoadingOperation] = useState<"query" | "recommendation" | null>(null);
  const activeRequest = useRef(false);
  const trimmed = question.trim();
  const loading = loadingOperation !== null;

  async function submit() {
    if (!trimmed || activeRequest.current) return;
    activeRequest.current = true;
    setLoadingOperation("query");
    setError(null);
    setResult(null);
    setRecommendation(null);
    try {
      setResult(await onQuery(trimmed));
    } catch {
      setError("No fue posible consultar al Mentor IA. Intenta nuevamente.");
    } finally {
      activeRequest.current = false;
      setLoadingOperation(null);
    }
  }

  async function recommend() {
    const recommendRequest = onRecommend;
    if (!trimmed || !recommendRequest || activeRequest.current) return;
    activeRequest.current = true;
    setLoadingOperation("recommendation");
    setError(null);
    setResult(null);
    try {
      setRecommendation(await recommendRequest(trimmed));
    } catch {
      setError("No fue posible solicitar una recomendación técnica. Intenta nuevamente.");
    } finally {
      activeRequest.current = false;
      setLoadingOperation(null);
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
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => void submit()} disabled={!trimmed || loading}>{loadingOperation === "query" ? <CircularProgress size={20} color="inherit" aria-label="Consultando Mentor IA" /> : "Consultar"}</Button>
            {onRecommend && <Button variant="outlined" onClick={() => void recommend()} disabled={!trimmed || loading}>{loadingOperation === "recommendation" ? <CircularProgress size={20} color="inherit" aria-label="Generando recomendación técnica" /> : "Recomendación técnica"}</Button>}
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {result && <Alert severity={result.grounded ? "success" : "info"}>{result.answer}</Alert>}
          {analysis && <Divider />}
          {analysis && <UmlAnalysisSection selection={analysis.selection} onAnalyze={analysis.onAnalyze} />}
          {recommendation && <Alert severity={recommendation.needsClarification ? "info" : "success"}>
            <Stack spacing={0.75}>
              <Typography fontWeight={700}>Recomendación técnica (solo lectura)</Typography>
              <Typography><strong>Problema:</strong> {recommendation.problem}</Typography>
              {recommendation.alternatives.length > 0 && <Typography><strong>Alternativas:</strong> {recommendation.alternatives.join(" · ")}</Typography>}
              <Typography><strong>Razón:</strong> {recommendation.rationale}</Typography>
              <Typography><strong>Limitaciones:</strong> {recommendation.limitations}</Typography>
              <Typography><strong>¿Implica cambio UML?</strong> {recommendation.requiresUmlChange ? "Sí, como recomendación futura." : "No."}</Typography>
              {recommendation.needsClarification && <Typography><strong>Se necesita aclaración:</strong> aporta el contexto solicitado antes de continuar.</Typography>}
            </Stack>
          </Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}
