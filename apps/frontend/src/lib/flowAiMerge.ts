import type { Edge, Node } from '@xyflow/react';
import { nextFlowNodeId } from './flowAppend';
import type { BpmnNodeType } from './flowTypes';
import { buildNodeMap, LANE_NODE_TYPE, syncLaneHierarchy } from './flowLaneHierarchy';
import { POOL_NODE_TYPE } from './flowPoolHierarchy';

function isProcessNode(node: Node): boolean {
  const type = String(node.type ?? '');
  if (type === LANE_NODE_TYPE || type === POOL_NODE_TYPE || type === 'bpmnText') return false;
  if (node.id.startsWith('ai-panel-')) return false;
  return Boolean(type);
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getNodeLabel(node: Node): string {
  return normalizeLabel(String((node.data as { label?: string } | undefined)?.label ?? ''));
}

function getLaneLabel(node: Node, nodeMap: Map<string, Node>): string {
  let current: Node | undefined = node.parentId ? nodeMap.get(node.parentId) : undefined;
  while (current) {
    if (current.type === LANE_NODE_TYPE) {
      return normalizeLabel(String((current.data as { label?: string })?.label ?? ''));
    }
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  return '';
}

function processNodeKey(node: Node, nodeMap: Map<string, Node>): string {
  const label = getNodeLabel(node);
  if (!label) return '';
  return `${String(node.type ?? '')}|${getLaneLabel(node, nodeMap)}|${label}`;
}

function edgeIdentity(source: string, target: string, label?: string): string {
  return `${source}|${target}|${normalizeLabel(label ?? '')}`;
}

function readEdgeLabel(edge: Edge): string {
  const data = edge.data as { label?: string } | undefined;
  return data?.label?.trim() ?? '';
}

function findExistingLaneByLabel(existingNodes: Node[], laneLabel: string): Node | undefined {
  if (!laneLabel) return undefined;
  return existingNodes.find(
    (node) =>
      node.type === LANE_NODE_TYPE &&
      normalizeLabel(String((node.data as { label?: string })?.label ?? '')) === laneLabel,
  );
}

/**
 * Refinamento: mantém nós, raias e conexões já existentes; incorpora só o que a IA acrescentou.
 */
export function mergeAiFlowWithExisting(
  existingNodes: Node[],
  existingEdges: Edge[],
  aiNodes: Node[],
  aiEdges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const existingMap = buildNodeMap(existingNodes);
  const aiMap = buildNodeMap(aiNodes);

  const existingProcessNodes = existingNodes.filter(isProcessNode);
  const aiProcessNodes = aiNodes.filter(isProcessNode);

  const existingByKey = new Map<string, Node>();
  for (const node of existingProcessNodes) {
    const key = processNodeKey(node, existingMap);
    if (key && !existingByKey.has(key)) {
      existingByKey.set(key, node);
    }
  }

  const existingNodeIds = new Set(existingProcessNodes.map((node) => node.id));
  const aiToMergedId = new Map<string, string>();
  const newAiNodes: Node[] = [];

  for (const aiNode of aiProcessNodes) {
    const key = processNodeKey(aiNode, aiMap);
    const matched = key ? existingByKey.get(key) : undefined;

    if (matched) {
      aiToMergedId.set(aiNode.id, matched.id);
      continue;
    }

    let id = aiNode.id;
    if (existingMap.has(id) || newAiNodes.some((node) => node.id === id)) {
      id = nextFlowNodeId((aiNode.type ?? 'bpmnTask') as BpmnNodeType);
    }
    aiToMergedId.set(aiNode.id, id);

    const laneLabel = getLaneLabel(aiNode, aiMap);
    const existingLane = findExistingLaneByLabel(existingNodes, laneLabel);
    const remapped: Node = id === aiNode.id ? aiNode : { ...aiNode, id };

    if (existingLane) {
      newAiNodes.push({
        ...remapped,
        parentId: existingLane.id,
      });
    } else {
      newAiNodes.push(remapped);
    }
  }

  const existingLaneLabels = new Set(
    existingNodes
      .filter((node) => node.type === LANE_NODE_TYPE)
      .map((node) => normalizeLabel(String((node.data as { label?: string })?.label ?? '')))
      .filter(Boolean),
  );

  const structuralFromExisting = existingNodes.filter((node) => !isProcessNode(node));

  const newStructuralFromAi = aiNodes.filter((node) => {
    if (node.type === LANE_NODE_TYPE) {
      const label = normalizeLabel(String((node.data as { label?: string })?.label ?? ''));
      return Boolean(label && !existingLaneLabels.has(label));
    }
    if (node.type === POOL_NODE_TYPE) return false;
    return node.type === 'bpmnText' && !existingMap.has(node.id);
  });

  const mergedNodes = syncLaneHierarchy([
    ...structuralFromExisting,
    ...newStructuralFromAi,
    ...existingProcessNodes,
    ...newAiNodes,
  ]);

  const mergedNodeIds = new Set(mergedNodes.map((node) => node.id));
  const edgeKeys = new Set<string>();
  const mergedEdges: Edge[] = [];

  for (const edge of existingEdges) {
    if (!mergedNodeIds.has(edge.source) || !mergedNodeIds.has(edge.target)) continue;
    const key = edgeIdentity(edge.source, edge.target, readEdgeLabel(edge));
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    mergedEdges.push(edge);
  }

  for (const edge of aiEdges) {
    const source = aiToMergedId.get(edge.source) ?? edge.source;
    const target = aiToMergedId.get(edge.target) ?? edge.target;
    if (!mergedNodeIds.has(source) || !mergedNodeIds.has(target)) continue;

    const label = readEdgeLabel(edge);
    const key = edgeIdentity(source, target, label);
    if (edgeKeys.has(key)) continue;

    const sourceIsExisting = existingNodeIds.has(source);
    const targetIsExisting = existingNodeIds.has(target);

    if (sourceIsExisting && targetIsExisting) {
      const hasAnyEdgeBetween = mergedEdges.some(
        (existingEdge) =>
          (existingEdge.source === source && existingEdge.target === target) ||
          (existingEdge.source === target && existingEdge.target === source),
      );
      if (hasAnyEdgeBetween) continue;
    }

    edgeKeys.add(key);
    mergedEdges.push({
      ...edge,
      id: `edge-merge-${source}-${target}-${mergedEdges.length}`,
      source,
      target,
    });
  }

  return { nodes: mergedNodes, edges: mergedEdges };
}
