"use client";

import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type MentorHistoryItem, type MentorHistoryPage, type MentorHistoryParams } from "../auth/api";

// CU-2P-07: shared, read-only history of the project's Mentor interactions. It never edits, deletes or applies
// anything, has no realtime and shows no proposal state (that needs CU-2P-06). The server is the only source: the
// search goes to the endpoint as `q`, pagination uses its opaque cursor.

export type MentorHistoryLoader = (params: MentorHistoryParams) => Promise<MentorHistoryPage>;

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

type Status = "idle" | "loading" | "loading-more";

export function MentorHistorySection({
  onLoad,
  refreshKey = 0,
  debounceMs = MENTOR_HISTORY_SEARCH_DEBOUNCE_MS,
}: Readonly<{
  onLoad: MentorHistoryLoader;
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

  // Opening: the first time it loads; afterwards only if something is pending (or the last load failed).
  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (!opening || status !== "idle") return;
    if (!loaded || error || pendingRef.current) void loadFirstPage(appliedSearch.current, !loaded || pendingRef.current === "search");
  }

  // After a successful Mentor query: refresh now if open, mark for refresh if loaded and closed, nothing otherwise
  // (a section that was never opened makes no request).
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
            <Button size="small" variant="outlined" onClick={() => void loadFirstPage(search, false)} disabled={busy}>Actualizar</Button>
          </Stack>
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
        </Stack>
      )}
    </Stack>
  );
}
