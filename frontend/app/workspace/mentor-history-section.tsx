"use client";

import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  type MentorHistoryItem,
  type MentorHistoryPage,
  type MentorHistoryParams,
  type MentorProposalDiffLine,
  type MentorProposalHistoryItem,
  type MentorProposalHistoryList,
  type MentorProposalOperation,
  type MentorProposalStatus,
} from "../auth/api";

// CU-2P-07: shared, read-only history of the project. Two independent sources, never merged into one timeline:
//  - "Interacciones": the Mentor's queries and recommendations, from GET /mentor/history (search `q`, opaque cursor);
//  - "Propuestas UML" (task 8.1): the public state of CU-2P-06's proposals, from GET /mentor/history/proposals
//    (MentorProposalHistoryProjection, newest first, no cursor, no search).
// Each source has its own loading, error and empty state, so one failing never hides the other. Nothing here edits,
// applies or rejects anything, and there is no realtime or polling.

export type MentorHistoryLoader = (params: MentorHistoryParams) => Promise<MentorHistoryPage>;
export type MentorProposalHistoryLoader = () => Promise<MentorProposalHistoryList>;

export const MENTOR_HISTORY_SEARCH_DEBOUNCE_MS = 400;

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

/** Human-readable date; the original ISO value stays in the `dateTime` attribute. */
export function formatHistoryDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    // 401 is also handled globally by the API client (onUnauthorized).
    if (cause.status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
    // Same wording as the rest of the workspace: it does not tell "missing" from "no access".
    if (cause.status === 404) return "Proyecto no encontrado o no disponible.";
    if (cause.status === 400) return "No se pudo cargar el historial.";
  }
  return "No se pudo cargar el historial en este momento.";
}

function HistoryEntry({ item }: Readonly<{ item: MentorHistoryItem }>) {
  const [expanded, setExpanded] = useState(false);
  const answerId = `mentor-history-answer-${item.id}`;
  return (
    <Box component="li" sx={{ listStyle: "none", borderTop: 1, borderColor: "divider", py: 1 }} data-testid="mentor-history-item">
      <Typography variant="caption" color="text.secondary" component="p">
        {item.author.email} · <time dateTime={item.occurredAt}>{formatHistoryDate(item.occurredAt)}</time>
      </Typography>
      {/* Plain text: React escapes it; whitespace is preserved. */}
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.question}</Typography>
      <Button size="small" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={answerId} sx={{ px: 0 }}>
        {expanded ? "Ocultar respuesta" : "Ver respuesta"}
      </Button>
      {expanded && (
        <Typography id={answerId} variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {item.answer}
        </Typography>
      )}
    </Box>
  );
}

// Presentation of CU-2P-06's public projection. Only names already public in the projection are shown: no ids,
// command, instruction or author. The diff lines are the snapshot taken when the proposal was created.
const OPERATION_LABELS: Readonly<Record<MentorProposalOperation["kind"], string>> = { ADD_ATTRIBUTE: "Agregar atributo" };
const PROPOSAL_STATUS_LABELS: Readonly<Record<MentorProposalStatus, string>> = { PENDING: "Pendiente", APPLIED: "Aplicada", REJECTED: "Rechazada" };
const DIFF_PREFIX: Readonly<Record<MentorProposalDiffLine["kind"], string>> = { added: "+", removed: "−", changed: "~" };

function proposalErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
    // Same generic wording as the interactions: it does not tell "missing" from "no access".
    if (cause.status === 404) return "Proyecto no encontrado o no disponible.";
  }
  return "No se pudieron cargar las propuestas UML en este momento.";
}

function ProposalEntry({ proposal }: Readonly<{ proposal: MentorProposalHistoryItem }>) {
  const status = PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status;
  return (
    <Box component="li" sx={{ listStyle: "none", borderTop: 1, borderColor: "divider", py: 1 }} data-testid="mentor-proposal-item">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" fontWeight={600}>{OPERATION_LABELS[proposal.operation.kind] ?? "Cambio UML"}</Typography>
        <Chip size="small" label={`Estado: ${status}`} color={proposal.status === "APPLIED" ? "success" : proposal.status === "REJECTED" ? "default" : "warning"} />
      </Stack>
      {proposal.summary.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" component="p">Cambio:</Typography>
          <Box component="ul" aria-label="Cambio propuesto" sx={{ m: 0, pl: 2.5, fontFamily: "monospace", overflowWrap: "anywhere" }}>
            {proposal.summary.map((line, index) => <li key={`${line.kind}-${line.label}-${index}`}>{`${DIFF_PREFIX[line.kind] ?? "·"} ${line.label}`}</li>)}
          </Box>
        </>
      )}
      <Typography variant="caption" color="text.secondary" component="p">Revisión base: {proposal.baseRevision}</Typography>
      {/* Only an APPLIED proposal has a resulting revision; only a resolved one has a resolution date. */}
      {proposal.status === "APPLIED" && proposal.resultingRevision !== undefined && (
        <Typography variant="caption" color="text.secondary" component="p">Revisión resultante: {proposal.resultingRevision}</Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="p">
        Creada: <time dateTime={proposal.createdAt}>{formatHistoryDate(proposal.createdAt)}</time>
      </Typography>
      {proposal.status !== "PENDING" && proposal.resolvedAt && (
        <Typography variant="caption" color="text.secondary" component="p">
          Resuelta: <time dateTime={proposal.resolvedAt}>{formatHistoryDate(proposal.resolvedAt)}</time>
        </Typography>
      )}
    </Box>
  );
}

type Status = "idle" | "loading" | "loading-more";

export function MentorHistorySection({
  onLoad,
  onLoadProposals,
  refreshKey = 0,
  debounceMs = MENTOR_HISTORY_SEARCH_DEBOUNCE_MS,
}: Readonly<{
  onLoad: MentorHistoryLoader;
  // Task 8.1: when given, the section also shows the "Propuestas UML" sublist.
  onLoadProposals?: MentorProposalHistoryLoader;
  // Incremented by the panel after each successful Mentor query (CU-2P-03 records it) and each recorded technical
  // recommendation (CU-2P-05).
  refreshKey?: number;
  debounceMs?: number;
}>) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MentorHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  // Search actually applied (trimmed, debounced); undefined means no filter.
  const [search, setSearch] = useState<string | undefined>(undefined);

  // The loader closure may change on every parent render: keep the latest without re-running effects.
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);
  // Only the latest request may write state: a slower, older response (another search, a refresh or a "load more"
  // overtaken by a new search) is discarded.
  const requestSeq = useRef(0);
  // Pending reload decided while the section was closed: a new search (the old list no longer applies) or a new
  // Mentor interaction (the old list is still valid until the fresh page arrives).
  const pendingRef = useRef<"search" | "refresh" | null>(null);

  // First page for `query`: replaces the list and always starts without cursor.
  const loadFirstPage = useCallback(async (query: string | undefined, clear: boolean) => {
    const id = ++requestSeq.current;
    pendingRef.current = null;
    setStatus("loading");
    setError(null);
    if (clear) {
      setItems([]);
      setNextCursor(null);
    }
    try {
      const page = await onLoadRef.current(query ? { q: query } : {});
      if (id !== requestSeq.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (id !== requestSeq.current) return;
      setItems([]);
      setNextCursor(null);
      setError(errorMessage(cause));
    } finally {
      if (id === requestSeq.current) setStatus("idle");
    }
  }, []);

  // "Propuestas UML": a state of its own, so a failure here never touches the interactions (and vice versa).
  const [proposals, setProposals] = useState<MentorProposalHistoryItem[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [proposalsLoaded, setProposalsLoaded] = useState(false);
  const onLoadProposalsRef = useRef(onLoadProposals);
  useEffect(() => {
    onLoadProposalsRef.current = onLoadProposals;
  }, [onLoadProposals]);
  // Only the latest proposal request may write state.
  const proposalSeq = useRef(0);

  const loadProposals = useCallback(async () => {
    const load = onLoadProposalsRef.current;
    if (!load) return;
    const id = ++proposalSeq.current;
    setProposalsLoading(true);
    setProposalsError(null);
    try {
      const list = await load();
      if (id !== proposalSeq.current) return;
      setProposals(list.items);
      setProposalsLoaded(true);
    } catch (cause) {
      if (id !== proposalSeq.current) return;
      setProposals([]);
      setProposalsError(proposalErrorMessage(cause));
    } finally {
      if (id === proposalSeq.current) setProposalsLoading(false);
    }
  }, []);

  async function loadMore() {
    if (!nextCursor || status !== "idle") return;
    const id = ++requestSeq.current;
    setStatus("loading-more");
    setError(null);
    try {
      const page = await onLoadRef.current(search ? { cursor: nextCursor, q: search } : { cursor: nextCursor });
      if (id !== requestSeq.current) return;
      // Append in server order, skipping any id already shown.
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (id !== requestSeq.current) return;
      // The pages already shown stay; the cursor is kept so the user can retry.
      setError(errorMessage(cause));
    } finally {
      if (id === requestSeq.current) setStatus("idle");
    }
  }

  // Debounced search; a blank box means "no filter" (q is never sent empty).
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim() || undefined), debounceMs);
    return () => clearTimeout(timer);
  }, [input, debounceMs]);

  // A new search restarts from the first page: the previous cursor is discarded.
  const appliedSearch = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (appliedSearch.current === search) return;
    appliedSearch.current = search;
    if (open) void loadFirstPage(search, true);
    else pendingRef.current = "search";
  }, [search, open, loadFirstPage]);

  // Opening: the first time it loads; afterwards only if something is pending (or the last load failed). Each source
  // decides on its own.
  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (!opening) return;
    if (status === "idle" && (!loaded || error || pendingRef.current)) void loadFirstPage(appliedSearch.current, !loaded || pendingRef.current === "search");
    if (!proposalsLoading && (!proposalsLoaded || proposalsError)) void loadProposals();
  }

  // "Actualizar" reloads both sources (the interactions with the current search, the proposals as they are).
  function refreshAll() {
    void loadFirstPage(search, false);
    void loadProposals();
  }

  // After a successful Mentor query or recorded recommendation: refresh now if open, mark for refresh if loaded and
  // closed, nothing otherwise (a section that was never opened makes no request). Interactions only: a query or a
  // recommendation never changes the proposals, which reload on opening, on "Actualizar" and on a project change.
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (seenRefreshKey.current === refreshKey) return;
    seenRefreshKey.current = refreshKey;
    if (open) void loadFirstPage(appliedSearch.current, false);
    else if (loaded && pendingRef.current === null) pendingRef.current = "refresh";
  }, [refreshKey, open, loaded, loadFirstPage]);

  const busy = status !== "idle";

  return (
    <Stack spacing={1} component="section" aria-label="Historial del proyecto">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography variant="subtitle2" fontWeight={700} component="h3">Historial del proyecto</Typography>
        <Button size="small" onClick={toggle} aria-expanded={open} aria-controls="mentor-history-content">
          {open ? "Ocultar historial" : "Mostrar historial"}
        </Button>
      </Stack>
      {open && (
        <Stack spacing={1} id="mentor-history-content">
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField label="Buscar en el historial" size="small" value={input} onChange={(event) => setInput(event.target.value)} inputProps={{ maxLength: 200 }} fullWidth />
            <Button size="small" variant="outlined" onClick={refreshAll} disabled={busy}>Actualizar</Button>
          </Stack>
          {onLoadProposals && <Typography variant="subtitle2" component="h4">Interacciones</Typography>}
          {status === "loading" && (
            <Stack direction="row" spacing={1} alignItems="center" role="status">
              <CircularProgress size={16} />
              <Typography variant="body2">Cargando historial...</Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {status !== "loading" && !error && loaded && items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {search ? "No hay interacciones que coincidan con la búsqueda." : "Todavía no hay interacciones en este proyecto."}
            </Typography>
          )}
          {items.length > 0 && (
            <Box component="ul" sx={{ m: 0, p: 0 }} aria-label="Interacciones del Mentor">
              {items.map((item) => <HistoryEntry key={item.id} item={item} />)}
            </Box>
          )}
          {nextCursor && (
            <Box>
              <Button size="small" onClick={() => void loadMore()} disabled={busy}>
                {status === "loading-more" ? <CircularProgress size={16} color="inherit" aria-label="Cargando más interacciones" /> : "Cargar más"}
              </Button>
            </Box>
          )}
          {onLoadProposals && (
            <Stack spacing={1} component="section" aria-label="Propuestas UML" sx={{ pt: 1 }}>
              <Typography variant="subtitle2" component="h4">Propuestas UML</Typography>
              <Typography variant="caption" color="text.secondary">Estado de los cambios UML propuestos por el Mentor, más recientes primero. Solo lectura; la búsqueda no las filtra.</Typography>
              {proposalsLoading && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={16} aria-label="Cargando propuestas UML" />
                  <Typography variant="body2">Cargando propuestas UML...</Typography>
                </Stack>
              )}
              {proposalsError && <Alert severity="error">{proposalsError}</Alert>}
              {!proposalsLoading && !proposalsError && proposalsLoaded && proposals.length === 0 && (
                <Typography variant="body2" color="text.secondary">No hay propuestas UML registradas.</Typography>
              )}
              {proposals.length > 0 && (
                <Box component="ul" sx={{ m: 0, p: 0 }} aria-label="Propuestas UML del proyecto">
                  {proposals.map((proposal) => <ProposalEntry key={proposal.proposalId} proposal={proposal} />)}
                </Box>
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
