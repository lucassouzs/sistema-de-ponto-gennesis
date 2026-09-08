'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  ConnectionMode,
  addEdge,
  applyNodeChanges,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  type OnInit,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Redo2,
  Undo2,
  Wrench,
} from 'lucide-react';
import { updateFlowDiagram } from '@/lib/flow';
import { parseStoredFlow } from '@/lib/flowCanvas';
import { stripPreviewElements, isPreviewId, getAppendPlacement, applyAppendToNodes, buildAppendedFlowNodeFields } from '@/lib/flowAppend';
import {
  syncLaneHierarchy,
  deleteLaneWithChildren,
  LANE_NODE_TYPE,
  POOL_NODE_TYPE,
  applyLaneDimensionChange,
  filterIndependentLanePositionChanges,
  pinStackedLaneSiblingsDuringDrag,
  snapshotStackedLanePositions,
} from '@/lib/flowLaneHierarchy';
import { deletePoolWithContents } from '@/lib/flowPoolHierarchy';
import { snapNodePositionChangesWithGuides, type FlowAlignmentGuide } from '@/lib/flowNodeSnap';
import { repairFlowDiagram } from '@/lib/flowRepair';
import { useFlowHistory } from '@/hooks/useFlowHistory';
import { FlowHistoryProvider } from '@/contexts/FlowHistoryContext';
import { buildFlowEdge, buildForwardFlowEdge, connectableNodeIds, flowEdgeDefaults, hasDefinedEdgeHandles, inferMissingEdgeHandles, normalizeFlowEdge, refineConnectionTargetFromPointer, releaseEdgeRoutesForNodes, syncEdgeHandlesForMovedNodes, type FlowEdgeData } from '@/lib/flowEdge';
import { getDefaultNodeData } from '@/lib/flowNodeDefaults';
import type { FlowDiagram } from '@/lib/flowTypes';
import type { BpmnNodeType } from '@/lib/flowTypes';
import { flowNodeTypes, getDefaultNodeSize, FLOW_DND_TYPE } from './BpmnNodes';
import { FlowShapePalette } from './FlowShapePalette';
import { FlowAlignmentGuides } from './FlowAlignmentGuides';
import { FlowZoomControls } from './FlowZoomControls';
import { FlowMinimap } from './FlowMinimap';
import { FlowFileToolbar } from './FlowFileToolbar';
import { flowEdgeTypes } from './FlowStepEdge';
import { FlowSequenceFlowMarkerDefs } from './FlowSequenceFlowMarkerDefs';
import { FlowCanvasContextMenu } from './FlowCanvasContextMenu';
import { ensureSequenceFlowMarkerDefs } from '@/lib/flowArrowMarkers';
import { requestEdgeLabelEdit } from './FlowEdgeInlineLabel';
import type { FlowImportPayload } from '@/lib/flowExport';
import { exportReactFlowViewportToPng } from '@/lib/flowViewportPngExport';
import { copyFlowSelection, pasteFlowClipboard, type FlowClipboardPayload } from '@/lib/flowClipboard';
import { finalizeBpmnImport } from '@/lib/flowBpmnImportFinalize';
import {
  FLOW_HAND_PAN_BUTTONS,
  isFlowEditorTypingTarget,
  isHandToolShortcut,
} from '@/lib/flowHandTool';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  diagram: FlowDiagram;
  onBack: () => void;
};

let nodeIdCounter = 0;
function nextNodeId(prefix = 'node') {
  nodeIdCounter += 1;
  return `${prefix}-${Date.now()}-${nodeIdCounter}`;
}

export function FlowEditor({ diagram, onBack }: Props) {
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [name, setName] = useState(diagram.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [handToolActive, setHandToolActive] = useState(false);
  const [connectionDragActive, setConnectionDragActive] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<FlowAlignmentGuide[]>([]);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSaveRef = useRef(true);
  const connectPointerRef = useRef<{ x: number; y: number } | null>(null);
  const connectSourceHandleRef = useRef<string | null>(null);
  const pendingConnectRef = useRef<{ edgeId: string } | null>(null);
  const connectMoveListenerRef = useRef<((event: MouseEvent) => void) | null>(null);

  const initial = useMemo(() => parseStoredFlow(diagram.nodes, diagram.edges), [diagram.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    commitBeforeMutation,
    commitAndApplyDiagram,
    beginInteraction,
    endInteraction,
    onNodeDragStart: onHistoryDragStart,
    onNodeDragStop: onHistoryDragStop,
    resetHistory,
  } = useFlowHistory(nodes, edges, setNodes, setEdges);

  const loadedDiagramIdRef = useRef<string | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  /** Raia sendo arrastada — evita mover o pool inteiro ao soltar raias coladas. */
  const activeLaneDragIdRef = useRef<string | null>(null);
  const laneDragSnapshotRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const flowClipboardRef = useRef<FlowClipboardPayload | null>(null);
  const pasteCountRef = useRef(0);
  const lastPastePositionRef = useRef<{ x: number; y: number } | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: { name?: string; nodes: Node[]; edges: Edge[]; viewport?: unknown }) =>
      updateFlowDiagram(diagram.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-diagrams'] });
      queryClient.invalidateQueries({ queryKey: ['flow-diagram', diagram.id] });
    },
    onError: () => toast.error('Erro ao salvar o fluxograma'),
  });

  const scheduleSave = useCallback(
    (nextNodes: Node[], nextEdges: Edge[], nextName?: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const viewport = rfInstance?.getViewport();
        saveMutation.mutate({
          name: nextName ?? name,
          nodes: stripPreviewElements(nextNodes),
          edges: stripPreviewElements(nextEdges),
          viewport,
        });
      }, 1200);
    },
    [name, rfInstance, saveMutation],
  );

  useEffect(() => {
    if (loadedDiagramIdRef.current === diagram.id) return;
    loadedDiagramIdRef.current = diagram.id;

    skipAutoSaveRef.current = true;
    setName(diagram.name);
    const parsed = parseStoredFlow(diagram.nodes, diagram.edges);
    setNodes(parsed.nodes);
    setEdges(parsed.edges);
    resetHistory({
      nodes: structuredClone(stripPreviewElements(parsed.nodes)),
      edges: structuredClone(stripPreviewElements(parsed.edges)),
    });
  }, [diagram.id, diagram.name, diagram.nodes, diagram.edges, setNodes, setEdges, resetHistory]);

  const toggleHandTool = useCallback(() => {
    setHandToolActive((active) => {
      const next = !active;
      if (next) {
        setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
        setEdges((eds) => eds.map((edge) => ({ ...edge, selected: false })));
      }
      return next;
    });
  }, [setNodes, setEdges]);

  const hasSelection = useMemo(
    () => nodes.some((node) => node.selected) || edges.some((edge) => edge.selected),
    [nodes, edges],
  );

  const selectAllElements = useCallback(() => {
    setNodes((nds) => nds.map((node) => ({ ...node, selected: true })));
    setEdges((eds) => eds.map((edge) => ({ ...edge, selected: true })));
  }, [setNodes, setEdges]);

  const copySelection = useCallback(() => {
    const payload = copyFlowSelection(nodesRef.current, edges);
    if (!payload) return false;
    flowClipboardRef.current = payload;
    pasteCountRef.current = 0;
    return true;
  }, [edges]);

  const pasteClipboard = useCallback(() => {
    const payload = flowClipboardRef.current;
    if (!payload) return false;

    pasteCountRef.current += 1;
    const result = pasteFlowClipboard(payload, nodesRef.current, edges, {
      targetPosition: lastPastePositionRef.current ?? undefined,
      pasteCount: pasteCountRef.current,
    });
    commitAndApplyDiagram(result.nodes, result.edges);
    return true;
  }, [edges, commitAndApplyDiagram]);

  const deleteSelected = useCallback(() => {
    commitBeforeMutation();

    let next = nodes;
    const selectedPoolIds = nodes
      .filter((node) => node.selected && node.type === POOL_NODE_TYPE)
      .map((node) => node.id);
    const selectedLaneIds = nodes
      .filter((node) => node.selected && node.type === LANE_NODE_TYPE)
      .map((node) => node.id);

    for (const poolId of selectedPoolIds) {
      next = deletePoolWithContents(next, poolId);
    }

    for (const laneId of selectedLaneIds) {
      if (next.some((node) => node.id === laneId)) {
        next = deleteLaneWithChildren(next, laneId);
      }
    }

    next = next.filter((node) => {
      if (node.type === POOL_NODE_TYPE || node.type === LANE_NODE_TYPE) return true;
      return !node.selected;
    });

    setNodes(next);
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, [nodes, commitBeforeMutation, setNodes, setEdges]);

  const selectEdge = useCallback(
    (edgeId: string) => {
      setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
      setEdges((eds) => eds.map((edge) => ({ ...edge, selected: edge.id === edgeId })));
      reactFlowWrapper.current?.focus();
    },
    [setNodes, setEdges],
  );

  const openCanvasContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      if (handToolActive) return;
      event.preventDefault();
      setCanvasContextMenu({ x: event.clientX, y: event.clientY });
    },
    [handToolActive],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (handToolActive) return;
      event.preventDefault();
      event.stopPropagation();
      if (!node.selected) {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === node.id })));
        setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      }
      setCanvasContextMenu({ x: event.clientX, y: event.clientY });
    },
    [handToolActive, setNodes, setEdges],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (handToolActive) return;
      event.preventDefault();
      event.stopPropagation();
      if (!edge.selected) {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
      }
      setCanvasContextMenu({ x: event.clientX, y: event.clientY });
    },
    [handToolActive, setNodes, setEdges],
  );

  useEffect(() => {
    if (handToolActive) setCanvasContextMenu(null);
  }, [handToolActive]);

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (handToolActive) return;
      selectEdge(edge.id);
    },
    [handToolActive, selectEdge],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (handToolActive || !rfInstance) return;
      lastPastePositionRef.current = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setCanvasContextMenu(null);
    },
    [handToolActive, rfInstance],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFlowEditorTypingTarget(event.target)) return;

      if (isHandToolShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        toggleHandTool();
        return;
      }

      if (
        !handToolActive &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        (nodes.some((n) => n.selected) || edges.some((e) => e.selected))
      ) {
        event.preventDefault();
        event.stopPropagation();
        deleteSelected();
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (mod && !handToolActive && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        event.stopPropagation();
        selectAllElements();
        return;
      }

      if (mod && !handToolActive && event.key.toLowerCase() === 'c') {
        if (copySelection()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (mod && !handToolActive && event.key.toLowerCase() === 'v') {
        if (pasteClipboard()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (!mod) return;

      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey);

      if (isUndo || isRedo) {
        event.preventDefault();
        event.stopPropagation();
        if (isUndo) undo();
        else redo();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [undo, redo, toggleHandTool, handToolActive, nodes, edges, deleteSelected, selectAllElements, copySelection, pasteClipboard]);

  const onFlowInit = useCallback<OnInit>((instance) => {
    setRfInstance(instance as ReactFlowInstance);
    if (reactFlowWrapper.current) {
      ensureSequenceFlowMarkerDefs(reactFlowWrapper.current);
    }
  }, []);

  useEffect(() => {
    if (!reactFlowWrapper.current) return;
    ensureSequenceFlowMarkerDefs(reactFlowWrapper.current);

    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (reactFlowWrapper.current) {
        ensureSequenceFlowMarkerDefs(reactFlowWrapper.current);
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [rfInstance, edges.length, nodes.length]);

  const handleExportPNG = useCallback(async () => {
    if (!reactFlowWrapper.current) {
      toast.error('Canvas ainda não está pronto para exportar');
      return;
    }

    try {
      await exportReactFlowViewportToPng(
        reactFlowWrapper.current,
        name || 'processo',
        nodes,
        isDark,
        rfInstance,
      );
    } catch (err) {
      console.error('Erro ao exportar PNG:', err);
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro ao exportar: ${message}`);
      throw err;
    }
  }, [name, nodes, isDark, rfInstance]);

  const handleRepairDiagram = useCallback(() => {
    const { nodes: repairedNodes, edges: repairedEdges, stats } = repairFlowDiagram(nodes, edges);
    commitAndApplyDiagram(repairedNodes, repairedEdges);

    const parts: string[] = [];
    if (stats.labelsMoved > 0) parts.push(`${stats.labelsMoved} rótulo(s) ajustado(s)`);
    if (stats.syncedNodes) parts.push('raias sincronizadas');

    toast.success(parts.length > 0 ? parts.join(' · ') : 'Diagrama já está em ordem');
  }, [nodes, edges, commitAndApplyDiagram]);

  useEffect(() => {
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    scheduleSave(nodes, edges);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, scheduleSave]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      commitBeforeMutation();
      const normalized: Connection = {
        ...newConnection,
        sourceHandle: newConnection.sourceHandle?.trim() || null,
        targetHandle: newConnection.targetHandle?.trim() || null,
      };
      const next = inferMissingEdgeHandles(normalized, nodes);
      const handlesPinned = Boolean(next.sourceHandle?.trim() && next.targetHandle?.trim());
      setEdges((eds) =>
        reconnectEdge(oldEdge, next, eds).map((edge) => {
          if (edge.id !== oldEdge.id) return normalizeFlowEdge(edge);
          const data = {
            ...((edge.data ?? {}) as FlowEdgeData),
            ...(handlesPinned ? { handlesPinned: true } : {}),
          };
          return normalizeFlowEdge({ ...edge, data });
        }),
      );
    },
    [setEdges, commitBeforeMutation, nodes],
  );

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (handToolActive) return;
      requestEdgeLabelEdit(edge.id, setEdges);
    },
    [handToolActive, setEdges],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const connectable = connectableNodeIds(nodes);
      return connectable.has(connection.source) && connectable.has(connection.target);
    },
    [nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setConnectionDragActive(false);
      if (connectMoveListenerRef.current) {
        document.removeEventListener('mousemove', connectMoveListenerRef.current);
        connectMoveListenerRef.current = null;
      }
      commitBeforeMutation();
      const pointer = connectPointerRef.current;
      connectPointerRef.current = null;
      const startedHandle = connectSourceHandleRef.current;
      connectSourceHandleRef.current = null;

      const sourceHandle = (connection.sourceHandle ?? startedHandle)?.trim() || null;
      const targetHandle = connection.targetHandle?.trim() || null;
      let base: Connection = {
        ...connection,
        sourceHandle,
        targetHandle,
      };

      let withHandles: Connection;
      if (sourceHandle && targetHandle) {
        withHandles = base;
      } else if (!targetHandle && pointer) {
        withHandles = refineConnectionTargetFromPointer(base, nodes, pointer, {
          sourceNode: nodes.find((node) => node.id === base.source),
        });
      } else {
        withHandles = inferMissingEdgeHandles(base, nodes);
      }

      const handlesPinned = Boolean(
        withHandles.sourceHandle?.trim() && withHandles.targetHandle?.trim(),
      );

      const edgeId = `edge-${Date.now()}`;
      pendingConnectRef.current = { edgeId };

      setEdges((eds) =>
        addEdge(
          normalizeFlowEdge({
            id: edgeId,
            ...withHandles,
            ...flowEdgeDefaults(),
            data: handlesPinned ? { handlesPinned: true } : undefined,
          }),
          eds,
        ),
      );
    },
    [setEdges, commitBeforeMutation, nodes],
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: { handleId?: string | null }) => {
      setConnectionDragActive(true);
      connectPointerRef.current = null;
      connectSourceHandleRef.current = params.handleId ?? null;
      const onMove = (event: MouseEvent) => {
        if (!rfInstance) return;
        connectPointerRef.current = rfInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
      };
      connectMoveListenerRef.current = onMove;
      document.addEventListener('mousemove', onMove);
    },
    [rfInstance],
  );

  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      setConnectionDragActive(false);
      connectSourceHandleRef.current = null;
      if (connectMoveListenerRef.current) {
        document.removeEventListener('mousemove', connectMoveListenerRef.current);
        connectMoveListenerRef.current = null;
      }

      const pending = pendingConnectRef.current;
      pendingConnectRef.current = null;
      if (!pending || !state.isValid || !state.toNode) return;

      const fromHandle = state.fromHandle?.id?.trim() || null;
      const toHandle = state.toHandle?.id?.trim() || null;
      if (!fromHandle && !toHandle) return;

      const { edgeId } = pending;

      setEdges((eds) => {
        const edge = eds.find((item) => item.id === edgeId);
        if (!edge) return eds;

        const sourceHandle = fromHandle ?? edge.sourceHandle?.trim() ?? null;
        const targetHandle = toHandle ?? edge.targetHandle?.trim() ?? null;
        if (!sourceHandle && !targetHandle) return eds;

        const data = {
          ...((edge.data ?? {}) as FlowEdgeData),
          ...(sourceHandle && targetHandle ? { handlesPinned: true } : {}),
        };

        return eds.map((item) =>
          item.id === edgeId
            ? normalizeFlowEdge({
                ...item,
                sourceHandle: sourceHandle ?? item.sourceHandle,
                targetHandle: targetHandle ?? item.targetHandle,
                data,
              })
            : item,
        );
      });
    },
    [setEdges],
  );

  const addShapeToCanvas = useCallback(
    (
      type: BpmnNodeType,
      label: string,
      options?: { flowPosition?: { x: number; y: number }; appendToSelected?: boolean },
    ) => {
      if (!rfInstance) return;

      commitBeforeMutation();

      const size = getDefaultNodeSize(type);
      const appendToSelected = options?.appendToSelected !== false;
      const selectedSource = appendToSelected
        ? nodes.find((n) => n.selected && !isPreviewId(n.id))
        : undefined;

      let position: { x: number; y: number };

      if (options?.flowPosition) {
        position = {
          x: options.flowPosition.x - size.width / 2,
          y: options.flowPosition.y - size.height / 2,
        };
      } else if (selectedSource && selectedSource.type !== 'bpmnLane') {
        const canvasEdges = stripPreviewElements(edges);
        const { position: appendPos, sourceAdjustY } = getAppendPlacement(
          selectedSource,
          type,
          nodes,
          rfInstance.getInternalNode(selectedSource.id)?.internals.positionAbsolute,
          canvasEdges,
        );
        position = appendPos;

        const newId = nextNodeId(type);
        const newEdge = buildForwardFlowEdge({
          id: `e-${selectedSource.id}-${newId}`,
          source: selectedSource.id,
          target: newId,
        });
        const nextEdges = [...canvasEdges, newEdge];

        setNodes((nds) =>
          syncLaneHierarchy(
            applyAppendToNodes(
              nds.map((n) => ({ ...n, selected: false })),
              nextEdges,
              selectedSource.id,
              {
                id: newId,
                type,
                position,
                data: getDefaultNodeData(type, label),
                selected: true,
                ...buildAppendedFlowNodeFields(type),
                ...(type === 'bpmnLane'
                  ? { style: { width: 1200, height: 120 }, zIndex: 0 }
                  : { zIndex: 1 }),
              },
              sourceAdjustY,
            ),
          ),
        );

        setEdges(nextEdges);
        return;
      } else if (reactFlowWrapper.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const center = rfInstance.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        });
        position = {
          x: center.x - size.width / 2,
          y: center.y - size.height / 2,
        };
      } else {
        return;
      }

      const newId = nextNodeId(type);

      setNodes((nds) =>
        syncLaneHierarchy([
          ...nds.map((n) => ({ ...n, selected: false })),
          {
            id: newId,
            type,
            position,
            data: getDefaultNodeData(type, label),
            selected: true,
            ...(type === 'bpmnLane'
              ? { style: { width: 1200, height: 120 }, zIndex: 0 }
              : { zIndex: 1 }),
          },
        ]),
      );

      if (selectedSource && selectedSource.type !== 'bpmnLane') {
        setEdges((eds) => [
          ...eds,
          buildForwardFlowEdge({
            id: `e-${selectedSource.id}-${newId}`,
            source: selectedSource.id,
            target: newId,
          }),
        ]);
      }
    },
    [rfInstance, nodes, edges, setNodes, setEdges, commitBeforeMutation],
  );

  const handleShapeDoubleClick = useCallback(
    (type: BpmnNodeType, label: string) => {
      addShapeToCanvas(type, label, { appendToSelected: true });
    },
    [addShapeToCanvas],
  );

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (handToolActive || !rfInstance) return;

      const raw = event.dataTransfer.getData(FLOW_DND_TYPE);
      if (!raw) return;

      try {
        const payload = JSON.parse(raw) as { type: BpmnNodeType; label: string };
        if (!payload.type) return;

        const flowPosition = rfInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        addShapeToCanvas(payload.type, payload.label, {
          flowPosition,
          appendToSelected: false,
        });
      } catch {
        // payload inválido — ignorar
      }
    },
    [handToolActive, rfInstance, addShapeToCanvas],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (handToolActive || node.type !== LANE_NODE_TYPE) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) return { ...n, selected: true };
          if (n.type === LANE_NODE_TYPE) return { ...n, selected: false };
          return n;
        }),
      );
    },
    [handToolActive, setNodes],
  );

  const onNodeDragStart = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      if (node.type === LANE_NODE_TYPE) {
        activeLaneDragIdRef.current = node.id;
        laneDragSnapshotRef.current = snapshotStackedLanePositions(nodesRef.current, node.id);
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === node.id) return { ...n, selected: true };
            if (n.type === LANE_NODE_TYPE) return { ...n, selected: false, dragging: false };
            return n;
          }),
        );
      } else {
        activeLaneDragIdRef.current = null;
        laneDragSnapshotRef.current = null;
      }
      onHistoryDragStart();
    },
    [setNodes, onHistoryDragStart],
  );

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const wasLaneDrag = node.type === LANE_NODE_TYPE;
      activeLaneDragIdRef.current = null;
      laneDragSnapshotRef.current = null;
      setAlignmentGuides([]);
      if (!wasLaneDrag) {
        setNodes((nds) => syncLaneHierarchy(nds));
        const movedIds = new Set([node.id]);
        setEdges((currentEdges) => {
          const cleared = releaseEdgeRoutesForNodes(currentEdges, movedIds);
          return syncEdgeHandlesForMovedNodes(nodesRef.current, cleared, movedIds);
        });
      }
      onHistoryDragStop();
    },
    [setNodes, setEdges, onHistoryDragStop],
  );

  const onImportFile = useCallback(
    async (payload: FlowImportPayload) => {
      const { nodes: enhancedNodes, edges: enhancedEdges } = finalizeBpmnImport(
        payload.nodes,
        payload.edges,
      );
      setNodes(enhancedNodes);
      setEdges(enhancedEdges);
      if (payload.name) setName(payload.name);
      resetHistory({
        nodes: structuredClone(stripPreviewElements(enhancedNodes)),
        edges: structuredClone(stripPreviewElements(enhancedEdges)),
      });
      window.setTimeout(() => {
        if (payload.viewport && rfInstance) {
          rfInstance.setViewport(payload.viewport);
        } else {
          rfInstance?.fitView({ padding: 0.2, duration: 200 });
        }
      }, 50);
    },
    [setNodes, setEdges, rfInstance, resetHistory],
  );

  const handleNameBlur = () => {
    if (name.trim() && name !== diagram.name) {
      scheduleSave(nodes, edges, name.trim());
    }
  };

  const canvasNodes = useMemo(
    () => {
      const selectedLaneId = nodes.find((node) => node.selected && node.type === LANE_NODE_TYPE)?.id;

      const withZ = (node: (typeof nodes)[number]) => {
        if (node.type === POOL_NODE_TYPE) {
          return {
            ...node,
            zIndex: -1,
            dragHandle: '.pool-drag-handle',
          };
        }

        const base = {
          ...node,
          zIndex: node.type === LANE_NODE_TYPE ? 0 : 20,
        };

        if (node.type !== LANE_NODE_TYPE) return base;

        return {
          ...base,
          dragHandle: '.lane-drag-handle',
          draggable: selectedLaneId ? node.id === selectedLaneId : true,
        };
      };

      return handToolActive
        ? nodes.map((node) => ({
            ...withZ(node),
            draggable: false,
            selectable: false,
            focusable: false,
            selected: false,
          }))
        : nodes.map(withZ);
    },
    [nodes, handToolActive],
  );

  const canvasEdges = useMemo(
    () => {
      const list = handToolActive
        ? edges.map((edge) => ({
            ...edge,
            selectable: false,
            focusable: false,
            selected: false,
          }))
        : edges;
      // Setas acima das raias (0) e abaixo dos demais nós (20), ficando clicáveis
      // mesmo quando cruzam o fundo de uma raia.
      return list.map((edge) => ({ ...normalizeFlowEdge(edge), zIndex: 10 }));
    },
    [edges, handToolActive],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (handToolActive) return;
      const structural = changes.some(
        (change) => change.type === 'remove' || change.type === 'add' || change.type === 'replace',
      );
      if (structural) commitBeforeMutation();

      const hasLaneResize =
        !activeLaneDragIdRef.current && changes.some((change) => change.type === 'dimensions');

      if (hasLaneResize) {
        setNodes((currentNodes) => {
          let next = applyNodeChanges(changes, currentNodes);
          for (const change of changes) {
            if (change.type !== 'dimensions' || !change.dimensions) continue;
            const node = next.find((item) => item.id === change.id);
            if (node?.type === LANE_NODE_TYPE) {
              next = applyLaneDimensionChange(next, change.id, change.dimensions);
            }
          }
          return next;
        });
        return;
      }

      const primaryLaneId = activeLaneDragIdRef.current;
      const laneSnapshot = laneDragSnapshotRef.current;

      if (primaryLaneId) {
        setAlignmentGuides([]);
      } else {
        const filteredForGuides = filterIndependentLanePositionChanges(
          nodesRef.current,
          changes,
          primaryLaneId,
        );
        const { guides } = snapNodePositionChangesWithGuides(nodesRef.current, filteredForGuides);
        setAlignmentGuides(guides);
      }

      setNodes((currentNodes) => {
        const filteredChanges = filterIndependentLanePositionChanges(
          currentNodes,
          changes,
          primaryLaneId,
        );
        const snappedChanges = primaryLaneId
          ? filteredChanges
          : snapNodePositionChangesWithGuides(currentNodes, filteredChanges).changes;
        let next = applyNodeChanges(snappedChanges, currentNodes);
        if (primaryLaneId && laneSnapshot) {
          next = pinStackedLaneSiblingsDuringDrag(next, primaryLaneId, laneSnapshot);
        }
        return next;
      });

      const filteredChanges = filterIndependentLanePositionChanges(
        nodesRef.current,
        changes,
        primaryLaneId,
      );

      const movedNodeIds = new Set<string>();
      for (const change of filteredChanges) {
        if (change.type === 'position') movedNodeIds.add(change.id);
      }
      if (movedNodeIds.size > 0) {
        setEdges((currentEdges) => releaseEdgeRoutesForNodes(currentEdges, movedNodeIds));
      }
    },
    [handToolActive, commitBeforeMutation, setNodes, setEdges],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (handToolActive) return;
      const structural = changes.some(
        (change) => change.type === 'remove' || change.type === 'add' || change.type === 'replace',
      );
      if (structural) commitBeforeMutation();
      onEdgesChange(changes);
    },
    [handToolActive, onEdgesChange, commitBeforeMutation],
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 dark:bg-gray-950">
      <style jsx global>{`
        .flow-editor-canvas {
          --flow-canvas-bg: #f1f5f9;
          --flow-grid: #e2e8f0;
          --flow-stroke: #000000;
          --flow-shape-fill: #ffffff;
          --flow-shape-border: #000000;
          --flow-label: #000000;
          --flow-lane-header: #f0f0f0;
          --flow-edge-label-bg: #ffffff;
          --flow-edge-label-border: #cbd5e1;
          --flow-ring-offset: #ffffff;
        }
        :is(.dark) .flow-editor-canvas {
          --flow-canvas-bg: #0f172a;
          --flow-grid: #334155;
          --flow-stroke: #e2e8f0;
          --flow-shape-fill: #1e293b;
          --flow-shape-border: #cbd5e1;
          --flow-label: #f1f5f9;
          --flow-lane-header: #0f172a;
          --flow-edge-label-bg: #1e293b;
          --flow-edge-label-border: #475569;
          --flow-ring-offset: #0f172a;
        }
        .flow-editor-canvas .flow-append-preview-node {
          opacity: 0.38;
          pointer-events: none;
          filter: saturate(0.85);
        }
        .flow-editor-canvas .flow-append-preview-node .react-flow__handle {
          opacity: 0;
        }
        .flow-editor-canvas .react-flow__node {
          overflow: visible !important;
        }
        /* Seleção padrão do React Flow é sempre retangular — usamos contorno por forma nos nós BPMN. */
        .flow-editor-canvas .react-flow__nodesselection {
          display: none !important;
        }
        /* Bolinhas ocultas — só ao selecionar a forma, conectar ou se já tiver seta. */
        .flow-editor-canvas .react-flow__node .react-flow__handle {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease;
        }
        /* Repouso: source acima (iniciar arraste); ao conectar: target acima (soltar). */
        .flow-editor-canvas .react-flow__handle.flow-handle-source {
          z-index: 45 !important;
        }
        .flow-editor-canvas .react-flow__handle.flow-handle-target {
          z-index: 44 !important;
        }
        .flow-editor-canvas .react-flow.connecting .react-flow__handle.flow-handle-source {
          z-index: 44 !important;
        }
        .flow-editor-canvas .react-flow.connecting .react-flow__handle.flow-handle-target {
          z-index: 46 !important;
        }
        .flow-editor-canvas .react-flow__handle.flow-bpmn-handle::after {
          content: '';
          position: absolute;
          inset: -10px;
        }
        .flow-editor-canvas .react-flow__node.selected .react-flow__handle,
        .flow-editor-canvas .react-flow.connecting .react-flow__handle {
          opacity: 1;
          pointer-events: all !important;
        }
        .flow-editor-canvas .react-flow__controls {
          display: none;
        }
        .flow-editor-canvas .react-flow__attribution {
          display: none;
        }
        .flow-editor-canvas .react-flow__edge-path {
          stroke: var(--flow-stroke) !important;
          stroke-width: 1.5px !important;
          stroke-linecap: square;
          marker-end: url(#flow-sequenceflow-end) !important;
        }
        .flow-editor-canvas .react-flow__edge.flow-bpmn-association .react-flow__edge-path {
          stroke-dasharray: 6 4 !important;
          marker-end: none !important;
        }
        .flow-editor-canvas .react-flow__connection-path {
          stroke: var(--flow-stroke) !important;
          stroke-width: 1.5px !important;
          stroke-linecap: square;
          marker-end: url(#flow-sequenceflow-end) !important;
        }
        .flow-editor-canvas .react-flow__edge.selected .react-flow__edge-path {
          stroke: #3b82f6 !important;
          stroke-width: 2.5px !important;
        }
        .flow-editor-canvas .react-flow__edge.selected .flow-sequenceflow-end-marker {
          fill: #3b82f6 !important;
          stroke: #3b82f6 !important;
        }
        .flow-editor-canvas .react-flow__edgeupdater,
        .flow-editor-canvas .react-flow__edgeupdater-source,
        .flow-editor-canvas .react-flow__edgeupdater-target {
          cursor: grab;
          width: 14px !important;
          height: 14px !important;
          border-radius: 9999px;
          border: 2px solid #2563eb !important;
          background: #ffffff !important;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
        }
        :is(.dark) .flow-editor-canvas .react-flow__edgeupdater,
        :is(.dark) .flow-editor-canvas .react-flow__edgeupdater-source,
        :is(.dark) .flow-editor-canvas .react-flow__edgeupdater-target {
          background: #0f172a !important;
          border-color: #60a5fa !important;
        }
        .flow-editor-canvas .react-flow__edgeupdater:active {
          cursor: grabbing;
        }
        .flow-editor-canvas .react-flow__viewport svg {
          overflow: visible;
        }
        /* Rótulos de seta (Sim/Não) e a camada de edição de setas (segmentos +
           dobras) ficam acima de tudo. Os nós usam z-index 20 (ver canvasNodes),
           então este precisa ser maior para os controles serem clicáveis sobre
           tarefas/raias. O container é pointer-events:none; só os filhos captam. */
        .flow-editor-canvas .react-flow__edgelabel-renderer {
          z-index: 1000;
          pointer-events: none;
        }
        .flow-editor-canvas .react-flow__edgelabel-renderer .flow-edge-inline-label {
          pointer-events: auto;
        }
        .flow-editor-canvas .react-flow__edgelabel-renderer .flow-edge-segment {
          pointer-events: auto;
        }
        .flow-editor-canvas .flow-sequenceflow-end-marker {
          fill: var(--flow-stroke) !important;
          stroke: var(--flow-stroke) !important;
          stroke-width: 1px !important;
        }
        .flow-editor-canvas .flow-append-preview-edge path {
          stroke-dasharray: 6 4;
        }
        .flow-editor-canvas .react-flow__arrowhead polyline,
        .flow-editor-canvas .react-flow__arrowhead polygon,
        .flow-editor-canvas .react-flow__arrowhead path {
          fill: var(--flow-stroke);
          stroke: var(--flow-stroke);
        }
        .flow-editor-canvas.flow-hand-tool-active .react-flow__pane,
        .flow-editor-canvas.flow-hand-tool-active .react-flow__pane:active {
          cursor: grabbing !important;
        }
        .flow-editor-canvas.flow-hand-tool-active .react-flow__node,
        .flow-editor-canvas.flow-hand-tool-active .react-flow__edge,
        .flow-editor-canvas.flow-hand-tool-active .react-flow__edge-labels,
        .flow-editor-canvas.flow-hand-tool-active .react-flow__nodesselection,
        .flow-editor-canvas.flow-hand-tool-active .react-flow__edgeupdater {
          pointer-events: none !important;
        }
        .flow-editor-canvas.flow-hand-tool-active .react-flow__pane {
          cursor: grab !important;
        }
        .flow-editor-canvas .react-flow__minimap.flow-minimap-dock {
          margin: 0;
        }
        .flow-editor-canvas .react-flow__minimap.flow-minimap-dock .react-flow__minimap-mask {
          fill: rgb(59 130 246 / 0.12);
        }
        :is(.dark) .flow-editor-canvas .react-flow__minimap.flow-minimap-dock .react-flow__minimap-mask {
          fill: rgb(96 165 250 / 0.18);
        }

      `}</style>
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:shadow-none">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
            className="rounded-md p-2 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Y)"
            className="rounded-md p-2 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1 text-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="w-full bg-transparent text-center text-2xl font-bold tracking-tight text-gray-900 outline-none dark:text-gray-100 sm:text-3xl"
          />
        </div>
        <button
          type="button"
          onClick={handleRepairDiagram}
          className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 shadow-sm hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 dark:shadow-none dark:hover:bg-blue-900/50"
          title="Sincroniza raias, recalcula conexões, alinha setas e corrige rótulos"
        >
          <Wrench className="h-4 w-4" />
          Reparar diagrama
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={reactFlowWrapper} className="relative h-full min-w-0 flex-1" tabIndex={-1}>
          <FlowShapePalette
            onShapeDoubleClick={handleShapeDoubleClick}
            onOpenChange={setPaletteOpen}
          />
          <FlowHistoryProvider
            commitBeforeMutation={commitBeforeMutation}
            beginInteraction={beginInteraction}
            endInteraction={endInteraction}
            connectionDragActive={connectionDragActive}
          >
          <ReactFlow
            nodes={canvasNodes}
            edges={canvasEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            isValidConnection={handToolActive ? undefined : isValidConnection}
            onConnect={handToolActive ? undefined : onConnect}
            onConnectStart={handToolActive ? undefined : onConnectStart}
            onConnectEnd={handToolActive ? undefined : onConnectEnd}
            onDragOver={handToolActive ? undefined : onCanvasDragOver}
            onDrop={handToolActive ? undefined : onCanvasDrop}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onEdgeClick={onEdgeClick}
            onReconnect={handToolActive ? undefined : onReconnect}
            reconnectRadius={28}
            onNodeClick={handToolActive ? undefined : onNodeClick}
            onPaneClick={handToolActive ? undefined : onPaneClick}
            onPaneContextMenu={handToolActive ? undefined : openCanvasContextMenu}
            onNodeContextMenu={handToolActive ? undefined : onNodeContextMenu}
            onEdgeContextMenu={handToolActive ? undefined : onEdgeContextMenu}
            onNodeDragStart={handToolActive ? undefined : onNodeDragStart}
            onNodeDragStop={handToolActive ? undefined : onNodeDragStop}
            onInit={onFlowInit}
            nodeTypes={flowNodeTypes}
            edgeTypes={flowEdgeTypes}
            connectionMode={ConnectionMode.Strict}
            connectionRadius={36}
            defaultEdgeOptions={flowEdgeDefaults()}
            proOptions={{ hideAttribution: true }}
            fitView
            snapToGrid={!handToolActive}
            snapGrid={[8, 8]}
            selectNodesOnDrag={false}
            selectionOnDrag={false}
            panOnDrag={handToolActive ? [...FLOW_HAND_PAN_BUTTONS] : true}
            panOnScroll
            zoomOnDoubleClick={!handToolActive}
            nodesDraggable={!handToolActive}
            nodesConnectable={!handToolActive}
            nodesFocusable={!handToolActive}
            elementsSelectable={!handToolActive}
            edgesFocusable={!handToolActive}
            edgesReconnectable={!handToolActive}
            autoPanOnNodeDrag={!handToolActive}
            autoPanOnConnect={!handToolActive}
            connectOnClick={false}
            deleteKeyCode={handToolActive ? null : ['Backspace', 'Delete']}
            className={`flow-editor-canvas bg-[var(--flow-canvas-bg)]${handToolActive ? ' flow-hand-tool-active' : ''}`}
          >
            <FlowSequenceFlowMarkerDefs />
            <FlowAlignmentGuides guides={alignmentGuides} />
            <Background gap={20} size={1} color={isDark ? '#334155' : '#e2e8f0'} className="opacity-60" />
            <FlowZoomControls
              paletteOpen={paletteOpen}
              handToolActive={handToolActive}
              onToggleHandTool={toggleHandTool}
            />
            <FlowMinimap />
            <FlowFileToolbar name={name} onImport={onImportFile} onExportPng={handleExportPNG} />
          </ReactFlow>
          </FlowHistoryProvider>
          <FlowCanvasContextMenu
            open={canvasContextMenu !== null}
            x={canvasContextMenu?.x ?? 0}
            y={canvasContextMenu?.y ?? 0}
            canDelete={hasSelection}
            onClose={() => setCanvasContextMenu(null)}
            onSelectAll={selectAllElements}
            onDelete={deleteSelected}
          />
        </div>
      </div>
    </div>
  );
}
