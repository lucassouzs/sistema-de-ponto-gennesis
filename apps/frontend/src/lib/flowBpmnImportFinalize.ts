import type { Edge, Node } from '@xyflow/react';
import { stripPreviewElements } from './flowAppend';
import { repairFlowEdges } from './flowCanvas';
import { preserveImportedEdges } from './flowDiagramFinalize';
import { normalizeFlowEdge, validateImportedFlowEdges } from './flowEdge';
import { placeImportedEdgeLabels } from './flowGatewayLabels';
import { syncLaneHierarchy } from './flowLaneHierarchy';
import { applyDefaultColorsToImportedNodes } from './flowNodeDefaults';

/**
 * Pipeline fiel para BPMN de qualquer origem (Bizagi, bpmn.io, Camunda, etc.).
 * Preserva posições DI, waypoints, rótulos e cores já presentes no arquivo.
 * Não infere setas, não refaz layout e não sobrescreve cores importadas.
 */
export function finalizeBpmnImport(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const syncedNodes = applyDefaultColorsToImportedNodes(syncLaneHierarchy(nodes));

  const rawEdges = stripPreviewElements(edges).map(normalizeFlowEdge);
  const repaired = repairFlowEdges(syncedNodes, rawEdges);
  const validated = validateImportedFlowEdges(syncedNodes, repaired);
  const labeled = placeImportedEdgeLabels(syncedNodes, validated);

  return {
    nodes: syncedNodes,
    edges: preserveImportedEdges(labeled),
  };
}
