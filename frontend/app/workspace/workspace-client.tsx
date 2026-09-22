"use client";

import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  SvgIcon,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodes,
  type NodeChange,
} from "@xyflow/react";
import { useEffect, useId, useRef, useState } from "react";
import { parseUmlTextProposal, type Diagnostic, type ProjectDocument, type UmlAttribute, type UmlRelationshipType, type UmlTextProposal, type UmlVisibility } from "@examen-sw1/uml-core";
import { applyVisualNodeChanges, toReactFlowEdges, toReactFlowNodes, type UmlReactFlowNode } from "./react-flow-adapters";
import { UmlRelationshipEdge } from "./uml-edge";
import { VoiceTranscriptInput } from "../voice-transcript-input";
import { UmlClassNode, UmlEnumerationNode } from "./uml-nodes";
import { formatMultiplicity, formatType, primitiveTypeNames } from "./workspace-utils";
import { setWorkspacePersistentChangeListener, setWorkspaceReadOnly, useWorkspaceStore, type WorkspaceSelection, type WorkspaceTool } from "./workspace-store";
import type { ProjectPresence } from "./realtime-client";

const nodeTypes = {
  umlClass: UmlClassNode,
  umlEnumeration: UmlEnumerationNode,
};

const edgeTypes = {
  umlRelationship: UmlRelationshipEdge,
};

const relationshipTools: UmlRelationshipType[] = ["Association", "Aggregation", "Composition", "Generalization"];
const visibilities: UmlVisibility[] = ["public", "private", "protected", "package"];

export const workspaceCanvasInteractionProps = {
  autoPanOnNodeDrag: false,
  panOnDrag: true,
  zoomOnScroll: true,
};

export function toCanvasCursorPosition(
  flowPosition: { x: number; y: number },
  flowToScreenPosition: (position: { x: number; y: number }) => { x: number; y: number },
  canvasBounds?: Pick<DOMRect, "left" | "top">,
): { x: number; y: number } {
  const screenPosition = flowToScreenPosition(flowPosition);
  return canvasBounds
    ? { x: screenPosition.x - canvasBounds.left, y: screenPosition.y - canvasBounds.top }
    : screenPosition;
}

export type WorkspaceClientProps = {
  projectName?: string;
  saveState?: "clean" | "dirty" | "saving";
  onSave?: () => void | Promise<void>;
  onBack?: () => void;
  onPersistentChange?: () => void;
  staleConflict?: boolean;
  onReloadServerVersion?: () => void | Promise<void>;
  onGenerateBackend?: () => void;
  readOnly?: boolean;
  collaboration?: {
    connection: "connecting" | "connected" | "reconnecting" | "disconnected" | "resyncing" | "conflict";
    revision: number;
    presence: ProjectPresence[];
    onSelection: (selectionId?: string) => void;
    onCursor: (cursor: { x: number; y: number }) => void;
    onEditing: (editingElementId?: string | null) => void;
    onResync: () => void;
  };
};

export function WorkspaceClient({ projectName, saveState, onSave, onBack, onPersistentChange, staleConflict, onReloadServerVersion, onGenerateBackend, readOnly = false, collaboration }: Readonly<WorkspaceClientProps>) {
  useEffect(() => {
    setWorkspacePersistentChangeListener(onPersistentChange);
    setWorkspaceReadOnly(readOnly);
    return () => { setWorkspacePersistentChangeListener(); setWorkspaceReadOnly(false); };
  }, [onPersistentChange, readOnly]);
  return (
    <ReactFlowProvider>
      <WorkspaceContent projectName={projectName} saveState={saveState} onSave={onSave} onBack={onBack} staleConflict={staleConflict} onReloadServerVersion={onReloadServerVersion} onGenerateBackend={onGenerateBackend} readOnly={readOnly} collaboration={collaboration} />
    </ReactFlowProvider>
  );
}

function WorkspaceContent({ projectName, saveState, onSave, onBack, staleConflict, onReloadServerVersion, onGenerateBackend, readOnly = false, collaboration }: Readonly<WorkspaceClientProps>) {
  const store = useWorkspaceStore();
  const flow = useReactFlow();
  const [, setViewportVersion] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const selectedId = store.selection?.id;
  const measuredNodes = useNodes();
  const remoteSelectionIds = collaboration?.presence.filter((member) => member.online).map((member) => member.selectionId).filter((id): id is string => Boolean(id)) ?? [];
  const [renderNodes, setRenderNodes] = useState<UmlReactFlowNode[]>(() => toReactFlowNodes(store.document, selectedId, readOnly, remoteSelectionIds));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const edges = toReactFlowEdges(store.document, selectedId, measuredNodes);

  useEffect(() => {
    setRenderNodes(toReactFlowNodes(store.document, selectedId, readOnly, remoteSelectionIds));
  }, [store.document, selectedId, readOnly, remoteSelectionIds.join(",")]);

  useEffect(() => {
    if (!store.focusedElementId) {
      return;
    }
    const layout = store.document.layout.elements.find((entry) => entry.elementId === store.focusedElementId);
    if (layout) {
      void flow.setCenter(layout.x + (layout.width ?? 180) / 2, layout.y + (layout.height ?? 120) / 2, { zoom: 1, duration: 0 });
    }
  }, [flow, store.document, store.focusedElementId]);

  function fitView() {
    void flow.fitView({ padding: 0.2, duration: 0 });
    store.markFitView();
  }

  return (
    <Box component="main" sx={{ minHeight: "100vh", bgcolor: "#eef2f7", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
        <WorkspaceAppBar
        compact={compact}
        onFitView={fitView}
        onOpenInspector={() => setInspectorOpen(true)}
        onOpenSidebar={() => setSidebarOpen(true)}
        projectName={projectName}
        saveState={saveState}
        onSave={onSave}
        onBack={onBack}
        staleConflict={staleConflict}
          onReloadServerVersion={onReloadServerVersion}
          onGenerateBackend={onGenerateBackend}
          readOnly={readOnly}
          collaboration={collaboration}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: compact ? "minmax(0, 1fr)" : "240px minmax(0, 1fr) 340px", minHeight: 0 }}>
        {compact ? (
          <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
            <WorkspaceSidebar drawer readOnly={readOnly} />
          </Drawer>
        ) : (
          <WorkspaceSidebar readOnly={readOnly} />
        )}
        <Box sx={{ p: 2, minHeight: 620 }}>
          <Stack spacing={1.5} sx={{ height: "100%" }}>
            <Card variant="outlined" sx={{ flex: 1, overflow: "hidden", borderColor: "grey.300" }}>
              <Box ref={canvasRef} sx={{ height: "100%", minHeight: 540, minWidth: 0, position: "relative" }} data-testid="workspace-canvas">
                <ReactFlow
                  nodes={renderNodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={(changes: NodeChange<UmlReactFlowNode>[]) => {
                    // VIEWERs may update visual selection, but never a node position.
                    const allowedChanges = readOnly ? changes.filter((change) => change.type === "select") : changes;
                    if (allowedChanges.length > 0) setRenderNodes((nodes) => applyVisualNodeChanges(nodes, allowedChanges));
                  }}
                  onNodeClick={(_, node) => { store.selectElement(node.id); collaboration?.onSelection(node.id); }}
                  onEdgeClick={(_, edge) => { store.selectRelationship(edge.id); collaboration?.onSelection(edge.id); }}
                  onNodeDragStart={(_, node) => collaboration?.onEditing(node.id)}
                  onNodeDragStop={(_, node) => { collaboration?.onEditing(null); if (!readOnly) store.moveElement(node.id, node.position.x, node.position.y); }}
                  onMouseMove={(event) => collaboration?.onCursor(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))}
                  // Re-project remote flow coordinates while this client pans or zooms.
                  onMove={() => setViewportVersion((version) => version + 1)}
                  nodesDraggable={!readOnly}
                  fitView
                  {...workspaceCanvasInteractionProps}
                >
                  <Background gap={18} size={1} color="#d8dee9" />
                  <Controls showInteractive={false} />
                  <MiniMap pannable zoomable />
                </ReactFlow>
                <CanvasAccessibilityLayer />
                {collaboration?.presence.filter((member) => member.online && member.cursor).map((member) => {
                  // Presence is shared in flow coordinates; project it into this client's viewport.
                  const cursorPosition = toCanvasCursorPosition(
                    member.cursor!,
                    (position) => flow.flowToScreenPosition(position),
                    canvasRef.current?.getBoundingClientRect(),
                  );

                  return (
                    <Box key={member.userId} data-testid={`remote-cursor-${member.userId}`} sx={{ position: "absolute", pointerEvents: "none", left: cursorPosition.x, top: cursorPosition.y, zIndex: 5 }}>
                      <Box data-testid={`remote-cursor-badge-${member.userId}`} sx={{ position: "relative", left: 6, top: 6, bgcolor: "warning.main", color: "warning.contrastText", borderRadius: 1, px: 0.5, fontSize: 11 }}>
                        {member.avatar}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Card>
          </Stack>
        </Box>
        {compact ? (
          <Drawer anchor="right" open={inspectorOpen} onClose={() => setInspectorOpen(false)}>
            <WorkspaceInspector drawer readOnly={readOnly} />
          </Drawer>
        ) : (
          <WorkspaceInspector readOnly={readOnly} />
        )}
      </Box>
      <WorkspaceStatusBar collaboration={collaboration} />
    </Box>
  );
}

function CanvasAccessibilityLayer() {
  const { document, selection, selectElement } = useWorkspaceStore();
  return (
    <Box
      aria-label="Proyección accesible del canvas UML"
      sx={{
        position: "absolute",
        width: 1,
        height: 1,
        p: 0,
        m: -1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {document.uml.classes.map((umlClass) => (
        <Box key={umlClass.id}>
          <button type="button" aria-label={`Nodo clase ${umlClass.name}`} aria-pressed={selection?.id === umlClass.id} onClick={() => selectElement(umlClass.id)}>
            Nodo clase {umlClass.name}
          </button>
        </Box>
      ))}
      {document.uml.enumerations.map((enumeration) => (
        <Box key={enumeration.id}>
          <button type="button" aria-label={`Nodo enum ${enumeration.name}`} aria-pressed={selection?.id === enumeration.id} onClick={() => selectElement(enumeration.id)}>
            Nodo enum {enumeration.name}
          </button>
        </Box>
      ))}
    </Box>
  );
}

function WorkspaceAppBar({
  compact,
  onFitView,
  onOpenInspector,
  onOpenSidebar,
  projectName,
  saveState,
  onSave,
  onBack,
  staleConflict,
  onReloadServerVersion,
  onGenerateBackend,
  readOnly = false,
  collaboration,
}: Readonly<{ compact: boolean; onFitView: () => void; onOpenInspector: () => void; onOpenSidebar: () => void } & WorkspaceClientProps>) {
  const { canUndo, canRedo, undo, redo, validateDocument } = useWorkspaceStore();
  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "grey.300" }}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography component="h1" variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
          {projectName ?? "Proyecto UML local"}
        </Typography>
        {onBack && <Button variant="text" onClick={onBack}>Volver a proyectos</Button>}
        {onGenerateBackend && <Button variant="contained" color="secondary" onClick={onGenerateBackend}>Generar backend</Button>}
        {onSave && <Button variant="contained" onClick={() => void onSave()} disabled={saveState !== "dirty" || readOnly}>Guardar</Button>}
        {onSave && <Typography variant="caption">{saveState === "saving" ? "Guardando..." : saveState === "dirty" ? "Cambios sin guardar" : "Guardado"}</Typography>}
        {collaboration && <Stack direction="row" spacing={0.5} alignItems="center" aria-label="Colaboradores">
          {collaboration.presence.filter((member) => member.online).map((member) => <Chip key={member.userId} size="small" label={member.avatar} title={`${member.displayName}${member.editingElementId ? " editando" : ""}`} />)}
          <Chip size="small" color={collaboration.connection === "connected" ? "success" : "warning"} label={collaboration.connection === "connected" ? `Sincronizado r${collaboration.revision}` : collaboration.connection} onClick={collaboration.connection !== "connected" ? collaboration.onResync : undefined} />
        </Stack>}
        {staleConflict && onReloadServerVersion && <Button color="warning" onClick={() => void onReloadServerVersion()}>Recargar versión</Button>}
        {compact && <IconButton aria-label="Abrir sidebar" onClick={onOpenSidebar}>Menu</IconButton>}
        {compact && <Button variant="outlined" onClick={onOpenInspector}>Inspector</Button>}
        <Tooltip title="Deshacer">
          <span>
            <IconButton onClick={undo} disabled={!canUndo || readOnly} aria-label="Deshacer">
              ↶
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Rehacer">
          <span>
            <IconButton onClick={redo} disabled={!canRedo || readOnly} aria-label="Rehacer">
              ↷
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="outlined" onClick={onFitView} aria-label="Ajustar vista">Ajustar vista</Button>
        <Button variant="contained" onClick={validateDocument}>Validar</Button>
      </Toolbar>
    </AppBar>
  );
}

function WorkspaceSidebar({ drawer = false, readOnly = false }: Readonly<{ drawer?: boolean; readOnly?: boolean }>) {
  const { document, activeTool, pendingRelationshipSourceId, selectRelationship } = useWorkspaceStore();
  return (
    <Box component="aside" aria-label="Sidebar" data-testid="workspace-left-column" sx={{ width: drawer ? 280 : "auto", borderRight: "1px solid", borderColor: "grey.300", bgcolor: "background.paper", p: 2, overflow: "auto" }}>
      <Stack spacing={2}>
        <WorkspaceToolbox readOnly={readOnly} />
        <WorkspaceTextAssistant readOnly={readOnly} />
        <Divider />
        <Box>
          <Typography variant="overline" color="text.secondary">Breadcrumbs</Typography>
          <Typography variant="body2">Inicio / Proyecto UML local / Workspace</Typography>
        </Box>
        <Divider />
        <Typography variant="subtitle2">Resumen</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={`${document.uml.classes.length} clases`} size="small" />
          <Chip label={`${document.uml.enumerations.length} enums`} size="small" />
          <Chip label={`${document.uml.relationships.length} relaciones`} size="small" />
        </Stack>
        <Alert severity="info">CanonicalUmlModel es la fuente semántica. DiagramLayout guarda solo posiciones.</Alert>
        {pendingRelationshipSourceId && <Alert severity="success">Origen seleccionado. Selecciona destino para {activeTool}.</Alert>}
        <Divider />
        <Typography variant="subtitle2">Relaciones</Typography>
        {document.uml.relationships.length === 0 && <Typography color="text.secondary" variant="body2">Sin relaciones</Typography>}
        {document.uml.relationships.map((relationship) => (
          <Button key={relationship.id} size="small" variant="text" onClick={() => selectRelationship(relationship.id)}>
            Relación {relationship.name || relationship.type}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}

function WorkspaceTextAssistant({ readOnly }: Readonly<{ readOnly: boolean }>) {
  const applyTextProposal = useWorkspaceStore((state) => state.applyTextProposal);
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState<UmlTextProposal | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function interpret() {
    if (!input.trim()) return;
    const result = parseUmlTextProposal(input);
    if (result.success) {
      setProposal(result.proposal);
      setRejection(null);
    } else {
      setProposal(null);
      setRejection(result.message);
    }
  }

  function cancel() {
    setProposal(null);
    setConfirmingDelete(false);
  }

  function approve() {
    if (!proposal) return;
    if (proposal.type === "DELETE_CLASS") {
      setConfirmingDelete(true);
      return;
    }
    applyTextProposal(proposal);
    cancel();
  }

  function confirmDelete() {
    if (proposal?.type !== "DELETE_CLASS") return;
    applyTextProposal(proposal);
    cancel();
  }

  return (
    <Card variant="outlined" aria-label="Asistente textual UML">
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={1.25}>
          <Typography variant="subtitle2">Asistente textual UML</Typography>
          <VoiceTranscriptInput disabled={readOnly} onTranscript={setInput} />
          <TextField
            label="Instrucción UML"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            size="small"
            disabled={readOnly}
            helperText={'CREATE_CLASS name="..."'}
          />
          <Button variant="outlined" onClick={interpret} disabled={readOnly || !input.trim()}>Interpretar</Button>
          {rejection && <Alert severity="error">{rejection}</Alert>}
          {proposal && <Alert severity="info">
            <Typography variant="body2">Propuesta: {formatTextProposal(proposal)}</Typography>
            <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
              <Button size="small" variant="contained" onClick={approve}>Aprobar</Button>
              <Button size="small" variant="outlined" onClick={cancel}>Cancelar</Button>
            </Stack>
          </Alert>}
        </Stack>
      </CardContent>
      <Dialog open={confirmingDelete} onClose={cancel}>
        <DialogTitle>Confirmar eliminación de clase</DialogTitle>
        <DialogContent><Typography>Esta acción eliminará la clase propuesta mediante el Command Bus.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={cancel}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Confirmar eliminación</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function formatTextProposal(proposal: UmlTextProposal): string {
  switch (proposal.type) {
    case "CREATE_CLASS": return `Crear clase ${proposal.name}`;
    case "RENAME_CLASS": return `Renombrar ${proposal.targetId} a ${proposal.name}`;
    case "DELETE_CLASS": return `Eliminar clase ${proposal.targetId}`;
  }
}

function WorkspaceToolbox({ readOnly = false }: Readonly<{ readOnly?: boolean }>) {
  const { activeTool, setTool, createClass, createEnumeration, applyAutoLayout } = useWorkspaceStore();
  const toolButton = (tool: WorkspaceTool, label: string) => (
    <Button key={tool} fullWidth aria-label={label} startIcon={<ToolboxIcon tool={tool} />} sx={{ justifyContent: "flex-start" }} variant={activeTool === tool ? "contained" : "outlined"} onClick={() => setTool(tool)}>
      {label}
    </Button>
  );

  return (
    <Card variant="outlined" aria-label="Toolbox" data-testid="workspace-toolbox"><fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack role="toolbar" aria-orientation="vertical" spacing={1} alignItems="stretch">
          <Typography variant="subtitle2">Toolbox</Typography>
          {toolButton("select", "Selección")}
          <Button fullWidth aria-label="Clase" startIcon={<ToolboxIcon tool="class" />} sx={{ justifyContent: "flex-start" }} variant="outlined" onClick={createClass}>Clase</Button>
          <Button fullWidth aria-label="Enum" startIcon={<ToolboxIcon tool="enum" />} sx={{ justifyContent: "flex-start" }} variant="outlined" onClick={createEnumeration}>Enum</Button>
          {relationshipTools.map((tool) => toolButton(tool, tool))}
          <Tooltip title="Calcula posiciones con ELK y las aplica como una sola operación undoable">
            <span>
              <Button fullWidth aria-label="Auto-layout" startIcon={<ToolboxIcon tool="auto-layout" />} sx={{ justifyContent: "flex-start" }} variant="outlined" onClick={() => void applyAutoLayout()}>
                Auto-layout
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </CardContent>
    </fieldset></Card>
  );
}

function ToolboxIcon({ tool }: Readonly<{ tool: WorkspaceTool | "auto-layout" }>) {
  const common = { fontSize: "small" as const };
  if (tool === "select") return <SvgIcon {...common}><path d="M4 2 20 12 12 14 9 21z" fill="currentColor" /></SvgIcon>;
  if (tool === "class") return <SvgIcon {...common}><path d="M3 4h18v16H3zM3 9h18M6 13h12M6 17h8" fill="none" stroke="currentColor" strokeWidth="1.8" /></SvgIcon>;
  if (tool === "enum") return <SvgIcon {...common}><path d="M3 4h18v16H3zM6 9h12M6 13h12M6 17h12" fill="none" stroke="currentColor" strokeWidth="1.8" /></SvgIcon>;
  if (tool === "Aggregation" || tool === "Composition") return <SvgIcon {...common}><path d="M8 12h13" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m3 12 4-4 4 4-4 4z" fill={tool === "Composition" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" /></SvgIcon>;
  if (tool === "Generalization") return <SvgIcon {...common}><path d="M3 12h11" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m21 12-7-5v10z" fill="none" stroke="currentColor" strokeWidth="1.8" /></SvgIcon>;
  if (tool === "auto-layout") return <SvgIcon {...common}><path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5zM9 6.5h6M6.5 9v6M17.5 9v6M9 17.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" /></SvgIcon>;
  return <SvgIcon {...common}><path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" /></SvgIcon>;
}

function WorkspaceInspector({ drawer = false, readOnly = false }: Readonly<{ drawer?: boolean; readOnly?: boolean }>) {
  const store = useWorkspaceStore();
  const selected = resolveSelected(store.document, store.selection);

  return (
    <Box component="aside" aria-label="Inspector" sx={{ width: drawer ? 340 : "auto", borderLeft: "1px solid", borderColor: "grey.300", bgcolor: "background.paper", p: 2, overflow: "auto" }}>
      <Stack spacing={2}><fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <Typography component="h2" variant="h6">Inspector</Typography>
        {!selected && <Alert severity="info">Selecciona una clase, enum o relación para editar sus propiedades.</Alert>}
        {selected?.kind === "class" && <ClassInspector classId={selected.value.id} />}
        {selected?.kind === "enumeration" && <EnumerationInspector enumerationId={selected.value.id} />}
        {selected?.kind === "relationship" && <RelationshipInspector relationshipId={selected.value.id} />}
        </fieldset><DiagnosticsPanel commandDiagnostics={store.commandDiagnostics} documentDiagnostics={store.documentDiagnostics} document={store.document} />
      </Stack>
    </Box>
  );
}

function ClassInspector({ classId }: Readonly<{ classId: string }>) {
  const { document, updateClass, addAttribute, updateAttribute, removeAttribute, deleteSelectedClass } = useWorkspaceStore();
  const umlClass = document.uml.classes.find((candidate) => candidate.id === classId);
  const [name, setName] = useState(umlClass?.name ?? "");
  const [visibility, setVisibility] = useState<UmlVisibility>(umlClass?.visibility ?? "public");
  const [isCreatingAttribute, setIsCreatingAttribute] = useState(false);
  const [editingAttributeId, setEditingAttributeId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<AttributeDraft>(initialAttributeDraft());
  const [editDraft, setEditDraft] = useState<AttributeDraft>(initialAttributeDraft());

  useEffect(() => {
    setName(umlClass?.name ?? "");
    setVisibility(umlClass?.visibility ?? "public");
  }, [umlClass?.id, umlClass?.name, umlClass?.visibility]);

  useEffect(() => {
    setIsCreatingAttribute(false);
    setEditingAttributeId(null);
    setCreateDraft(initialAttributeDraft());
    setEditDraft(initialAttributeDraft());
  }, [classId]);

  if (!umlClass) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">Clase {umlClass.name}</Typography>
      <TextField label="ID de clase" value={umlClass.id} InputProps={{ readOnly: true }} size="small" />
      <TextField label="Nombre de clase" value={name} onChange={(event) => setName(event.target.value)} size="small" />
      <VisibilitySelect label="Visibilidad de clase" value={visibility} onChange={setVisibility} />
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={() => updateClass(classId, name, visibility)}>Guardar clase</Button>
        <Button color="error" variant="contained" onClick={deleteSelectedClass}>Eliminar clase</Button>
      </Stack>
      <Divider />
      <Typography variant="subtitle2">Atributos</Typography>
      <Button variant="outlined" onClick={() => { setEditingAttributeId(null); setIsCreatingAttribute(true); }}>
        Agregar atributo
      </Button>
      <Collapse in={isCreatingAttribute} unmountOnExit>
        {isCreatingAttribute && (
          <AttributeForm
            title="Nuevo atributo"
            draft={createDraft}
            onChange={setCreateDraft}
            onCancel={() => { setIsCreatingAttribute(false); setCreateDraft(initialAttributeDraft()); }}
            onSave={() => {
              const result = addAttribute(classId, createDraft.name, createDraft.typeName, createDraft.visibility, createDraft.multiplicity);
              if (result.success) {
                setIsCreatingAttribute(false);
                setCreateDraft(initialAttributeDraft());
              }
            }}
            saveLabel="Guardar"
          />
        )}
      </Collapse>
      <Stack spacing={0.75} data-testid="attribute-list">
        {umlClass.attributes.map((attribute) => (
          <Box key={attribute.id} sx={{ border: "1px solid", borderColor: "grey.300", borderRadius: 1, px: 1, py: 0.75 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" sx={{ flexGrow: 1 }}>{attribute.name}: {formatType(attribute.type)}</Typography>
              <Button size="small" variant="outlined" onClick={() => { setIsCreatingAttribute(false); setEditingAttributeId(attribute.id); setEditDraft(attributeDraft(attribute)); }}>
                Editar
              </Button>
              <Button size="small" color="error" onClick={() => removeAttribute(classId, attribute.id)}>
                Eliminar
              </Button>
            </Stack>
            <Collapse in={editingAttributeId === attribute.id} unmountOnExit>
              {editingAttributeId === attribute.id && (
                <Box sx={{ pt: 1 }}>
                  <AttributeForm
                    title={`Editar atributo ${attribute.name}`}
                    draft={editDraft}
                    onChange={setEditDraft}
                    onCancel={() => { setEditingAttributeId(null); setEditDraft(initialAttributeDraft()); }}
                    onSave={() => {
                      const result = updateAttribute(classId, attribute.id, editDraft.name, editDraft.typeName, editDraft.visibility, editDraft.multiplicity);
                      if (result.success) {
                        setEditingAttributeId(null);
                        setEditDraft(initialAttributeDraft());
                      }
                    }}
                    saveLabel="Guardar cambios"
                  />
                </Box>
              )}
            </Collapse>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

interface AttributeDraft {
  name: string;
  typeName: string;
  visibility: UmlVisibility;
  multiplicity: string;
}

function initialAttributeDraft(): AttributeDraft {
  return { name: "id", typeName: "integer", visibility: "private", multiplicity: "1" };
}

function attributeDraft(attribute: UmlAttribute): AttributeDraft {
  return {
    name: attribute.name,
    typeName: attribute.type.kind === "primitive" ? attribute.type.name : "string",
    visibility: attribute.visibility,
    multiplicity: formatMultiplicity(attribute.multiplicity) || "1",
  };
}

function AttributeForm({
  draft,
  onCancel,
  onChange,
  onSave,
  saveLabel,
  title,
}: Readonly<{
  draft: AttributeDraft;
  onCancel: () => void;
  onChange: (draft: AttributeDraft) => void;
  onSave: () => void;
  saveLabel: string;
  title: string;
}>) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={1.25}>
          <Typography variant="body2" fontWeight={700}>{title}</Typography>
          <TextField label="Nombre de atributo" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} size="small" />
          <PrimitiveTypeSelect label="Tipo de atributo" value={draft.typeName} onChange={(typeName) => onChange({ ...draft, typeName })} />
          <VisibilitySelect label="Visibilidad de atributo" value={draft.visibility} onChange={(visibility) => onChange({ ...draft, visibility })} />
          <TextField label="Multiplicidad de atributo" value={draft.multiplicity} onChange={(event) => onChange({ ...draft, multiplicity: event.target.value })} size="small" />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={onSave}>{saveLabel}</Button>
            <Button size="small" variant="outlined" onClick={onCancel}>Cancelar</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function EnumerationInspector({ enumerationId }: Readonly<{ enumerationId: string }>) {
  const { document, updateEnumeration, addEnumerationLiteral, removeEnumerationLiteral, deleteSelectedEnumeration } = useWorkspaceStore();
  const enumeration = document.uml.enumerations.find((candidate) => candidate.id === enumerationId);
  const [name, setName] = useState(enumeration?.name ?? "");
  const [visibility, setVisibility] = useState<UmlVisibility>(enumeration?.visibility ?? "public");
  const [literal, setLiteral] = useState("PENDIENTE");

  useEffect(() => {
    setName(enumeration?.name ?? "");
    setVisibility(enumeration?.visibility ?? "public");
  }, [enumeration?.id, enumeration?.name, enumeration?.visibility]);

  if (!enumeration) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">Enum {enumeration.name}</Typography>
      <TextField label="Nombre de enum" value={name} onChange={(event) => setName(event.target.value)} size="small" />
      <VisibilitySelect label="Visibilidad de enum" value={visibility} onChange={setVisibility} />
      <Stack direction="row" spacing={1}>
        <Button sx={{ flex: 1 }} variant="contained" onClick={() => updateEnumeration(enumerationId, name, visibility)}>Guardar enum</Button>
        <Button sx={{ flex: 1 }} color="error" variant="contained" onClick={deleteSelectedEnumeration}>Eliminar enum</Button>
      </Stack>
      <Divider />
      <TextField label="Literal de enum" value={literal} onChange={(event) => setLiteral(event.target.value)} size="small" />
      <Button variant="outlined" onClick={() => addEnumerationLiteral(enumerationId, literal)}>Agregar literal</Button>
      {enumeration.literals.map((item) => (
        <Stack key={item} direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ flexGrow: 1 }}>{item}</Typography>
          <Button size="small" color="error" aria-label={`Eliminar literal ${item}`} onClick={() => removeEnumerationLiteral(enumerationId, item)}>
            Eliminar
          </Button>
        </Stack>
      ))}
    </Stack>
  );
}

function RelationshipInspector({ relationshipId }: Readonly<{ relationshipId: string }>) {
  const { document, updateRelationshipMultiplicity, updateRelationshipName, deleteSelectedRelationship } = useWorkspaceStore();
  const relationship = document.uml.relationships.find((candidate) => candidate.id === relationshipId);
  const [nameDraft, setNameDraft] = useState(relationship?.name ?? "");
  const [sourceMultiplicityDraft, setSourceMultiplicityDraft] = useState("");
  const [targetMultiplicityDraft, setTargetMultiplicityDraft] = useState("");

  useEffect(() => {
    // A relationship switch loads both drafts; command snapshots must not erase the opposite unsaved draft.
    setSourceMultiplicityDraft(formatMultiplicity(relationship?.sourceMultiplicity));
    setTargetMultiplicityDraft(formatMultiplicity(relationship?.targetMultiplicity));
  }, [relationshipId]);

  useEffect(() => {
    setNameDraft(relationship?.name ?? "");
  }, [relationshipId]);

  if (!relationship) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">Relación {relationship.type}</Typography>
      <Typography variant="body2">Origen: {elementName(document, relationship.sourceId)}</Typography>
      <Typography variant="body2">Destino: {elementName(document, relationship.targetId)}</Typography>
      {relationship.type !== "Generalization" && (
        <>
          <TextField label="Nombre de relación" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} size="small" />
          <Button
            variant="outlined"
            onClick={() => {
              const result = updateRelationshipName(relationshipId, nameDraft);
              if (result.success) {
                setNameDraft(result.document.uml.relationships.find((candidate) => candidate.id === relationshipId)?.name ?? "");
              }
            }}
          >
            Guardar nombre
          </Button>
        </>
      )}
      {relationship.type !== "Generalization" && (
        <>
          <TextField label="Multiplicidad origen" value={sourceMultiplicityDraft} onChange={(event) => setSourceMultiplicityDraft(event.target.value)} size="small" />
          <TextField label="Multiplicidad destino" value={targetMultiplicityDraft} onChange={(event) => setTargetMultiplicityDraft(event.target.value)} size="small" />
          <Button variant="outlined" onClick={() => updateRelationshipMultiplicity(relationshipId, "source", sourceMultiplicityDraft)}>
            Guardar multiplicidad origen
          </Button>
          <Button variant="outlined" onClick={() => updateRelationshipMultiplicity(relationshipId, "target", targetMultiplicityDraft)}>
            Guardar multiplicidad destino
          </Button>
        </>
      )}
      <Button color="error" variant="contained" onClick={deleteSelectedRelationship}>Eliminar relación</Button>
    </Stack>
  );
}

function DiagnosticsPanel({
  commandDiagnostics,
  documentDiagnostics,
  document,
}: Readonly<{ commandDiagnostics: Diagnostic[]; documentDiagnostics: Diagnostic[]; document: ProjectDocument }>) {
  const navigateToDiagnostic = useWorkspaceStore((state) => state.navigateToDiagnostic);
  const diagnostics = [...commandDiagnostics, ...documentDiagnostics];
  return (
    <Stack spacing={1} aria-label="Diagnósticos">
      <Typography variant="subtitle2">Validación y diagnósticos</Typography>
      {diagnostics.length === 0 && <Typography color="text.secondary" variant="body2">Sin diagnósticos.</Typography>}
      {diagnostics.map((diagnostic) => (
        <Alert
          key={`${diagnostic.path}-${diagnostic.code}-${diagnostic.elementId ?? "global"}`}
          severity={diagnostic.severity === "error" ? "error" : "warning"}
          action={
            isSelectableDiagnostic(document, diagnostic) ? <Button color="inherit" size="small" onClick={() => navigateToDiagnostic(diagnostic)}>Ir</Button> : undefined
          }
        >
          <Typography component="span" variant="body2" fontWeight={700}>{diagnostic.severity} - {diagnostic.code}</Typography>{" "}
          {diagnostic.message} <Typography component="span" variant="caption">Path: {diagnostic.path}</Typography>
        </Alert>
      ))}
    </Stack>
  );
}

function WorkspaceStatusBar({ collaboration }: Readonly<Pick<WorkspaceClientProps, "collaboration">>) {
  const { document, canUndo, canRedo, activeTool, focusedElementId, fitViewCount, autoLayoutCount, diagnostics } = useWorkspaceStore();
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  return (
    <Box component="footer" sx={{ borderTop: "1px solid", borderColor: "grey.300", bgcolor: "background.paper", px: 2, py: 1 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Typography variant="caption">Status Bar</Typography>
        <Typography variant="caption">Revisión local {document.revision}</Typography>
        {collaboration && <Typography variant="caption">Realtime {collaboration.connection} · revisión confirmada {collaboration.revision}</Typography>}
        <Typography variant="caption">Herramienta: {activeTool}</Typography>
        <Typography variant="caption">Deshacer {canUndo ? "habilitado" : "deshabilitado"}</Typography>
        <Typography variant="caption">Rehacer {canRedo ? "habilitado" : "deshabilitado"}</Typography>
        <Typography variant="caption">Zoom y pan activos</Typography>
        <Typography variant="caption">Ajustar vista ejecutado {fitViewCount} veces</Typography>
        <Typography variant="caption">Auto-layout ejecutado {autoLayoutCount} veces</Typography>
        <Typography variant="caption">Errores {errors}</Typography>
        <Typography variant="caption">Warnings {warnings}</Typography>
        {focusedElementId && <Typography variant="caption">Elemento enfocado {focusedElementId}</Typography>}
      </Stack>
    </Box>
  );
}

function PrimitiveTypeSelect({ label, value, onChange }: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) {
  const id = useId();
  return (
    <FormControl size="small">
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select id={id} labelId={`${id}-label`} label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {primitiveTypeNames.map((typeName) => <MenuItem key={typeName} value={typeName}>{typeName}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

function VisibilitySelect({ label, value, onChange }: Readonly<{ label: string; value: UmlVisibility; onChange: (value: UmlVisibility) => void }>) {
  const id = useId();
  return (
    <FormControl size="small">
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select id={id} labelId={`${id}-label`} label={label} value={value} onChange={(event) => onChange(event.target.value as UmlVisibility)}>
        {visibilities.map((visibility) => <MenuItem key={visibility} value={visibility}>{visibility}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

function resolveSelected(document: ProjectDocument, selection: WorkspaceSelection | null) {
  if (!selection) {
    return null;
  }
  if (selection.kind === "class") {
    const value = document.uml.classes.find((umlClass) => umlClass.id === selection.id);
    return value ? { kind: "class" as const, value } : null;
  }
  if (selection.kind === "enumeration") {
    const value = document.uml.enumerations.find((enumeration) => enumeration.id === selection.id);
    return value ? { kind: "enumeration" as const, value } : null;
  }
  const value = document.uml.relationships.find((relationship) => relationship.id === selection.id);
  return value ? { kind: "relationship" as const, value } : null;
}

function elementName(document: ProjectDocument, elementId: string): string {
  return (
    document.uml.classes.find((umlClass) => umlClass.id === elementId)?.name ??
    document.uml.enumerations.find((enumeration) => enumeration.id === elementId)?.name ??
    elementId
  );
}

function isSelectableDiagnostic(document: ProjectDocument, diagnostic: Diagnostic): boolean {
  return Boolean(diagnostic.elementId && resolveSelectionFromElement(document, diagnostic.elementId));
}

function resolveSelectionFromElement(document: ProjectDocument, elementId: string): WorkspaceSelection | null {
  if (document.uml.classes.some((umlClass) => umlClass.id === elementId)) {
    return { kind: "class", id: elementId };
  }
  if (document.uml.enumerations.some((enumeration) => enumeration.id === elementId)) {
    return { kind: "enumeration", id: elementId };
  }
  if (document.uml.relationships.some((relationship) => relationship.id === elementId)) {
    return { kind: "relationship", id: elementId };
  }
  return null;
}
