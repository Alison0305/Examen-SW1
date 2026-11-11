"use client";

import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Divider, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type MentorProposalHistoryList, type MentorProposalStatus, type ProjectChatAction, type ProjectChatMessage, type ProjectChatPage, type ProjectChatParams } from "../auth/api";
import { formatHistoryDate, MentorHistorySection, type MentorHistoryLoader, type MentorProposalHistoryLoader } from "./mentor-history-section";
import { mentorProposalFeedback } from "./mentor-proposal-section";
import { UmlAnalysisSection, type UmlAnalysisSelection } from "./uml-analysis-section";
import type { UmlAnalysisFocus, UmlAnalysisResponse } from "../auth/api";

// CU-2P-08: shared project chat. People talk to each other; the Mentor IA intervenes only when asked: a message that
// mentions @mentor, or the explicit actions "Recomendación técnica" (CU-2P-05) and "Proponer cambio UML" (CU-2P-06,
// OWNER and EDITOR). Their results (answers, proposal cards, notices) are published by the server and reach every
// member through the project room; this component never creates a Mentor message itself.

export type ProjectChatListener = Readonly<{
  message: (message: ProjectChatMessage) => void;
  mentor: (event: Readonly<{ replyToId: string; state: "THINKING" | "IDLE" }>) => void;
  // The socket reconnected: messages may have been missed, so the latest page is reloaded.
  reconnected: () => void;
  // An authoritative operation was accepted; for a proposal its operationId is the proposal id (CU-2P-06).
  operationAccepted: (operationId: string) => void;
}>;

export type ProjectChatConnection = Readonly<{
  // Identifies the project: when it changes the panel starts from scratch.
  projectKey: string;
  load: (params: ProjectChatParams) => Promise<ProjectChatPage>;
  send: (body: string) => Promise<ProjectChatMessage>;
  action: (action: ProjectChatAction, text: string) => Promise<ProjectChatMessage>;
  subscribe: (listener: ProjectChatListener) => () => void;
  // Public proposal state for the cards (CU-2P-07 read, requireView: every member can read it).
  loadProposalStatuses: MentorProposalHistoryLoader;
  // Only for OWNER and EDITOR: start, apply and reject proposals. A VIEWER chats and asks the Mentor, read-only otherwise.
  proposals?: Readonly<{ apply: (proposalId: string) => Promise<unknown>; reject: (proposalId: string) => Promise<unknown> }>;
}>;

export type ProjectChatTools = Readonly<{
  analysis?: Readonly<{ selection: UmlAnalysisSelection | null; onAnalyze: (focus: UmlAnalysisFocus) => Promise<UmlAnalysisResponse> }>;
  history?: Readonly<{ onLoad: MentorHistoryLoader; onLoadProposals?: MentorProposalHistoryLoader }>;
}>;

export const PROJECT_CHAT_PAGE_SIZE = 30;
const BODY_MAX = 2000;
const ACTION_TEXT_MAX = 500;
const STATUS_LABELS: Readonly<Record<MentorProposalStatus, string>> = { PENDING: "Pendiente", APPLIED: "Aplicada", REJECTED: "Rechazada" };

// Oldest first for reading; the server returns newest first. Ties are ordered by id, like the server keyset.
function byTime(left: ProjectChatMessage, right: ProjectChatMessage): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function merge(current: readonly ProjectChatMessage[], incoming: readonly ProjectChatMessage[]): ProjectChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message] as const));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(byTime);
}

function sendErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
    if (cause.status === 403) return "No tienes permiso para proponer cambios UML en este proyecto.";
    if (cause.status === 404) return "Proyecto no encontrado o no disponible.";
    if (cause.status === 400) return "El mensaje debe tener entre 1 y 2000 caracteres (500 para las acciones del Mentor).";
  }
  return "No se pudo enviar el mensaje. Intenta nuevamente.";
}

export function ProjectChatPanel({ projectName, connection, tools }: Readonly<{ projectName: string; connection: ProjectChatConnection; tools?: ProjectChatTools }>) {
  const [messages, setMessages] = useState<ProjectChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState<"message" | ProjectChatAction | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ReadonlySet<string>>(new Set());
  const [statuses, setStatuses] = useState<ReadonlyMap<string, MentorProposalStatus>>(new Map());
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const [proposalFeedback, setProposalFeedback] = useState<Readonly<{ proposalId: string; message: string }> | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const inFlight = useRef(false);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const listEnd = useRef<HTMLDivElement | null>(null);

  const refreshStatuses = useCallback(async () => {
    try {
      const list: MentorProposalHistoryList = await connectionRef.current.loadProposalStatuses();
      setStatuses(new Map(list.items.map((item) => [item.proposalId, item.status] as const)));
    } catch {
      // The card keeps its last known state; the chat itself is unaffected.
    }
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      const page = await connectionRef.current.load({ limit: PROJECT_CHAT_PAGE_SIZE });
      setMessages((current) => merge(current, page.items));
      setNextCursor((current) => current ?? page.nextCursor);
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause instanceof ApiError && cause.status === 404 ? "Proyecto no encontrado o no disponible." : "No se pudo cargar la conversación.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
    void refreshStatuses();
    return connectionRef.current.subscribe({
      message: (message) => {
        setMessages((current) => merge(current, [message]));
        if (message.kind === "PROPOSAL") void refreshStatuses();
      },
      mentor: ({ replyToId, state }) => setThinking((current) => {
        const next = new Set(current);
        if (state === "THINKING") next.add(replyToId);
        else next.delete(replyToId);
        return next;
      }),
      reconnected: () => {
        // Answers in progress before the disconnection may never send IDLE to this client.
        setThinking(new Set());
        void loadLatest();
        void refreshStatuses();
      },
      operationAccepted: () => void refreshStatuses(),
    });
  }, [loadLatest, refreshStatuses]);

  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await connection.load({ limit: PROJECT_CHAT_PAGE_SIZE, cursor: nextCursor });
      setMessages((current) => merge(current, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      setLoadError("No se pudieron cargar los mensajes anteriores.");
    } finally {
      setLoadingOlder(false);
    }
  }

  const trimmed = text.trim();
  async function submit(kind: "message" | ProjectChatAction) {
    if (!trimmed || inFlight.current) return;
    inFlight.current = true;
    setSending(kind);
    setSendError(null);
    try {
      const sent = kind === "message" ? await connection.send(trimmed) : await connection.action(kind, trimmed);
      setMessages((current) => merge(current, [sent]));
      setText("");
    } catch (cause) {
      setSendError(sendErrorMessage(cause));
    } finally {
      inFlight.current = false;
      setSending(null);
    }
  }

  async function resolveProposal(proposalId: string, decision: "apply" | "reject") {
    const proposals = connection.proposals;
    if (!proposals || proposalBusy) return;
    setProposalBusy(proposalId);
    setProposalFeedback(null);
    try {
      await (decision === "apply" ? proposals.apply(proposalId) : proposals.reject(proposalId));
    } catch (cause) {
      setProposalFeedback({ proposalId, message: mentorProposalFeedback(cause).message });
    } finally {
      setProposalBusy(null);
      void refreshStatuses();
    }
  }

  const actionTooLong = trimmed.length > ACTION_TEXT_MAX;
  const busy = sending !== null;

  return (
    <Card variant="outlined" aria-label="Chat del proyecto">
      <CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Chat del proyecto</Typography>
            <Typography variant="body2" color="text.secondary">Conversación del equipo de {projectName}. Menciona <strong>@mentor</strong> para preguntar al Mentor IA.</Typography>
          </Box>

          {nextCursor && <Button size="small" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}</Button>}
          {loading && <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={16} aria-label="Cargando conversación" /><Typography variant="body2">Cargando conversación…</Typography></Stack>}
          {loadError && <Alert severity="error">{loadError}</Alert>}
          {!loading && !loadError && messages.length === 0 && <Typography variant="body2" color="text.secondary">Todavía no hay mensajes. Escribe el primero o menciona @mentor.</Typography>}

          <Box component="ul" role="log" aria-label="Conversación del proyecto" sx={{ m: 0, p: 0, maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            {messages.map((message) => (
              <ChatEntry
                key={message.id}
                message={message}
                thinking={thinking.has(message.id)}
                status={message.proposalId ? statuses.get(message.proposalId) : undefined}
                canResolve={Boolean(connection.proposals)}
                busy={proposalBusy === message.proposalId}
                feedback={proposalFeedback && proposalFeedback.proposalId === message.proposalId ? proposalFeedback.message : null}
                onResolve={(decision) => message.proposalId && void resolveProposal(message.proposalId, decision)}
              />
            ))}
            <div ref={listEnd} />
          </Box>

          <TextField
            label="Mensaje"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit("message");
              }
            }}
            inputProps={{ maxLength: BODY_MAX }}
            helperText="Ctrl + Enter para enviar. «@mentor …» pregunta al Mentor IA."
            multiline
            minRows={2}
            disabled={busy}
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={() => void submit("message")} disabled={!trimmed || busy}>{sending === "message" ? <CircularProgress size={20} color="inherit" aria-label="Enviando mensaje" /> : "Enviar"}</Button>
            <Button variant="outlined" onClick={() => void submit("RECOMMENDATION")} disabled={!trimmed || busy || actionTooLong}>{sending === "RECOMMENDATION" ? <CircularProgress size={20} color="inherit" aria-label="Pidiendo recomendación técnica" /> : "Recomendación técnica"}</Button>
            {connection.proposals && <Button variant="outlined" onClick={() => void submit("PROPOSAL")} disabled={!trimmed || busy || actionTooLong}>{sending === "PROPOSAL" ? <CircularProgress size={20} color="inherit" aria-label="Pidiendo propuesta UML" /> : "Proponer cambio UML"}</Button>}
          </Stack>
          {actionTooLong && <Typography variant="caption" color="text.secondary">Las acciones del Mentor admiten hasta {ACTION_TEXT_MAX} caracteres.</Typography>}
          {sendError && <Alert severity="error">{sendError}</Alert>}

          {(tools?.analysis || tools?.history) && <Divider />}
          {tools?.analysis && (
            <Box>
              <Button size="small" onClick={() => setAnalysisOpen((open) => !open)} aria-expanded={analysisOpen}>{analysisOpen ? "Ocultar análisis UML" : "Análisis UML"}</Button>
              <Collapse in={analysisOpen} unmountOnExit><UmlAnalysisSection selection={tools.analysis.selection} onAnalyze={tools.analysis.onAnalyze} /></Collapse>
            </Box>
          )}
          {tools?.history && (
            <Box aria-label="Historial anterior">
              <Typography variant="caption" color="text.secondary">Historial anterior del Mentor (consultas y propuestas previas al chat):</Typography>
              <MentorHistorySection key={connection.projectKey} onLoad={tools.history.onLoad} onLoadProposals={tools.history.onLoadProposals} />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ChatEntry({ message, thinking, status, canResolve, busy, feedback, onResolve }: Readonly<{
  message: ProjectChatMessage;
  thinking: boolean;
  status?: MentorProposalStatus;
  canResolve: boolean;
  busy: boolean;
  feedback: string | null;
  onResolve: (decision: "apply" | "reject") => void;
}>) {
  const fromMentor = message.kind === "MENTOR" || message.kind === "PROPOSAL";
  const author = message.kind === "USER" ? message.author?.email ?? "Integrante" : message.kind === "NOTICE" ? "Aviso" : "Mentor IA";
  return (
    <Box component="li" sx={{ listStyle: "none" }} data-testid="project-chat-message" data-kind={message.kind}>
      <Box sx={{ p: 1, borderRadius: 1, bgcolor: fromMentor ? "action.hover" : "transparent", border: message.kind === "NOTICE" ? 1 : 0, borderColor: "warning.light" }}>
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography variant="caption" fontWeight={700}>{author}</Typography>
          <Typography variant="caption" color="text.secondary"><time dateTime={message.createdAt}>{formatHistoryDate(message.createdAt)}</time></Typography>
        </Stack>
        {message.kind === "PROPOSAL" ? (
          <Stack spacing={0.75} sx={{ mt: 0.5 }} aria-label="Propuesta de cambio UML">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" fontWeight={600}>Propuesta de cambio UML</Typography>
              <Chip size="small" label={`Estado: ${STATUS_LABELS[status ?? "PENDING"]}`} color={status === "APPLIED" ? "success" : status === "REJECTED" ? "default" : "warning"} />
            </Stack>
            <Typography component="pre" variant="body2" sx={{ m: 0, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{message.body}</Typography>
            <Typography variant="caption" color="text.secondary">El diagrama no cambia hasta que alguien con permiso de edición la aplique.</Typography>
            {canResolve && (status ?? "PENDING") === "PENDING" && (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => onResolve("apply")} disabled={busy}>Aplicar</Button>
                <Button size="small" variant="outlined" color="inherit" onClick={() => onResolve("reject")} disabled={busy}>Rechazar</Button>
              </Stack>
            )}
            {feedback && <Alert severity="warning">{feedback}</Alert>}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</Typography>
        )}
      </Box>
      {thinking && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1, pt: 0.5 }} role="status">
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">Mentor IA está respondiendo…</Typography>
        </Stack>
      )}
    </Box>
  );
}
