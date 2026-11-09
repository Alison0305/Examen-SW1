"use client";

import { Alert, Button, Card, CardContent, LinearProgress, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import type { UmlImportProposal } from "@examen-sw1/uml-core";
import { exportXmi, parseXmi, XMI_MAX_BYTES } from "@examen-sw1/xmi-core";
import type { VisionRecognition } from "../auth/api";
import { ImportReviewDialog } from "./import-review-dialog";
import { useWorkspaceStore } from "./workspace-store";

export type RecognizeDiagramImage = (image: File) => Promise<VisionRecognition>;

type PendingReview = Readonly<{ id: number; title: string; sourceLabel: string; details?: string; proposal: UmlImportProposal }>;

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

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

const isImageFile = (file: File) => IMAGE_TYPES.has(file.type) || /\.(png|jpe?g)$/i.test(file.name);

// External inputs to the model: XMI 2.1 (in the browser) and diagram images (recognized by the backend).
// Both end in the same review dialog and are applied as a single ImportUmlFragment.
export function WorkspaceImportActions({ readOnly = false, projectName, onRecognizeImage }: Readonly<{ readOnly?: boolean; projectName?: string; onRecognizeImage?: RecognizeDiagramImage }>) {
  const document = useWorkspaceStore((state) => state.document);
  const importFragment = useWorkspaceStore((state) => state.importFragment);
  const xmiInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const reviewCounter = useRef(0);
  const [review, setReview] = useState<PendingReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);

  const openReview = (entry: Omit<PendingReview, "id">) => {
    reviewCounter.current += 1;
    setReview({ ...entry, id: reviewCounter.current });
  };

  function exportModel() {
    const { xml } = exportXmi(document.uml, { modelName: projectName });
    downloadText(xmiFileName(projectName), xml);
  }

  async function loadXmi(file: File | undefined) {
    setError(null);
    setReview(null);
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
    openReview({ title: "Importar XMI", sourceLabel: file.name, proposal: parsed.proposal });
  }

  async function loadImage(file: File | undefined) {
    setError(null);
    setReview(null);
    if (!file || !onRecognizeImage) return;
    if (!isImageFile(file)) {
      setError("La imagen debe ser PNG o JPEG.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setError("La imagen supera el tamaño máximo de 5 MB.");
      return;
    }
    setRecognizing(true);
    try {
      const result = await onRecognizeImage(file);
      const seconds = (result.elapsedMs / 1000).toLocaleString("es", { maximumFractionDigits: 1 });
      openReview({
        title: "Importar desde imagen",
        sourceLabel: file.name,
        details: `Reconocida en ${seconds} s a partir de ${result.ocrLines} línea(s) de texto. El reconocimiento puede tener errores: revisa nombres, tipos y relaciones antes de aplicar.`,
        proposal: result.proposal,
      });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "No fue posible reconocer la imagen.");
    } finally {
      setRecognizing(false);
    }
  }

  return (
    <Card variant="outlined" aria-label="Importación y exportación">
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2">Intercambio XMI 2.1 e imagen</Typography>
          <Button variant="outlined" onClick={exportModel}>Exportar XMI</Button>
          {!readOnly && (
            <>
              <Button variant="outlined" onClick={() => xmiInput.current?.click()} disabled={recognizing}>Importar XMI</Button>
              <input ref={xmiInput} type="file" accept=".xmi,.xml,application/xml,text/xml" hidden aria-label="Archivo XMI" onChange={(event) => { void loadXmi(event.target.files?.[0]); event.target.value = ""; }} />
              {onRecognizeImage && (
                <>
                  <Button variant="outlined" onClick={() => imageInput.current?.click()} disabled={recognizing}>Desde imagen</Button>
                  <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden aria-label="Imagen del diagrama" onChange={(event) => { void loadImage(event.target.files?.[0]); event.target.value = ""; }} />
                </>
              )}
            </>
          )}
          {recognizing && (
            <Stack spacing={0.5} role="status">
              <LinearProgress />
              <Typography variant="caption">Reconociendo el diagrama; puede tardar hasta un minuto.</Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </CardContent>
      {review && (
        <ImportReviewDialog
          key={review.id}
          title={review.title}
          sourceLabel={review.sourceLabel}
          details={review.details}
          proposal={review.proposal}
          document={document}
          readOnly={readOnly}
          onCancel={() => setReview(null)}
          onApply={(fragment) => {
            const result = importFragment(fragment);
            if (result.success) setReview(null);
            return result;
          }}
        />
      )}
    </Card>
  );
}
