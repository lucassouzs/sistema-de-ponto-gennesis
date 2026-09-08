import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Edge, Node } from '@xyflow/react';
import { stripPreviewElements } from '@/lib/flowAppend';

const MAX_HISTORY = 60;

type Snapshot = { nodes: Node[]; edges: Edge[] };

function normalizeForHistory(nodes: Node[], edges: Edge[]): Snapshot {
  const cleanNodes = stripPreviewElements(nodes).map((node) => ({
    ...node,
    selected: false,
    dragging: false,
  }));
  const cleanEdges = stripPreviewElements(edges).map((edge) => ({
    ...edge,
    selected: false,
  }));
  return {
    nodes: structuredClone(cleanNodes),
    edges: structuredClone(cleanEdges),
  };
}

function snapshotsEqual(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useFlowHistory(
  nodes: Node[],
  edges: Edge[],
  setNodes: (value: Node[] | ((nodes: Node[]) => Node[])) => void,
  setEdges: (value: Edge[] | ((edges: Edge[]) => Edge[])) => void,
) {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const lastCommittedRef = useRef<Snapshot | null>(null);
  const restoringRef = useRef(false);
  /** Suprime commits intermediários durante arraste (nós, setas, rótulos). */
  const interactionRef = useRef(false);
  const skipNextCommitRef = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushPast = useCallback(
    (snapshot: Snapshot) => {
      pastRef.current.push(snapshot);
      if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
      futureRef.current = [];
      syncFlags();
    },
    [syncFlags],
  );

  const commitIfChanged = useCallback(() => {
    if (restoringRef.current || interactionRef.current) return;

    const current = normalizeForHistory(nodesRef.current, edgesRef.current);
    if (!lastCommittedRef.current) {
      lastCommittedRef.current = current;
      syncFlags();
      return;
    }
    if (snapshotsEqual(lastCommittedRef.current, current)) return;

    pushPast(lastCommittedRef.current);
    lastCommittedRef.current = current;
  }, [pushPast, syncFlags]);

  /** Grava o estado atual no histórico antes de criar/apagar/conectar elementos. */
  const commitBeforeMutation = useCallback(() => {
    if (restoringRef.current || interactionRef.current) return;

    const current = normalizeForHistory(nodesRef.current, edgesRef.current);

    if (!lastCommittedRef.current) {
      lastCommittedRef.current = current;
      syncFlags();
      skipNextCommitRef.current = true;
      return;
    }

    if (snapshotsEqual(lastCommittedRef.current, current)) {
      pushPast(current);
    } else {
      pushPast(lastCommittedRef.current);
      lastCommittedRef.current = current;
    }

    skipNextCommitRef.current = true;
  }, [pushPast, syncFlags]);

  useLayoutEffect(() => {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      if (!interactionRef.current) {
        lastCommittedRef.current = normalizeForHistory(nodesRef.current, edgesRef.current);
      }
      return;
    }
    commitIfChanged();
  }, [nodes, edges, commitIfChanged]);

  const restoreSnapshot = useCallback(
    (snapshot: Snapshot) => {
      restoringRef.current = true;
      skipNextCommitRef.current = true;
      lastCommittedRef.current = snapshot;
      flushSync(() => {
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
      });
      restoringRef.current = false;
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;

    const current = normalizeForHistory(nodesRef.current, edgesRef.current);
    futureRef.current.push(current);

    const previous = pastRef.current.pop()!;
    restoreSnapshot(previous);
    syncFlags();
  }, [restoreSnapshot, syncFlags]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;

    const current = normalizeForHistory(nodesRef.current, edgesRef.current);
    pastRef.current.push(current);

    const next = futureRef.current.pop()!;
    restoreSnapshot(next);
    syncFlags();
  }, [restoreSnapshot, syncFlags]);

  const beginInteraction = useCallback(() => {
    if (restoringRef.current || interactionRef.current) return;
    commitBeforeMutation();
    interactionRef.current = true;
  }, [commitBeforeMutation]);

  const endInteraction = useCallback(() => {
    if (!interactionRef.current) return;
    interactionRef.current = false;
    commitIfChanged();
  }, [commitIfChanged]);

  const onNodeDragStart = useCallback(() => {
    beginInteraction();
  }, [beginInteraction]);

  const onNodeDragStop = useCallback(() => {
    endInteraction();
  }, [endInteraction]);

  const resetHistory = useCallback(
    (snapshot: Snapshot) => {
      pastRef.current = [];
      futureRef.current = [];
      lastCommittedRef.current = normalizeForHistory(snapshot.nodes, snapshot.edges);
      skipNextCommitRef.current = true;
      restoringRef.current = true;
      syncFlags();
      restoringRef.current = false;
    },
    [syncFlags],
  );

  /** Grava estado atual e aplica nós+arestas num único render (evita histórico quebrado após async/IA). */
  const commitAndApplyDiagram = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      commitBeforeMutation();
      flushSync(() => {
        setNodes(nextNodes);
        setEdges(nextEdges);
      });
    },
    [commitBeforeMutation, setNodes, setEdges],
  );

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    commitBeforeMutation,
    commitAndApplyDiagram,
    beginInteraction,
    endInteraction,
    onNodeDragStart,
    onNodeDragStop,
    resetHistory,
  };
};
