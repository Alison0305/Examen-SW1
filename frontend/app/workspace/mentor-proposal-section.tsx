"use client";

import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { ApiError, type MentorProposalDiagnostic, type MentorProposalDiffLine, type MentorProposalResponse, type MentorProposalStatus } from "../auth/api";

// CU-2P-06: review of a UML change proposed by the Mentor. Creating, viewing, cancelling or rejecting a proposal never
// touches the diagram; only the explicit "Aplicar" calls the apply endpoint, and the diagram then changes through the
// authoritative realtime ACK handled by the workspace page (never by a local mutation here).

export type MentorProposalActions = Readonly<{
  create: (instruction: string) => Promise<MentorProposalResponse>;
  get: (proposalId: string) => Promise<MentorProposalResponse>;
  apply: (proposalId: string) => Promise<MentorProposalResponse>;
  reject: (proposalId: string) => Promise<MentorProposalResponse>;
  // Called once with the APPLIED proposal; the page decides how the diagram catches up (realtime or reload).
  onApplied?: (proposal: MentorProposalResponse) => void;
}>;

export type MentorProposalFeedback = Readonly<{ message: string; diagnostics: readonly MentorProposalDiagnostic[] }>;

export type MentorProposalState =
  | Readonly<{ phase: "idle"; feedback?: MentorProposalFeedback }>
  | Readonly<{ phase: "creating" }>
  | Readonly<{ phase: "ready"; proposal: MentorProposalResponse; action: "applying" | "rejecting" | null; stale: boolean; feedback?: MentorProposalFeedback }>;

export const STALE_PROPOSAL_MESSAGE = "La propuesta fue creada sobre una versión anterior del diagrama. Genera una nueva propuesta antes de aplicarla.";
export const MODEL_UNAVAILABLE_MESSAGE = "El asistente local no está disponible en este momento.";

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_PROPOSAL: "La propuesta no supera la validación del modelo UML.",
  UNSUPPORTED_OPERATION: "Por ahora solo se puede proponer agregar un atributo a una clase existente, por ejemplo: «Agrega el atributo teléfono de tipo String a Cliente».",
  ELEMENT_NOT_FOUND: "La clase indicada no existe o es ambigua en el diagrama actual.",
  UNKNOWN_TYPE: "El tipo indicado no es un tipo UML soportado.",
  STALE_PROPOSAL: STALE_PROPOSAL_MESSAGE,
  PROPOSAL_ALREADY_APPLIED: "La propuesta ya fue aplicada.",
  PROPOSAL_REJECTED: "La propuesta fue rechazada y ya no puede aplicarse.",
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: "La instrucción debe tener entre 1 y 500 caracteres.",
  403: "No tienes permiso para modificar este modelo.",
  404: "El proyecto o la propuesta ya no están disponibles.",
  503: MODEL_UNAVAILABLE_MESSAGE,
};

// Only fixed, user-facing texts: never the raw server message, a stack trace or a JSON body.
export function mentorProposalFeedback(error: unknown): MentorProposalFeedback {
  if (error instanceof ApiError) {
    const message = (error.code ? CODE_MESSAGES[error.code] : undefined) ?? STATUS_MESSAGES[error.status];
    if (message) return { message, diagnostics: error.code === "INVALID_PROPOSAL" ? error.diagnostics : [] };
  }
  return { message: "No fue posible completar la propuesta. Intenta nuevamente.", diagnostics: [] };
}

const codeOf = (error: unknown): string | undefined => (error instanceof ApiError ? error.code : undefined);

export function useMentorProposalFlow(actions: MentorProposalActions | undefined) {
  const [state, setState] = useState<MentorProposalState>({ phase: "idle" });
  // Guards against double submission (double click) independently of React re-renders.
  const inFlight = useRef(false);

  async function create(instruction: string): Promise<void> {
    if (!actions || inFlight.current || !instruction.trim()) return;
    inFlight.current = true;
    setState({ phase: "creating" });
    try {
      setState({ phase: "ready", proposal: await actions.create(instruction.trim()), action: null, stale: false });
    } catch (error) {
      setState({ phase: "idle", feedback: mentorProposalFeedback(error) });
    } finally {
      inFlight.current = false;
    }
  }

  async function resolve(action: "applying" | "rejecting"): Promise<void> {
    if (!actions || inFlight.current || state.phase !== "ready" || state.proposal.status !== "PENDING") return;
    if (action === "applying" && state.stale) return;
    const current = state;
    inFlight.current = true;
    setState({ ...current, action, feedback: undefined });
    try {
      const resolved = await (action === "applying" ? actions.apply : actions.reject)(current.proposal.id);
      setState({ phase: "ready", proposal: resolved, action: null, stale: false });
      if (action === "applying" && resolved.status === "APPLIED") actions.onApplied?.(resolved);
    } catch (error) {
      const code = codeOf(error);
      let proposal = current.proposal;
      // Someone else resolved it first: show its real state instead of a stale PENDING card.
      if (code === "PROPOSAL_ALREADY_APPLIED" || code === "PROPOSAL_REJECTED") proposal = await actions.get(proposal.id).catch(() => proposal);
      setState({ phase: "ready", proposal, action: null, stale: current.stale || code === "STALE_PROPOSAL", feedback: mentorProposalFeedback(error) });
    } finally {
      inFlight.current = false;
    }
  }

  // Local only: hides the preview. No request, the proposal stays PENDING on the server and the diagram is untouched.
  function cancel(): void {
    if (inFlight.current) return;
    setState({ phase: "idle" });
  }

  return { state, create, apply: () => resolve("applying"), reject: () => resolve("rejecting"), cancel };
}

const STATUS_LABELS: Readonly<Record<MentorProposalStatus, string>> = { PENDING: "Pendiente", APPLIED: "Aplicada", REJECTED: "Rechazada" };
const DIFF_PREFIX: Readonly<Record<MentorProposalDiffLine["kind"], string>> = { added: "+", removed: "−", changed: "~" };

function Diagnostics({ diagnostics }: Readonly<{ diagnostics: readonly MentorProposalDiagnostic[] }>) {
  if (diagnostics.length === 0) return null;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }} aria-label="Diagnósticos de la propuesta">
      {diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}><Typography variant="body2">{diagnostic.message}</Typography></li>)}
    </Box>
  );
}

export function MentorProposalFeedbackAlert({ feedback }: Readonly<{ feedback: MentorProposalFeedback }>) {
  return (
    <Alert severity="error">
      <Stack spacing={0.5}>
        <Typography variant="body2">{feedback.message}</Typography>
        <Diagnostics diagnostics={feedback.diagnostics} />
      </Stack>
    </Alert>
  );
}

// Shows only the public, name-based proposal: operation, target, change, deterministic diff, diagnostics, base
// revision and status. Never ids, commands, receipts, prompts or raw JSON.
export function MentorProposalCard({ state, onApply, onReject, onCancel }: Readonly<{ state: Extract<MentorProposalState, { phase: "ready" }>; onApply: () => void; onReject: () => void; onCancel: () => void }>) {
  const { proposal, action, stale, feedback } = state;
  const pending = proposal.status === "PENDING";
  const busy = action !== null;
  const { change, target } = proposal.operation;
  return (
    <Card variant="outlined" aria-label="Propuesta IA">
      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" fontWeight={700}>Propuesta IA</Typography>
            <Chip size="small" label={`Estado: ${STATUS_LABELS[proposal.status]}`} color={proposal.status === "APPLIED" ? "success" : proposal.status === "REJECTED" ? "default" : "warning"} />
          </Stack>
          <Typography fontWeight={600}>Agregar atributo</Typography>
          <Typography variant="body2">Clase: {target.className}</Typography>
          <Typography variant="body2">Atributo: {change.attributeName}</Typography>
          <Typography variant="body2">Tipo: {change.attributeType}</Typography>
          {change.multiplicity && <Typography variant="body2">Multiplicidad: {change.multiplicity}</Typography>}
          <Typography variant="body2" fontWeight={600}>Cambios:</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontFamily: "monospace" }} aria-label="Cambios propuestos">
            {proposal.preview.diff.map((line, index) => <li key={`${line.kind}-${line.label}-${index}`}>{`${DIFF_PREFIX[line.kind]} ${line.label}`}</li>)}
          </Box>
          <Diagnostics diagnostics={proposal.preview.diagnostics} />
          <Typography variant="caption" color="text.secondary">Revisión base: {proposal.baseRevision}</Typography>
          {pending && !feedback && <Alert severity="info">El diagrama no cambia hasta que pulses Aplicar.</Alert>}
          {proposal.status === "APPLIED" && <Alert severity="success">Propuesta aplicada.{proposal.resultingRevision !== undefined ? ` El modelo está en la revisión ${proposal.resultingRevision}.` : ""}</Alert>}
          {proposal.status === "REJECTED" && <Alert severity="info">Propuesta rechazada. El diagrama no cambió.</Alert>}
          {feedback && <MentorProposalFeedbackAlert feedback={feedback} />}
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <Button onClick={onCancel} disabled={busy}>{pending ? "Cancelar" : "Cerrar"}</Button>
            <Button color="error" variant="outlined" onClick={onReject} disabled={!pending || busy}>{action === "rejecting" ? <CircularProgress size={20} color="inherit" aria-label="Rechazando propuesta" /> : "Rechazar"}</Button>
            <Button variant="contained" onClick={onApply} disabled={!pending || busy || stale || !proposal.preview.valid}>{action === "applying" ? <CircularProgress size={20} color="inherit" aria-label="Aplicando propuesta" /> : "Aplicar"}</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
