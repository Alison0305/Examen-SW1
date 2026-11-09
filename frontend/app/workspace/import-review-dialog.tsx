"use client";

import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, List, ListItem, ListItemText, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { buildImportFragment, previewImportFragment, type Diagnostic, type ImportDiagnostic, type ProjectDocument, type UmlFragment, type UmlImportProposal, type UmlRelationshipType } from "@examen-sw1/uml-core";
import { formatMultiplicity } from "./workspace-utils";

export type ImportReviewResult = Readonly<{ success: boolean; diagnostics: readonly Diagnostic[] }>;

export type ImportReviewDialogProps = Readonly<{
  title: string;
  sourceLabel: string;
  details?: string;
  proposal: UmlImportProposal;
  document: ProjectDocument;
  readOnly?: boolean;
  onCancel: () => void;
  onApply: (fragment: UmlFragment) => ImportReviewResult;
}>;

const RELATIONSHIP_LABEL: Readonly<Record<UmlRelationshipType, string>> = { Association: "Asociación", Aggregation: "Agregación", Composition: "Composición", Generalization: "Generalización" };
const severityOf = (severity: ImportDiagnostic["severity"]) => severity;

// Review common to XMI and image: the user edits names and types and includes or excludes elements; every
// change recomputes the translation and the validation on a copy. Applying emits one ImportUmlFragment.
export function ImportReviewDialog({ title, sourceLabel, details, proposal, document, readOnly = false, onCancel, onApply }: ImportReviewDialogProps) {
  const [draft, setDraft] = useState<UmlImportProposal>(proposal);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [applyErrors, setApplyErrors] = useState<readonly Diagnostic[]>([]);

  const review = useMemo(() => {
    const built = buildImportFragment(draft, document, { excludedKeys: excluded });
    const empty = built.fragment.classes.length + built.fragment.enumerations.length === 0;
    const preview = empty ? { valid: false, diagnostics: [] } : previewImportFragment(document, built.fragment);
    return { ...built, empty, preview };
  }, [draft, document, excluded]);

  const classNameByKey = new Map(draft.classes.map((entry) => [entry.key, entry.name] as const));
  const endName = (reference: string) => classNameByKey.get(reference) ?? reference;
  const endExcluded = (reference: string) => excluded.has(reference);
  const attributes = review.fragment.classes.reduce((total, entry) => total + entry.attributes.length, 0);
  const blocking = [...review.preview.diagnostics, ...applyErrors].filter((entry) => entry.severity === "error");
  const diagnostics = [...draft.diagnostics, ...review.diagnostics];

  const toggle = (key: string) => {
    setApplyErrors([]);
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const editClass = (key: string, name: string) => {
    setApplyErrors([]);
    setDraft((current) => ({ ...current, classes: current.classes.map((entry) => (entry.key === key ? { ...entry, name } : entry)) }));
  };
  const editEnumeration = (key: string, name: string) => {
    setApplyErrors([]);
    setDraft((current) => ({ ...current, enumerations: current.enumerations.map((entry) => (entry.key === key ? { ...entry, name } : entry)) }));
  };
  const editAttribute = (classKey: string, attributeKey: string, change: Readonly<{ name?: string; type?: string }>) => {
    setApplyErrors([]);
    setDraft((current) => ({
      ...current,
      classes: current.classes.map((entry) => (entry.key === classKey ? { ...entry, attributes: entry.attributes.map((attribute) => (attribute.key === attributeKey ? { ...attribute, ...change } : attribute)) } : entry)),
    }));
  };

  function apply() {
    const result = onApply(review.fragment);
    if (!result.success) setApplyErrors(result.diagnostics);
  }

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2">Origen: {sourceLabel}</Typography>
          {details && <Typography variant="body2" color="text.secondary">{details}</Typography>}
          <Typography variant="body2" aria-label="Resumen de importación">
            {review.fragment.classes.length} clase(s), {attributes} atributo(s), {review.fragment.enumerations.length} enumeración(es) y {review.fragment.relationships.length} relación(es).
          </Typography>
          {blocking.length > 0 && <Alert severity="error">{blocking.map((entry) => entry.message).join(" ")}</Alert>}
          {review.empty && <Alert severity="warning">No hay clases ni enumeraciones incluidas para importar.</Alert>}

          {draft.classes.length > 0 && <Typography variant="subtitle2">Clases</Typography>}
          {draft.classes.map((entry, index) => {
            const included = !excluded.has(entry.key);
            return (
              <Box key={entry.key} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }} aria-label={`Clase propuesta ${index + 1}`} role="group">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Checkbox checked={included} onChange={() => toggle(entry.key)} slotProps={{ input: { "aria-label": `Incluir clase ${index + 1}` } }} />
                  <TextField size="small" label="Nombre de la clase" value={entry.name} disabled={!included} onChange={(event) => editClass(entry.key, event.target.value)} slotProps={{ htmlInput: { "aria-label": `Nombre de la clase ${index + 1}` } }} sx={{ flex: 1 }} />
                </Stack>
                {entry.attributes.length > 0 && (
                  <Stack spacing={1} sx={{ mt: 1, pl: 5 }}>
                    {entry.attributes.map((attribute, attributeIndex) => {
                      const attributeIncluded = included && !excluded.has(attribute.key);
                      const label = `atributo ${attributeIndex + 1} de la clase ${index + 1}`;
                      return (
                        <Stack key={attribute.key} direction="row" spacing={1} alignItems="center">
                          <Checkbox size="small" checked={attributeIncluded} disabled={!included} onChange={() => toggle(attribute.key)} slotProps={{ input: { "aria-label": `Incluir ${label}` } }} />
                          <TextField size="small" label="Atributo" value={attribute.name} disabled={!attributeIncluded} onChange={(event) => editAttribute(entry.key, attribute.key, { name: event.target.value })} slotProps={{ htmlInput: { "aria-label": `Nombre del ${label}` } }} sx={{ flex: 1 }} />
                          <TextField size="small" label="Tipo" value={attribute.type} disabled={!attributeIncluded} onChange={(event) => editAttribute(entry.key, attribute.key, { type: event.target.value })} slotProps={{ htmlInput: { "aria-label": `Tipo del ${label}` } }} sx={{ width: 160 }} />
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            );
          })}

          {draft.enumerations.length > 0 && <Typography variant="subtitle2">Enumeraciones</Typography>}
          {draft.enumerations.map((entry, index) => {
            const included = !excluded.has(entry.key);
            return (
              <Stack key={entry.key} direction="row" spacing={1} alignItems="center">
                <Checkbox checked={included} onChange={() => toggle(entry.key)} slotProps={{ input: { "aria-label": `Incluir enumeración ${index + 1}` } }} />
                <TextField size="small" label="Enumeración" value={entry.name} disabled={!included} onChange={(event) => editEnumeration(entry.key, event.target.value)} slotProps={{ htmlInput: { "aria-label": `Nombre de la enumeración ${index + 1}` } }} />
                <Typography variant="body2" color="text.secondary">{entry.literals.join(", ") || "Sin literales"}</Typography>
              </Stack>
            );
          })}

          {draft.relationships.length > 0 && <Typography variant="subtitle2">Relaciones</Typography>}
          {draft.relationships.map((entry, index) => {
            const dependsOnExcluded = endExcluded(entry.source) || endExcluded(entry.target);
            const multiplicities = entry.type === "Generalization" || (!entry.sourceMultiplicity && !entry.targetMultiplicity) ? "" : ` (${formatMultiplicity(entry.sourceMultiplicity) || "?"} / ${formatMultiplicity(entry.targetMultiplicity) || "?"})`;
            const description = `${RELATIONSHIP_LABEL[entry.type]}: ${endName(entry.source)} → ${endName(entry.target)}${multiplicities}`;
            return (
              <FormControlLabel
                key={entry.key}
                control={<Checkbox checked={!dependsOnExcluded && !excluded.has(entry.key)} disabled={dependsOnExcluded} onChange={() => toggle(entry.key)} slotProps={{ input: { "aria-label": `Incluir relación ${index + 1}` } }} />}
                label={<Typography variant="body2">{description}{dependsOnExcluded ? " — excluida con su clase" : ""}</Typography>}
              />
            );
          })}

          {diagnostics.length > 0 && (
            <>
              <Divider />
              <List dense aria-label="Diagnósticos de importación">
                {diagnostics.map((entry, index) => (
                  <ListItem key={`${entry.code}-${entry.key ?? ""}-${index}`} disableGutters>
                    <Alert severity={severityOf(entry.severity)} sx={{ width: "100%" }}><ListItemText primary={entry.message} /></Alert>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="contained" onClick={apply} disabled={readOnly || review.empty || !review.preview.valid}>Aplicar</Button>
      </DialogActions>
    </Dialog>
  );
}
