"use client";

import { Alert, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { buildImportFragment, previewImportFragment, type Diagnostic, type ImportDiagnostic, type UmlFragment } from "@examen-sw1/uml-core";
import { exportXmi, parseXmi, XMI_MAX_BYTES } from "@examen-sw1/xmi-core";
import { useWorkspaceStore } from "./workspace-store";

type XmiReview = Readonly<{
  fileName: string;
  fragment: UmlFragment;
  importDiagnostics: readonly ImportDiagnostic[];
  validation: readonly Diagnostic[];
  valid: boolean;
}>;

const xmiFileName = (projectName: string | undefined) => `${(projectName ?? "modelo").trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "modelo"}.xmi`;

function downloadText(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

// FileReader instead of Blob.text(): same behavior in browsers and in the jsdom test environment.
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.readAsText(file);
  });
}

const severityLabel: Record<string, "error" | "warning" | "info"> = { error: "error", warning: "warning", info: "info" };

// XMI 2.1 exchange: export runs in the browser; import is reviewed and applied as one ImportUmlFragment.
export function WorkspaceXmiActions({ readOnly = false, projectName }: Readonly<{ readOnly?: boolean; projectName?: string }>) {
  const document = useWorkspaceStore((state) => state.document);
  const importFragment = useWorkspaceStore((state) => state.importFragment);
  const fileInput = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<XmiReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyErrors, setApplyErrors] = useState<readonly Diagnostic[]>([]);

  function exportModel() {
    const { xml } = exportXmi(document.uml, { modelName: projectName });
    downloadText(xmiFileName(projectName), xml);
  }

  async function loadFile(file: File | undefined) {
    setError(null);
    setReview(null);
    setApplyErrors([]);
    if (!file) return;
    if (file.size > XMI_MAX_BYTES) {
      setError("El archivo supera el tamaño máximo de 5 MB.");
      return;
    }
    let content: string;
    try {
      content = await readFileText(file);
    } catch {
      setError("No se pudo leer el archivo.");
      return;
    }
    const parsed = parseXmi(content);
    if (!parsed.ok) {
      setError(parsed.diagnostics.map((entry) => entry.message).join(" "));
      return;
    }
    const built = buildImportFragment(parsed.proposal, document);
    const preview = previewImportFragment(document, built.fragment);
    setReview({ fileName: file.name, fragment: built.fragment, importDiagnostics: [...parsed.proposal.diagnostics, ...built.diagnostics], validation: preview.diagnostics, valid: preview.valid && built.fragment.classes.length + built.fragment.enumerations.length > 0 });
  }

  function apply() {
    if (!review) return;
    const result = importFragment(review.fragment);
    if (result.success) {
      setReview(null);
      return;
    }
    setApplyErrors(result.diagnostics);
  }

  const attributes = review?.fragment.classes.reduce((total, entry) => total + entry.attributes.length, 0) ?? 0;
  const blocking = review ? [...review.validation, ...applyErrors].filter((entry) => entry.severity === "error") : [];

  return (
    <Card variant="outlined" aria-label="Intercambio XMI">
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2">Intercambio XMI 2.1</Typography>
          <Button variant="outlined" onClick={exportModel}>Exportar XMI</Button>
          {!readOnly && (
            <>
              <Button variant="outlined" onClick={() => fileInput.current?.click()}>Importar XMI</Button>
              <input ref={fileInput} type="file" accept=".xmi,.xml,application/xml,text/xml" hidden aria-label="Archivo XMI" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }} />
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </CardContent>
      <Dialog open={review !== null} onClose={() => setReview(null)} fullWidth maxWidth="sm">
        <DialogTitle>Importar XMI</DialogTitle>
        {review && (
          <DialogContent>
            <Stack spacing={1.5}>
              <Typography variant="body2">Archivo: {review.fileName}</Typography>
              <Typography variant="body2" aria-label="Resumen de importación">
                {review.fragment.classes.length} clase(s), {attributes} atributo(s), {review.fragment.enumerations.length} enumeración(es) y {review.fragment.relationships.length} relación(es).
              </Typography>
              {review.fragment.classes.length > 0 && <Typography variant="body2">Clases: {review.fragment.classes.map((entry) => entry.name).join(", ")}</Typography>}
              {blocking.length > 0 && <Alert severity="error">{blocking.map((entry) => entry.message).join(" ")}</Alert>}
              {review.importDiagnostics.length > 0 && (
                <List dense aria-label="Diagnósticos de importación">
                  {review.importDiagnostics.map((entry, index) => (
                    <ListItem key={`${entry.code}-${index}`} disableGutters>
                      <Alert severity={severityLabel[entry.severity] ?? "info"} sx={{ width: "100%" }}><ListItemText primary={entry.message} /></Alert>
                    </ListItem>
                  ))}
                </List>
              )}
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setReview(null)}>Cancelar</Button>
          <Button variant="contained" onClick={apply} disabled={!review?.valid || readOnly}>Aplicar</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
