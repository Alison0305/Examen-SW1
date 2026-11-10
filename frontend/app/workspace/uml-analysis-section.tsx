"use client";

import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useState } from "react";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import { ApiError, type UmlAnalysisDiagnostic, type UmlAnalysisFocus, type UmlAnalysisResponse } from "../auth/api";
import type { WorkspaceSelection } from "./workspace-store";

// CU-2P-04: explains the selected class or relationship, or the whole model. Read only: it never offers to apply,
// correct or change anything (that belongs to CU-2P-06).

export type UmlAnalysisSelection = Readonly<{ kind: WorkspaceSelection["kind"]; id: string; label: string }>;

const DIAGNOSTIC_MESSAGES: Readonly<Record<UmlAnalysisDiagnostic, string>> = {
  EMPTY_MODEL: "El modelo UML está vacío.",
  ELEMENT_NOT_FOUND: "El elemento seleccionado ya no existe en el modelo.",
  INVALID_FOCUS_ID: "No se pudo identificar correctamente el elemento seleccionado.",
  INCONSISTENT_REFERENCE: "El modelo contiene una referencia inconsistente que impide analizar este elemento.",
  CONTEXT_TOO_LARGE: "El contexto esencial de este análisis es demasiado grande para el Mentor IA.",
};

const OMISSION_WORDS = [
  ["classes", "clases"],
  ["enumerations", "enumeraciones"],
  ["relationships", "relaciones"],
  ["attributes", "atributos"],
  ["diagnostics", "diagnósticos"],
  ["limitations", "limitaciones"],
] as const;

const MAX_OBSERVATIONS = 6;

// Display label of the current selection, read from the local document. Presentation only: the analyzed element
// is resolved by id on the server and the result is labelled with the focus the server returns.
export function describeSelection(document: ProjectDocument, selection: WorkspaceSelection | null): UmlAnalysisSelection | null {
  if (!selection) return null;
  const uml = document.uml;
  const nameOf = (id: string) => uml.classes.find((entry) => entry.id === id)?.name ?? uml.enumerations.find((entry) => entry.id === id)?.name ?? "elemento";
  if (selection.kind === "relationship") {
    const relationship = uml.relationships.find((entry) => entry.id === selection.id);
    const label = !relationship ? "relación" : relationship.name || (relationship.type === "Generalization" ? `${nameOf(relationship.sourceId)} → ${nameOf(relationship.targetId)}` : `${nameOf(relationship.sourceId)} — ${nameOf(relationship.targetId)}`);
    return { kind: "relationship", id: selection.id, label };
  }
  return { kind: selection.kind, id: selection.id, label: nameOf(selection.id) };
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 503) return "El Mentor IA no está disponible en este momento.";
    if (cause.status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
    if (cause.status === 404) return "Proyecto no encontrado o no disponible.";
    if (cause.status === 422) return "El modelo del proyecto no es válido para analizarlo.";
  }
  return "No fue posible analizar el modelo. Intenta nuevamente.";
}

function focusTitle(focus: UmlAnalysisResponse["focus"]): string {
  if (focus.kind === "model") return "Modelo completo";
  return focus.name ?? (focus.kind === "class" ? "clase" : "relación");
}

// Short, user-facing messages of the deterministic result; never the raw analysis object.
function observations(response: UmlAnalysisResponse): string[] {
  const analysis = response.analysis;
  if (!analysis) return [];
  return [
    ...analysis.diagnostics.uml.map((entry) => entry.message),
    ...analysis.diagnostics.relational.map((entry) => entry.message),
    ...analysis.conflicts.map((entry) => entry.message),
    ...analysis.limitations.schema.map((entry) => entry.message),
  ];
}

export function UmlAnalysisSection({ selection, onAnalyze }: Readonly<{ selection: UmlAnalysisSelection | null; onAnalyze: (focus: UmlAnalysisFocus) => Promise<UmlAnalysisResponse> }>) {
  const [pending, setPending] = useState<"selection" | "model" | null>(null);
  const [result, setResult] = useState<UmlAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectable = selection !== null && selection.kind !== "enumeration";

  async function analyze(focus: UmlAnalysisFocus, origin: "selection" | "model") {
    if (pending) return;
    setPending(origin);
    setError(null);
    setResult(null);
    try {
      setResult(await onAnalyze(focus));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(null);
    }
  }

  function analyzeSelection() {
    if (!selection || selection.kind === "enumeration") return;
    void analyze({ kind: selection.kind, id: selection.id }, "selection");
  }

  const notes = result ? observations(result) : [];
  const omitted = result?.explanation?.contextTruncation;

  return (
    <Stack spacing={1.25} aria-label="Análisis UML">
      <Typography variant="subtitle2" fontWeight={700}>Análisis UML</Typography>
      <Typography variant="body2" color="text.secondary">
        {!selection ? "Selecciona una clase o relación para analizarla."
          : selection.kind === "enumeration" ? "Las enumeraciones aún no se pueden analizar individualmente."
            : `Selección: ${selection.label}`}
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button variant="contained" size="small" onClick={analyzeSelection} disabled={!selectable || pending !== null}>
          {pending === "selection" ? <><CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />Analizando...</> : "Explicar selección"}
        </Button>
        <Button variant="outlined" size="small" onClick={() => void analyze({ kind: "model" }, "model")} disabled={pending !== null}>
          {pending === "model" ? <><CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />Analizando...</> : "Explicar modelo"}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {result && (
        <Stack spacing={1} aria-label="Resultado del análisis UML">
          {/* Labelled with the focus the server analyzed, never with the current canvas selection. */}
          <Typography variant="body2" fontWeight={700}>Análisis de: {focusTitle(result.focus)}</Typography>
          {result.diagnostic && (
            <Alert severity={result.diagnostic === "CONTEXT_TOO_LARGE" ? "warning" : "info"}>
              {DIAGNOSTIC_MESSAGES[result.diagnostic]}
              {result.diagnostic === "CONTEXT_TOO_LARGE" && result.analysis && " Los hechos deterministas del modelo sí se calcularon; solo la explicación no pudo generarse."}
            </Alert>
          )}
          {result.explanation && (
            <Box>
              <Typography variant="body2" fontWeight={700}>Explicación</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>{result.explanation.text}</Typography>
            </Box>
          )}
          {omitted?.truncated && (
            <Alert severity="info" variant="outlined">
              El análisis utilizó una versión resumida del contexto del modelo.
              <Typography component="span" variant="caption" display="block" color="text.secondary">
                Omitido: {OMISSION_WORDS.filter(([key]) => omitted.omitted[key] > 0).map(([key, word]) => `${omitted.omitted[key]} ${word}`).join(", ")}.
              </Typography>
            </Alert>
          )}
          {notes.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={700}>Observaciones del modelo</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {notes.slice(0, MAX_OBSERVATIONS).map((note, index) => <li key={index}><Typography variant="body2">{note}</Typography></li>)}
              </Box>
              {notes.length > MAX_OBSERVATIONS && <Typography variant="caption" color="text.secondary">y {notes.length - MAX_OBSERVATIONS} más.</Typography>}
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
