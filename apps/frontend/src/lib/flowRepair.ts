import type { Edge, Node } from '@xyflow/react';

import { normalizeFlowEdge, sanitizeFlowEdges } from '@/lib/flowEdge';
import { fixOverlappingLabels } from '@/lib/flowGatewayLabels';
import { syncLaneHierarchy } from '@/lib/flowLaneHierarchy';
import { alignEventNodesToFlowRow, normalizeCanvasTaskDimensions } from '@/lib/flowNodeAnchors';

export type FlowRepairStats = {
  syncedNodes: boolean;
  layoutReorganized: boolean;
  labelsMoved: number;
  connectionsRepaired: number;
};

/**
 * Repara diagrama: sincroniza raias, alinha início/fim ao fluxo e ajusta rótulos Sim/Não.
 */
export function repairFlowDiagram(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; stats: FlowRepairStats } {
  const syncedNodes = syncLaneHierarchy(nodes);
  const sizedNodes = normalizeCanvasTaskDimensions(syncedNodes);
  const { nodes: alignedNodes, aligned } = alignEventNodesToFlowRow(sizedNodes, edges);

  const synced = alignedNodes.some((node) => {
    const prev = nodes.find((item) => item.id === node.id);
    if (!prev) return true;
    return (
      prev.parentId !== node.parentId ||
      prev.position.x !== node.position.x ||
      prev.position.y !== node.position.y
    );
  });

  const normalizedEdges = sanitizeFlowEdges(alignedNodes, edges.map((edge) => normalizeFlowEdge(edge)));
  const { edges: fixedEdges, movedCount } = fixOverlappingLabels(alignedNodes, normalizedEdges);

  return {
    nodes: alignedNodes,
    edges: fixedEdges,
    stats: {
      syncedNodes: synced,
      layoutReorganized: aligned > 0,
      labelsMoved: movedCount,
      connectionsRepaired: 0,
    },
  };
}
