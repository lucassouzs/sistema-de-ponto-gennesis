import type { Edge, Node } from '@xyflow/react';
import { autoRouteFlowEdges } from './flowEdgeAutoRoute';
import { normalizeFlowEdge, type FlowEdgeData } from './flowEdge';
import { fixGatewayLabels, fixOverlappingLabels } from './flowGatewayLabels';

/** Remove rotas/posições de rótulo salvas para recalcular com o layout atual. */
export function cleanEdgesForRouting(edges: Edge[]): Edge[] {
  return edges.map((edge) => {
    const data = { ...(edge.data as FlowEdgeData) };
    delete data.labelPosition;
    delete data.routePoints;
    return normalizeFlowEdge({ ...edge, data });
  });
}

/** Importação BPMN — mantém waypoints e rótulos do arquivo. */
export function preserveImportedEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => normalizeFlowEdge({ ...edge }));
}

/** Roteamento ortogonal + rótulos Sim/Não — mesmo pipeline da geração por IA. */
export function finalizeDiagramEdges(
  nodes: Node[],
  edges: Edge[],
  options?: { preserveRoutePoints?: boolean; preserveImportedGeometry?: boolean },
): { edges: Edge[]; labelsMoved: number } {
  const preserveImport = options?.preserveImportedGeometry ?? options?.preserveRoutePoints;

  if (preserveImport) {
    return { edges: preserveImportedEdges(edges), labelsMoved: 0 };
  }

  const cleanEdges = cleanEdgesForRouting(edges);
  const routed = autoRouteFlowEdges(nodes, cleanEdges);
  const labeled = fixGatewayLabels(nodes, routed);
  const { edges: fixedEdges, movedCount } = fixOverlappingLabels(nodes, labeled);
  return { edges: fixedEdges, labelsMoved: movedCount };
}
