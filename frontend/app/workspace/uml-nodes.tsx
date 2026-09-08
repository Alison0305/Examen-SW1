"use client";

import { Box, Stack, Typography } from "@mui/material";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { UmlNodeData, UmlReactFlowNode } from "./react-flow-adapters";
import { visibilitySymbol } from "./workspace-utils";

export function UmlClassNode({ data, selected }: NodeProps<UmlReactFlowNode>) {
  return <UmlClassifierNode data={data} selected={selected || data.selected} stereotype={null} />;
}

export function UmlEnumerationNode({ data, selected }: NodeProps<UmlReactFlowNode>) {
  return <UmlClassifierNode data={data} selected={selected || data.selected} stereotype="<<enumeration>>" />;
}

function UmlClassifierNode({
  data,
  selected,
  stereotype,
}: Readonly<{ data: UmlNodeData; selected: boolean; stereotype: string | null }>) {
  const rows = data.kind === "class" ? data.attributes ?? [] : data.literals ?? [];
  return (
    <Box
      role="button"
      aria-label={`Nodo visual ${data.kind === "class" ? "clase" : "enum"} ${data.label}`}
      data-testid={`uml-node-${data.label}`}
      sx={{
        minWidth: 180,
        maxWidth: 240,
        bgcolor: "background.paper",
        border: "2px solid",
        borderColor: selected ? "primary.main" : "grey.400",
        borderRadius: 1.5,
        boxShadow: selected ? "0 0 0 4px rgba(15, 76, 129, 0.14)" : "0 10px 24px rgba(15, 23, 42, 0.12)",
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Stack sx={{ bgcolor: data.kind === "class" ? "primary.main" : "secondary.main", color: "primary.contrastText", px: 1.5, py: 1 }}>
        {stereotype && (
          <Typography variant="caption" textAlign="center" sx={{ opacity: 0.9 }}>
            {stereotype}
          </Typography>
        )}
        <Typography fontWeight={700} textAlign="center" variant="body2">
          {visibilitySymbol(data.visibility)} {data.label}
        </Typography>
      </Stack>
      <Stack spacing={0.5} sx={{ borderTop: "1px solid", borderColor: "grey.300", px: 1.25, py: 1, minHeight: 34 }}>
        {rows.length === 0 && (
          <Typography color="text.secondary" variant="caption">
            {data.kind === "class" ? "Sin atributos" : "Sin literales"}
          </Typography>
        )}
        {rows.map((row) => (
          <Typography key={row} variant="caption" sx={{ fontFamily: "monospace" }}>
            {formatNodeRow(row, data.kind)}
          </Typography>
        ))}
      </Stack>
      <Handle type="source" position={Position.Right} />
    </Box>
  );
}

function formatNodeRow(row: string, kind: "class" | "enumeration"): string {
  if (kind === "enumeration") {
    return row;
  }

  const [visibility, name, type] = row.split(":");
  return `${visibilitySymbol(visibility as UmlNodeData["visibility"])} ${name}: ${type}`;
}
