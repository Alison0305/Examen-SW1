"use client";

import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";
import { useRef, useState } from "react";
import type { MentorQueryResponse, MentorRecommendationResponse, UmlAnalysisFocus, UmlAnalysisResponse } from "../auth/api";
import { MentorHistorySection, type MentorHistoryLoader } from "./mentor-history-section";
import { MentorProposalCard, MentorProposalFeedbackAlert, useMentorProposalFlow, type MentorProposalActions } from "./mentor-proposal-section";
import { UmlAnalysisSection, type UmlAnalysisSelection } from "./uml-analysis-section";

// Optional CU-2P-04 section ("Explicar"); without it the panel is exactly the CU-2P-01 free query.
export type MentorPanelAnalysis = Readonly<{ selection: UmlAnalysisSelection | null; onAnalyze: (focus: UmlAnalysisFocus) => Promise<UmlAnalysisResponse> }>;
// Optional CU-2P-07 section. `projectKey` identifies the project: when it changes the section starts from scratch.
export type MentorPanelHistory = Readonly<{ projectKey: string; onLoad: MentorHistoryLoader }>;

// CU-2P-06: `proposals` is passed only to users who can edit (never to VIEWER). Without it there is no way to start a
// UML change from the panel, and queries and recommendations stay exactly as before (read only).
export function MentorPanel({ projectName, onQuery, onRecommend, analysis, proposals, history }: Readonly<{ projectName: string; onQuery: (question: string) => Promise<MentorQueryResponse>; onRecommend?: (question: string) => Promise<MentorRecommendationResponse>; analysis?: MentorPanelAnalysis; proposals?: MentorProposalActions; history?: MentorPanelHistory }>) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<MentorQueryResponse | null>(null);
  const [recommendation, setRecommendation] = useState<MentorRecommendationResponse | null>(null);
  // The user's own request that produced the recommendation (CU-2P-05 → CU-2P-06 handoff, see proposeFromRecommendation).
  const [recommendationQuestion, setRecommendationQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOperation, setLoadingOperation] = useState<"query" | "recommendation" | null>(null);
  const activeRequest = useRef(false);
  // Bumped after each successful query and each recorded recommendation, so an open (or already loaded) history picks
  // up the new interaction. Local invalidation only: no realtime, no polling.
  const [interactionVersion, setInteractionVersion] = useState(0);
  const proposalFlow = useMentorProposalFlow(proposals);
  const trimmed = question.trim();
  const creatingProposal = proposalFlow.state.phase === "creating";
  const loading = loadingOperation !== null || creatingProposal;

  async function submit() {
    if (!trimmed || activeRequest.current) return;
    activeRequest.current = true;
    setLoadingOperation("query");
    setError(null);
    setResult(null);
    setRecommendation(null);
    try {
      setResult(await onQuery(trimmed));
      setInteractionVersion((version) => version + 1);
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
    const asked = trimmed;
    try {
      const response = await recommendRequest(asked);
      setRecommendation(response);
      setRecommendationQuestion(asked);
      // CU-2P-05 records every recommendation it returns with needsClarification = false; a clarification
      // (needsClarification = true) is returned without being recorded, so there is nothing new in the history.
      if (!response.needsClarification) setInteractionVersion((version) => version + 1);
    } catch {
      setError("No fue posible solicitar una recomendación técnica. Intenta nuevamente.");
    } finally {
      activeRequest.current = false;
      setLoadingOperation(null);
    }
  }

  // Explicit UML-change request: only this button uses the proposals endpoint; queries never become proposals.
  async function propose() {
    if (!trimmed || !proposals || activeRequest.current) return;
    setError(null);
    setResult(null);
    setRecommendation(null);
    await proposalFlow.create(trimmed);
  }

  // CU-2P-05 → CU-2P-06: a recommendation that requires a UML change (and needs no clarification) may start a proposal,
  // only on an explicit click and only for users who can edit. The instruction is the user's own request that the
  // recommendation answered: natural text, no parsing and no internal data. The recommendation's alternatives are not
  // reused because they may omit the type ("No se infiere tipo…"), which the model would then have to invent. From
  // here on it is exactly the CU-2P-06 flow: same endpoint, card, confirmation, errors and apply.
  const proposalInstruction = proposals && recommendation?.requiresUmlChange === true && !recommendation.needsClarification ? recommendationQuestion : null;
  async function proposeFromRecommendation() {
    if (!proposalInstruction || activeRequest.current) return;
    setError(null);
    await proposalFlow.create(proposalInstruction);
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
            {proposals && <Button variant="outlined" onClick={() => void propose()} disabled={!trimmed || loading}>{creatingProposal ? <CircularProgress size={20} color="inherit" aria-label="Generando propuesta UML" /> : "Proponer cambio UML"}</Button>}
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {proposals && proposalFlow.state.phase === "idle" && proposalFlow.state.feedback && <MentorProposalFeedbackAlert feedback={proposalFlow.state.feedback} />}
          {proposals && proposalFlow.state.phase === "ready" && <MentorProposalCard state={proposalFlow.state} onApply={() => void proposalFlow.apply()} onReject={() => void proposalFlow.reject()} onCancel={proposalFlow.cancel} />}
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
              {proposalInstruction && <Box>
                <Typography variant="body2" color="text.secondary">Se enviará tu consulta como instrucción: «{proposalInstruction}». El diagrama no cambia hasta que confirmes la propuesta.</Typography>
                <Button size="small" variant="outlined" sx={{ mt: 0.5 }} onClick={() => void proposeFromRecommendation()} disabled={loading}>Generar propuesta UML</Button>
              </Box>}
            </Stack>
          </Alert>}
          {history && <Divider />}
          {history && <MentorHistorySection key={history.projectKey} onLoad={history.onLoad} refreshKey={interactionVersion} />}
        </Stack>
      </CardContent>
    </Card>
  );
}
