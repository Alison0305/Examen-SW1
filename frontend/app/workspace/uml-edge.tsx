"use client";

import { Box, TextField } from "@mui/material";
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { UmlReactFlowEdge } from "./react-flow-adapters";
import type { UmlRelationshipType } from "@examen-sw1/uml-core";
import { calculateDiamondGeometry, calculateUmlEdgeRoute, routeLabelPosition, routeMultiplicityLabelPositions, routePath } from "./uml-edge-routing";
import { useWorkspaceStore } from "./workspace-store";

export function getUmlRelationshipMarkers(id: string, relationshipType: UmlRelationshipType) {
  return {
    // Kept as metadata for callers; custom edges render the diamond directly.
    markerStartId: relationshipType === "Aggregation" || relationshipType === "Composition" ? `${id}-${relationshipType.toLowerCase()}-diamond` : undefined,
    markerEndId: relationshipType === "Generalization" ? `${id}-generalization-triangle` : undefined,
  };
}

export function UmlRelationshipEdge(props: EdgeProps<UmlReactFlowEdge>) {
  const relationshipType = props.data?.relationshipType ?? "Association";
  const selected = props.selected || props.data?.selected;
  const stroke = "#111827";
  const { selectRelationship, updateRelationshipName } = useWorkspaceStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const saved = useRef(false);
  const { markerEndId } = getUmlRelationshipMarkers(props.id, relationshipType);
  const route = props.data?.route ?? calculateUmlEdgeRoute(
    { x: props.sourceX, y: props.sourceY, width: 0, height: 0 },
    { x: props.targetX, y: props.targetY, width: 0, height: 0 },
  );
  const labelPosition = routeLabelPosition(route);
  const diamond = relationshipType === "Aggregation" || relationshipType === "Composition" ? calculateDiamondGeometry(route.points[0], route.points[1] ?? route.points[0]) : undefined;
  const visibleRoute = diamond ? { ...route, points: [diamond.lineStart, ...route.points.slice(1)] } : route;
  const editable = relationshipType !== "Generalization";
  const label = props.data?.label ?? "";
  function saveName() {
    if (!editing || saved.current) return;
    saved.current = true;
    if (draft !== label) updateRelationshipName(props.id, draft);
    setEditing(false);
  }
  function openEditor(event: MouseEvent<SVGPathElement>) {
    if (!editable) return;
    event.stopPropagation();
    selectRelationship(props.id);
    saved.current = false;
    setDraft(label);
    setEditing(true);
  }

  return (
    <>
      <RelationshipMarkerDefinitions id={props.id} markerEndId={markerEndId} stroke={stroke} />
      <path
        data-testid={`uml-edge-path-${props.id}`}
        className="react-flow__edge-path"
        onDoubleClick={openEditor}
        d={routePath(visibleRoute)}
        fill="none"
        markerEnd={markerEndId ? `url(#${markerEndId})` : undefined}
        style={{
          stroke,
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {diamond && (
        <polygon
          data-testid={`uml-${relationshipType.toLowerCase()}-diamond-${props.id}`}
          points={diamond.points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill={relationshipType === "Composition" ? stroke : "white"}
          stroke={stroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      )}
      <EdgeLabelRenderer>
        {editing ? (
          <TextField
            autoFocus
            data-testid={`uml-edge-name-editor-${props.id}`}
            inputProps={{ "aria-label": "Editar nombre de relación" }}
            size="small"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveName();
              }
              if (event.key === "Escape") {
                saved.current = true;
                setEditing(false);
              }
            }}
            sx={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelPosition.x}px, ${labelPosition.y}px)`, width: 150, bgcolor: "background.paper", zIndex: 20 }}
          />
        ) : label && (
          <EdgeLabel dataTestId={`uml-edge-${props.id}`} x={labelPosition.x} y={labelPosition.y} selected={selected}>
            {label}
          </EdgeLabel>
        )}
        <UmlRelationshipMultiplicityLabels
          edgeId={props.id}
          selected={selected}
          sourceMultiplicityLabel={props.data?.sourceMultiplicityLabel ?? ""}
          targetMultiplicityLabel={props.data?.targetMultiplicityLabel ?? ""}
          positions={routeMultiplicityLabelPositions(visibleRoute)}
        />
      </EdgeLabelRenderer>
    </>
  );
}

export interface MultiplicityLabelPositionsInput {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export interface MultiplicityLabelPositions {
  source: { x: number; y: number };
  target: { x: number; y: number };
}

export function getMultiplicityLabelPositions({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: MultiplicityLabelPositionsInput): MultiplicityLabelPositions {
  return routeMultiplicityLabelPositions({ points: [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }], sourceSide: "right", targetSide: "left" });
}

export function UmlRelationshipMultiplicityLabels({
  edgeId,
  positions,
  selected,
  sourceMultiplicityLabel,
  targetMultiplicityLabel,
}: Readonly<{
  edgeId: string;
  positions: MultiplicityLabelPositions;
  selected?: boolean;
  sourceMultiplicityLabel: string;
  targetMultiplicityLabel: string;
}>) {
  return (
    <>
      {sourceMultiplicityLabel && (
        <EdgeLabel dataTestId={`uml-edge-${edgeId}-source-multiplicity`} x={positions.source.x} y={positions.source.y} selected={selected}>
          {sourceMultiplicityLabel}
        </EdgeLabel>
      )}
      {targetMultiplicityLabel && (
        <EdgeLabel dataTestId={`uml-edge-${edgeId}-target-multiplicity`} x={positions.target.x} y={positions.target.y} selected={selected}>
          {targetMultiplicityLabel}
        </EdgeLabel>
      )}
    </>
  );
}

function RelationshipMarkerDefinitions({
  id,
  markerEndId,
  stroke,
}: Readonly<{
  id: string;
  markerEndId?: string;
  stroke: string;
}>) {
  return (
    <defs>
      {markerEndId && (
        <marker id={markerEndId} data-testid={`uml-marker-${id}-generalization`} markerWidth="11" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M 1 1 L 10 5 L 1 9 Z" fill="white" stroke={stroke} strokeWidth="1.25" />
        </marker>
      )}
    </defs>
  );
}

function EdgeLabel({ children, dataTestId, selected, x, y }: Readonly<{ children: ReactNode; dataTestId: string; selected?: boolean; x: number; y: number }>) {
  return (
    <Box
      data-testid={dataTestId}
      sx={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "grey.300",
        borderRadius: 1,
        color: "text.secondary",
        fontSize: 11,
        px: 0.75,
        py: 0.25,
        pointerEvents: "all",
        whiteSpace: "nowrap",
        zIndex: 20,
      }}
    >
      {children}
    </Box>
  );
}
