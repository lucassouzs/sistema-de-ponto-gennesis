import type { Edge, Node } from '@xyflow/react';
import { createBpmnModeler } from './flowBpmnModelerExport';
import { buildAssociationEdge, buildFlowEdge, normalizeFlowEdge } from './flowEdge';
import { inferEdgeHandlesFromGeometry, type Point } from './flowEdgeRouting';
import { syncLaneHierarchy, LANE_NODE_TYPE } from './flowLaneHierarchy';
import { isStructuralFlowNode, POOL_NODE_TYPE } from './flowPoolHierarchy';
import {
  applyBizagiColorsToNodes,
  buildImportedFlowNodeData,
  extractBizagiColorMap,
  normalizeImportedRectStyle,
  participantHasFlowNodes,
} from './flowBizagiImport';
import { resolveImportedShapeLabel } from './flowBpmnLabels';
import {
  mapBpmnElementToNodeType,
  parseBpmnXmlWithFallback,
  prepareBpmnXmlForImport,
  type BpmnParseResult,
} from './flowBpmnImport';

type RegistryElement = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  waypoints?: Array<{ x: number; y: number }>;
  source?: RegistryElement;
  target?: RegistryElement;
  parent?: RegistryElement;
  labelTarget?: RegistryElement;
  hidden?: boolean;
  businessObject?: { id?: string; name?: string; $type?: string };
  label?: { businessObject?: { name?: string } };
};

function flowLabelCenterFromRegistry(el: RegistryElement): Point | null {
  if (typeof el.x !== 'number' || typeof el.y !== 'number') return null;
  const w = typeof el.width === 'number' ? el.width : 0;
  const h = typeof el.height === 'number' ? el.height : 0;
  return { x: el.x + w / 2, y: el.y + h / 2 };
}

function isConnection(el: RegistryElement): boolean {
  return Boolean(el.waypoints?.length && el.source && el.target);
}

function registryNodeSize(type: string): { width: number; height: number } {
  const local = type.replace(/^bpmn:/, '');
  if (local.includes('Event')) return { width: 36, height: 36 };
  if (local.includes('Gateway')) return { width: 60, height: 60 };
  if (local === 'Participant') return { width: 2000, height: 400 };
  if (local === 'Lane') return { width: 2000, height: 200 };
  return { width: 150, height: 60 };
}

function getShapeBox(el: RegistryElement): { x: number; y: number; width: number; height: number } | null {
  const mapped = mapRegistryType(el.type);
  if (!mapped && el.type !== 'bpmn:Lane' && el.type !== 'bpmn:Participant') return null;

  const defaults = registryNodeSize(el.type.replace(/^bpmn:/, ''));
  const width = typeof el.width === 'number' ? el.width : defaults.width;
  const height = typeof el.height === 'number' ? el.height : defaults.height;
  const x = typeof el.x === 'number' ? el.x : 0;
  const y = typeof el.y === 'number' ? el.y : 0;
  return { x, y, width, height };
}

function isShape(el: RegistryElement): boolean {
  if (el.type === 'label' || el.type.endsWith('Label')) return false;
  if (el.hidden) return false;
  return getShapeBox(el) !== null && !isConnection(el);
}

function shapeLabel(el: RegistryElement): string {
  const bo = el.businessObject as { name?: string; text?: string; id?: string; $type?: string } | undefined;
  return resolveImportedShapeLabel({
    type: bo?.$type ?? el.type,
    name: bo?.name ?? el.label?.businessObject?.name,
    text: bo?.text,
    id: bo?.id ?? el.id,
  });
}

function mapRegistryType(type: string): string | null {
  return mapBpmnElementToNodeType(type.replace(/^bpmn:/, ''));
}

function findPoolParent(el: RegistryElement | undefined): RegistryElement | undefined {
  let current = el?.parent;
  while (current) {
    if (current.type === 'bpmn:Participant') return current;
    if (current.type === 'bpmn:Process') return undefined;
    current = current.parent;
  }
  return undefined;
}

function findLaneParent(el: RegistryElement | undefined): RegistryElement | undefined {
  let current = el?.parent;
  while (current) {
    if (current.type === 'bpmn:Lane') return current;
    if (
      current.type === 'bpmn:Participant' ||
      current.type === 'bpmn:Process' ||
      current.type === 'bpmn:SubProcess'
    ) {
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function hiddenImportContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:-9999px;top:0;width:6000px;height:6000px;opacity:0;pointer-events:none;overflow:hidden';
  document.body.appendChild(container);
  return container;
}

/** Importa BPMN via bpmn-js (mesmo motor do export) — lê nós e sequenceFlows com fidelidade. */
export async function parseBpmnViaModeler(text: string): Promise<BpmnParseResult> {
  if (typeof document === 'undefined') {
    return { payload: null, warnings: [] };
  }

  const prepared = prepareBpmnXmlForImport(text);
  const bizagiColors = extractBizagiColorMap(text);
  const container = hiddenImportContainer();

  try {
    const modeler = await createBpmnModeler(container);
    const { warnings: importWarnings } = await modeler.importXML(prepared);

    const registry = modeler.get<{ getAll(): RegistryElement[] }>('elementRegistry');
    const all = registry.getAll();
    const warnings = [...importWarnings];

    const nodes: Node[] = [];
    const registryNodeBoxes: Array<{ id: string; box: { x: number; y: number; width: number; height: number }; type: string }> = [];

    for (const el of all) {
      if (!isShape(el)) continue;
      if (el.type === 'bpmn:Lane' || el.type === 'bpmn:Participant') continue;
      const box = getShapeBox(el);
      if (!box) continue;
      registryNodeBoxes.push({ id: el.id, box, type: el.type });
    }

    for (const participant of all) {
      if (participant.type !== 'bpmn:Participant') continue;
      const box = getShapeBox(participant);
      if (!box) continue;
      if (!participantHasFlowNodes(box, registryNodeBoxes)) continue;

      nodes.push({
        id: participant.id,
        type: POOL_NODE_TYPE,
        position: { x: Math.round(box.x), y: Math.round(box.y) },
        data: { label: shapeLabel(participant), importedBpmn: true },
        style: {
          width: Math.max(Math.round(box.width), 400),
          height: Math.max(Math.round(box.height), 200),
        },
        draggable: true,
        selectable: true,
        zIndex: -1,
      });
    }

    for (const lane of all) {
      if (lane.type !== 'bpmn:Lane') continue;
      const box = getShapeBox(lane);
      if (!box) continue;
      const pool = findPoolParent(lane);
      const position = pool
        ? {
            x: Math.round(box.x - (pool.x ?? 0)),
            y: Math.round(box.y - (pool.y ?? 0)),
          }
        : { x: Math.round(box.x), y: Math.round(box.y) };

      nodes.push({
        id: lane.id,
        type: LANE_NODE_TYPE,
        position,
        ...(pool ? { parentId: pool.id } : {}),
        data: { label: shapeLabel(lane) },
        style: {
          width: Math.max(Math.round(box.width), 360),
          height: Math.max(Math.round(box.height), 120),
        },
        draggable: true,
        selectable: true,
        zIndex: 0,
      });
    }

    for (const el of all) {
      if (!isShape(el)) continue;
      if (el.type === 'bpmn:Lane' || el.type === 'bpmn:Participant') continue;

      const mapped = mapRegistryType(el.type);
      if (!mapped) continue;

      const label = shapeLabel(el);
      if (mapped === 'bpmnText' && !label.trim()) continue;

      const box = getShapeBox(el)!;
      const lane = findLaneParent(el);
      const position = lane
        ? {
            x: Math.round(box.x - (lane.x ?? 0)),
            y: Math.round(box.y - (lane.y ?? 0)),
          }
        : { x: Math.round(box.x), y: Math.round(box.y) };

      const importStyle = normalizeImportedRectStyle(mapped, box.width, box.height);
      const colors = bizagiColors.get(el.id);

      nodes.push({
        id: el.id,
        type: mapped,
        position,
        ...(lane ? { parentId: lane.id } : {}),
        data: buildImportedFlowNodeData(el.type, label, colors),
        ...(importStyle ? { style: importStyle } : {}),
        zIndex: mapped === 'bpmnText' ? 2 : 1,
      });
    }

    const processNodeIds = new Set(
      nodes.filter((node) => !isStructuralFlowNode(String(node.type ?? ''))).map((node) => node.id),
    );

    const flowLabelCenterByFlowId = new Map<string, Point>();
    for (const el of all) {
      if (el.type !== 'label' || !el.labelTarget?.id) continue;
      const center = flowLabelCenterFromRegistry(el);
      if (center) flowLabelCenterByFlowId.set(el.labelTarget.id, center);
    }

    const edges: Edge[] = [];
    for (const el of all) {
      if (el.type !== 'bpmn:SequenceFlow' || !isConnection(el)) continue;

      const source = el.source!.id;
      const target = el.target!.id;
      if (!processNodeIds.has(source) || !processNodeIds.has(target)) {
        warnings.push(`Conexão "${el.id}" ignorada — nó não importado.`);
        continue;
      }

      const waypoints = el.waypoints ?? [];
      const src = el.source!;
      const tgt = el.target!;
      const handles = inferEdgeHandlesFromGeometry(
        {
          x: src.x ?? 0,
          y: src.y ?? 0,
          width: src.width ?? 140,
          height: src.height ?? 64,
        },
        {
          x: tgt.x ?? 0,
          y: tgt.y ?? 0,
          width: tgt.width ?? 140,
          height: tgt.height ?? 64,
        },
        waypoints,
      );

      const flowLabel =
        el.businessObject?.name?.trim() || el.label?.businessObject?.name?.trim() || undefined;
      const importedLabelCenter = flowLabelCenterByFlowId.get(el.id);

      edges.push(
        normalizeFlowEdge({
          ...buildFlowEdge({
            id: el.id,
            source,
            target,
            label: flowLabel,
          }),
          ...handles,
          data: {
            ...(waypoints.length > 2 ? { routePoints: waypoints.slice(1, -1) } : {}),
            ...(flowLabel ? { label: flowLabel } : {}),
            ...(importedLabelCenter ? { labelPosition: importedLabelCenter } : {}),
          },
        }),
      );
    }

    for (const el of all) {
      if (el.type !== 'bpmn:Association' || !isConnection(el)) continue;

      const source = el.source!.id;
      const target = el.target!.id;
      if (!processNodeIds.has(source) || !processNodeIds.has(target)) {
        warnings.push(`Associação "${el.id}" ignorada — nó não importado.`);
        continue;
      }

      const waypoints = el.waypoints ?? [];
      const src = el.source!;
      const tgt = el.target!;
      const handles = inferEdgeHandlesFromGeometry(
        {
          x: src.x ?? 0,
          y: src.y ?? 0,
          width: src.width ?? 140,
          height: src.height ?? 64,
        },
        {
          x: tgt.x ?? 0,
          y: tgt.y ?? 0,
          width: tgt.width ?? 140,
          height: tgt.height ?? 64,
        },
        waypoints,
      );

      edges.push(
        normalizeFlowEdge({
          ...buildAssociationEdge({
            id: el.id,
            source,
            target,
            ...(waypoints.length > 2 ? { routePoints: waypoints.slice(1, -1) } : {}),
          }),
          ...handles,
        }),
      );
    }

    const processName =
      all.find((el) => el.type === 'bpmn:Participant')?.businessObject?.name?.trim() ||
      all.find((el) => el.type === 'bpmn:Process')?.businessObject?.name?.trim();

    modeler.destroy();

    const processCount = processNodeIds.size;
    if (processCount === 0) {
      return parseBpmnXmlWithFallback(prepared);
    }

    const syncedNodes = applyBizagiColorsToNodes(syncLaneHierarchy(nodes), bizagiColors);

    if (edges.length === 0 && processCount > 1) {
      warnings.push('Nenhuma sequenceFlow encontrada no diagrama.');
    }

    return {
      payload: { name: processName, nodes: syncedNodes, edges },
      warnings,
    };
  } catch (error) {
    console.warn('Importação bpmn-js falhou, fallback para parser XML:', error);
    return parseBpmnXmlWithFallback(prepared);
  } finally {
    container.remove();
  }
}
