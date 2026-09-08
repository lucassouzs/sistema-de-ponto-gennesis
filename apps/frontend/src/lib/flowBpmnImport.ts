import type { Edge, Node } from '@xyflow/react';
import { buildAssociationEdge, buildFlowEdge, normalizeFlowEdge } from './flowEdge';
import { syncLaneHierarchy, LANE_NODE_TYPE } from './flowLaneHierarchy';
import { inferEdgeHandlesFromGeometry, type Point } from './flowEdgeRouting';
import { fixElementNames } from './flowBpmnFixNames';
import { resolveImportedShapeLabel } from './flowBpmnLabels';
import {
  applyBizagiColorsToNodes,
  buildImportedFlowNodeData,
  extractBizagiColorMap,
  normalizeImportedRectStyle,
  readTextAnnotationContent,
} from './flowBizagiImport';
export { RECTANGULAR_NODE_TYPES } from './flowBpmnImportConstants';

export type ImportedFlowPayload = {
  name?: string;
  nodes: Node[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
};

export type BpmnParseResult = {
  payload: ImportedFlowPayload | null;
  warnings: string[];
};

function bpmnTagLocalName(el: Element): string {
  return el.localName.replace(/^[^:]+:/, '');
}

function elementsByLocalName(root: Element | Document, localName: string): Element[] {
  const rootEl = root instanceof Document ? root.documentElement : root;
  if (!rootEl) return [];
  const result: Element[] = [];
  Array.from(rootEl.getElementsByTagName('*')).forEach((el) => {
    if (bpmnTagLocalName(el) === localName) result.push(el);
  });
  return result;
}

function firstElementByLocalName(root: Element | Document, localName: string): Element | null {
  return elementsByLocalName(root, localName)[0] ?? null;
}

export function cleanBpmnXmlForImport(xml: string): string {
  return xml
    .replace(/^\uFEFF/, '')
    .replace(/xmlns:activiti="[^"]*"/gi, '')
    .replace(/xmlns:flowable="[^"]*"/gi, '')
    .replace(/xmlns:camunda="[^"]*"/gi, '')
    .replace(/\sactiviti:[\w-]+="[^"]*"/gi, '')
    .replace(/\sflowable:[\w-]+="[^"]*"/gi, '')
    .replace(/\scamunda:[\w-]+="[^"]*"/gi, '')
    .replace(/<(\/?)activiti:/gi, '<$1')
    .replace(/<(\/?)flowable:/gi, '<$1')
    .replace(/<(\/?)camunda:/gi, '<$1');
}

export function looksLikeBpmnXml(text: string): boolean {
  const sample = text.trim().slice(0, 4000).toLowerCase();
  return (
    sample.includes('<definitions') ||
    sample.includes(':definitions') ||
    (sample.includes('bpmn') && sample.includes('process'))
  );
}

export function mapBpmnElementToNodeType(tag: string): string | null {
  switch (tag) {
    case 'startEvent':
      return 'bpmnStart';
    case 'endEvent':
      return 'bpmnEnd';
    case 'exclusiveGateway':
    case 'inclusiveGateway':
    case 'complexGateway':
    case 'eventBasedGateway':
      return 'bpmnGateway';
    case 'parallelGateway':
      return 'bpmnParallelGateway';
    case 'task':
    case 'userTask':
    case 'serviceTask':
    case 'scriptTask':
    case 'manualTask':
    case 'businessRuleTask':
    case 'sendTask':
    case 'receiveTask':
    case 'callActivity':
    case 'subProcess':
    case 'intermediateCatchEvent':
    case 'intermediateThrowEvent':
    case 'boundaryEvent':
      return 'bpmnTask';
    case 'textAnnotation':
      return 'bpmnText';
    case 'dataObjectReference':
    case 'dataStoreReference':
      return 'bpmnData';
    default:
      return null;
  }
}

function countMappableFlowNodes(process: Element): number {
  return collectFlowElements(process).length;
}

function resolveMainProcess(doc: Document): Element | null {
  const processes = elementsByLocalName(doc, 'process');
  if (processes.length === 0) return null;
  if (processes.length === 1) return processes[0]!;

  const plane = firstElementByLocalName(doc, 'BPMNPlane');
  const planeRef = plane?.getAttribute('bpmnElement');
  if (planeRef) {
    const participant = elementsByLocalName(doc, 'participant').find(
      (el) => el.getAttribute('id') === planeRef,
    );
    const processRef = participant?.getAttribute('processRef');
    if (processRef) {
      const linked = processes.find((el) => el.getAttribute('id') === processRef);
      if (linked) return linked;
    }

    const direct = processes.find((el) => el.getAttribute('id') === planeRef);
    if (direct) return direct;
  }

  return [...processes].sort((a, b) => countMappableFlowNodes(b) - countMappableFlowNodes(a))[0]!;
}

function collectFlowElements(process: Element): Element[] {
  const result: Element[] = [];

  const walk = (el: Element) => {
    const tag = bpmnTagLocalName(el);
    if (tag === 'laneSet') {
      Array.from(el.children).forEach((child) => walk(child));
      return;
    }
    if (tag === 'lane' || tag === 'sequenceFlow' || tag === 'documentation') {
      return;
    }

    const mapped = mapBpmnElementToNodeType(tag);
    if (mapped) {
      result.push(el);
      if (tag === 'subProcess') {
        Array.from(el.children).forEach((child) => walk(child));
      }
      return;
    }

    Array.from(el.children).forEach((child) => walk(child));
  };

  Array.from(process.children).forEach((child) => walk(child));
  return result;
}

function buildNodeRefResolver(
  processNodes: Node[],
  flowElements: Element[],
): (ref: string) => string | null {
  const nodeIds = new Set(processNodes.map((node) => node.id));
  const labelToId = new Map<string, string>();

  for (const el of flowElements) {
    const id = el.getAttribute('id');
    const name = el.getAttribute('name')?.trim().toLowerCase();
    if (id && name) labelToId.set(name, id);
  }

  for (const node of processNodes) {
    const label = String((node.data as { label?: string })?.label ?? '').trim().toLowerCase();
    if (label) labelToId.set(label, node.id);
  }

  return (ref: string): string | null => {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    if (nodeIds.has(trimmed)) return trimmed;

    const byLabel = labelToId.get(trimmed.toLowerCase());
    if (byLabel) return byLabel;

    const partial = processNodes.find(
      (node) =>
        node.id === trimmed ||
        node.id.endsWith(trimmed) ||
        trimmed.endsWith(node.id) ||
        node.id.split('_').pop() === trimmed.split('_').pop(),
    );
    return partial?.id ?? null;
  };
}

type SequenceFlowRecord = {
  id: string;
  source?: string;
  target?: string;
  label?: string;
};

type AssociationRecord = {
  id: string;
  source?: string;
  target?: string;
};

function collectAssociationRecords(doc: Document, process: Element): AssociationRecord[] {
  return elementsByLocalName(process, 'association')
    .map((el) => ({
      id: el.getAttribute('id') ?? '',
      source: el.getAttribute('sourceRef') ?? undefined,
      target: el.getAttribute('targetRef') ?? undefined,
    }))
    .filter((record) => record.id && record.source && record.target);
}

function collectSequenceFlowRecords(doc: Document, process: Element): Map<string, SequenceFlowRecord> {
  const records = new Map<string, SequenceFlowRecord>();

  const touch = (id: string): SequenceFlowRecord => {
    const existing = records.get(id);
    if (existing) return existing;
    const created = { id };
    records.set(id, created);
    return created;
  };

  elementsByLocalName(doc, 'sequenceFlow').forEach((flowEl) => {
    const id = flowEl.getAttribute('id');
    if (!id) return;
    const record = touch(id);
    record.source =
      flowEl.getAttribute('sourceRef') ??
      flowEl.getAttribute('source') ??
      record.source;
    record.target =
      flowEl.getAttribute('targetRef') ??
      flowEl.getAttribute('target') ??
      record.target;
    const label = flowEl.getAttribute('name')?.trim();
    if (label) record.label = label;
  });

  collectFlowElements(process).forEach((nodeEl) => {
    const nodeId = nodeEl.getAttribute('id');
    if (!nodeId) return;

    elementsByLocalName(nodeEl, 'outgoing').forEach((outEl) => {
      const flowId = outEl.textContent?.trim();
      if (!flowId) return;
      const record = touch(flowId);
      if (!record.source) record.source = nodeId;
    });

    elementsByLocalName(nodeEl, 'incoming').forEach((inEl) => {
      const flowId = inEl.textContent?.trim();
      if (!flowId) return;
      const record = touch(flowId);
      if (!record.target) record.target = nodeId;
    });
  });

  return records;
}

function inferEdgesFromDiagramWaypoints(
  doc: Document,
  processNodes: Node[],
  boundsById: Map<string, { x: number; y: number; width: number; height: number }>,
  existingKeys: Set<string>,
): Edge[] {
  const nodeIds = new Set(processNodes.map((node) => node.id));
  const centerOf = (id: string) => {
    const bounds = boundsById.get(id);
    if (!bounds) return null;
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  };

  const nearestNode = (x: number, y: number, excludeId?: string): string | null => {
    let bestId: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const node of processNodes) {
      if (excludeId && node.id === excludeId) continue;
      const center = centerOf(node.id);
      if (!center) continue;
      const dist = (center.x - x) ** 2 + (center.y - y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = node.id;
      }
    }
    return bestId;
  };

  const edges: Edge[] = [];

  elementsByLocalName(doc, 'BPMNEdge').forEach((edgeEl) => {
    const flowId = edgeEl.getAttribute('bpmnElement');
    if (!flowId) return;

    const waypoints: Point[] = [];
    elementsByLocalName(edgeEl, 'waypoint').forEach((wp) => {
      waypoints.push({
        x: Number(wp.getAttribute('x') ?? 0),
        y: Number(wp.getAttribute('y') ?? 0),
      });
    });
    if (waypoints.length < 2) return;

    const start = waypoints[0]!;
    const end = waypoints[waypoints.length - 1]!;
    const source = nearestNode(start.x, start.y);
    const target = nearestNode(end.x, end.y, source ?? undefined);
    if (!source || !target || source === target) return;
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;

    const key = `${source}\0${target}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);

    const sourceBounds = boundsById.get(source);
    const targetBounds = boundsById.get(target);
    const handles =
      sourceBounds && targetBounds
        ? inferEdgeHandlesFromGeometry(sourceBounds, targetBounds, waypoints)
        : {};

    edges.push(
      normalizeFlowEdge({
        ...buildFlowEdge({ id: flowId, source, target }),
        ...handles,
        data: { routePoints: waypoints.slice(1, -1) },
      }),
    );
  });

  return edges;
}

function readBounds(shape: Element): { x: number; y: number; width: number; height: number } | null {
  const bounds =
    elementsByLocalName(shape, 'Bounds')[0] ??
    shape.querySelector('Bounds') ??
    shape.querySelector('[localName="Bounds"]');
  if (!bounds) return null;
  return {
    x: Number(bounds.getAttribute('x') ?? 0),
    y: Number(bounds.getAttribute('y') ?? 0),
    width: Number(bounds.getAttribute('width') ?? 140),
    height: Number(bounds.getAttribute('height') ?? 64),
  };
}

function collectDiagramMetrics(doc: Document) {
  const boundsById = new Map<string, { x: number; y: number; width: number; height: number }>();
  const waypointsByFlowId = new Map<string, Point[]>();

  elementsByLocalName(doc, 'BPMNShape').forEach((shape) => {
    const ref = shape.getAttribute('bpmnElement');
    const bounds = readBounds(shape);
    if (!ref || !bounds) return;
    boundsById.set(ref, bounds);
  });

  elementsByLocalName(doc, 'BPMNEdge').forEach((edgeEl) => {
    const ref = edgeEl.getAttribute('bpmnElement');
    if (!ref) return;
    const points: Point[] = [];
    elementsByLocalName(edgeEl, 'waypoint').forEach((wp) => {
      points.push({
        x: Number(wp.getAttribute('x') ?? 0),
        y: Number(wp.getAttribute('y') ?? 0),
      });
    });
    if (points.length >= 2) waypointsByFlowId.set(ref, points);
  });

  return { boundsById, waypointsByFlowId };
}

function defaultBounds(index: number): { x: number; y: number; width: number; height: number } {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return {
    x: 80 + col * 180,
    y: 80 + row * 120,
    width: 140,
    height: 64,
  };
}

export function parseBpmnXml(text: string): BpmnParseResult {
  const warnings: string[] = [];
  const bizagiColors = extractBizagiColorMap(text);
  const doc = new DOMParser().parseFromString(text, 'application/xml');

  if (doc.querySelector('parsererror')) {
    return { payload: null, warnings: ['XML malformado ou ilegível.'] };
  }

  const process = resolveMainProcess(doc);
  if (!process) {
    return { payload: null, warnings: ['Nenhum processo BPMN (<process>) encontrado no arquivo.'] };
  }

  const { boundsById, waypointsByFlowId } = collectDiagramMetrics(doc);

  const nodeToLaneId = new Map<string, string>();
  elementsByLocalName(process, 'lane').forEach((laneEl) => {
    const laneId = laneEl.getAttribute('id');
    if (!laneId) return;
    elementsByLocalName(laneEl, 'flowNodeRef').forEach((refEl) => {
      const nodeId = refEl.textContent?.trim();
      if (nodeId) nodeToLaneId.set(nodeId, laneId);
    });
  });

  const nodes: Node[] = [];

  elementsByLocalName(process, 'lane').forEach((laneEl) => {
    const id = laneEl.getAttribute('id');
    if (!id) return;
    const bounds = boundsById.get(id) ?? defaultBounds(nodes.length);
    if (!boundsById.has(id)) {
      warnings.push(`Raia "${laneEl.getAttribute('name') || id}" sem posição no diagrama — posição estimada.`);
    }
    nodes.push({
      id,
      type: LANE_NODE_TYPE,
      position: { x: bounds.x, y: bounds.y },
      data: { label: laneEl.getAttribute('name')?.trim() || 'Raia' },
      style: { width: Math.max(bounds.width, 360), height: Math.max(bounds.height, 120) },
      draggable: true,
      selectable: true,
      zIndex: 0,
    });
  });

  const flowElements = collectFlowElements(process);
  if (flowElements.length === 0) {
    return { payload: null, warnings: ['Processo BPMN sem elementos de fluxo reconhecíveis.'] };
  }

  flowElements.forEach((child, index) => {
    const tag = bpmnTagLocalName(child);
    const nodeType = mapBpmnElementToNodeType(tag);
    if (!nodeType) return;

    const id = child.getAttribute('id') ?? `imported-${index}`;
    const label = resolveImportedShapeLabel({
      type: tag,
      name: child.getAttribute('name'),
      text: tag === 'textAnnotation' ? readTextAnnotationContent(child) : child.getAttribute('text'),
      id,
    });
    if (nodeType === 'bpmnText' && !label.trim()) return;

    const bounds = boundsById.get(id) ?? defaultBounds(index);
    if (!boundsById.has(id)) {
      warnings.push(`Elemento "${child.getAttribute('name') || id}" sem layout — posição estimada.`);
    }

    const parentLaneId = nodeToLaneId.get(id);
    const laneBounds = parentLaneId ? boundsById.get(parentLaneId) : undefined;
    const position = laneBounds
      ? { x: bounds.x - laneBounds.x, y: bounds.y - laneBounds.y }
      : { x: bounds.x, y: bounds.y };

    const importStyle = normalizeImportedRectStyle(nodeType, bounds.width, bounds.height);
    const colors = bizagiColors.get(id);

    nodes.push({
      id,
      type: nodeType,
      position,
      ...(parentLaneId ? { parentId: parentLaneId } : {}),
      data: buildImportedFlowNodeData(tag, label, colors),
      ...(importStyle ? { style: importStyle } : {}),
      zIndex: nodeType === 'bpmnText' ? 2 : 1,
    });
  });

  const processNodes = nodes.filter((node) => node.type !== LANE_NODE_TYPE);
  const resolveRef = buildNodeRefResolver(processNodes, flowElements);
  const edges: Edge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (record: SequenceFlowRecord) => {
    if (!record.source || !record.target) return;
    const source = resolveRef(record.source);
    const target = resolveRef(record.target);
    if (!source || !target || source === target) {
      warnings.push(`Conexão "${record.id}" ignorada — origem ou destino desconhecido.`);
      return;
    }

    const key = `${source}\0${target}\0${record.id}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);

    const sourceBounds = boundsById.get(source);
    const targetBounds = boundsById.get(target);
    const waypoints = waypointsByFlowId.get(record.id);
    const handles =
      sourceBounds && targetBounds
        ? inferEdgeHandlesFromGeometry(sourceBounds, targetBounds, waypoints)
        : {};

    edges.push(
      normalizeFlowEdge({
        ...buildFlowEdge({
          id: record.id,
          source,
          target,
          label: record.label || undefined,
        }),
        ...handles,
        ...(waypoints && waypoints.length > 2
          ? { data: { routePoints: waypoints.slice(1, -1) } }
          : {}),
      }),
    );
  };

  collectSequenceFlowRecords(doc, process).forEach((record) => addEdge(record));

  const sequenceFlowCount = edges.length;

  const addAssociation = (record: AssociationRecord) => {
    if (!record.source || !record.target) return;
    const source = resolveRef(record.source);
    const target = resolveRef(record.target);
    if (!source || !target || source === target) return;

    const key = `${source}\0${target}\0${record.id}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);

    const sourceBounds = boundsById.get(source);
    const targetBounds = boundsById.get(target);
    const waypoints = waypointsByFlowId.get(record.id);
    const handles =
      sourceBounds && targetBounds
        ? inferEdgeHandlesFromGeometry(sourceBounds, targetBounds, waypoints)
        : {};

    edges.push(
      normalizeFlowEdge({
        ...buildAssociationEdge({
          id: record.id,
          source,
          target,
          ...(waypoints && waypoints.length > 2 ? { routePoints: waypoints.slice(1, -1) } : {}),
        }),
        ...handles,
      }),
    );
  };

  collectAssociationRecords(doc, process).forEach((record) => addAssociation(record));

  if (sequenceFlowCount === 0) {
    const connectionKeys = new Set(edges.map((edge) => `${edge.source}\0${edge.target}`));
    const diagramEdges = inferEdgesFromDiagramWaypoints(doc, processNodes, boundsById, connectionKeys);
    diagramEdges.forEach((edge) => {
      edgeKeys.add(`${edge.source}\0${edge.target}\0${edge.id}`);
      edges.push(edge);
    });

    if (diagramEdges.length > 0) {
      warnings.push(`${diagramEdges.length} conexão(ões) recuperada(s) a partir do layout do diagrama.`);
    }
  }

  const processName =
    process.getAttribute('name')?.trim() ||
    elementsByLocalName(doc, 'participant')[0]?.getAttribute('name')?.trim() ||
    elementsByLocalName(doc, 'definitions')[0]?.getAttribute('name')?.trim();

  const syncedNodes = applyBizagiColorsToNodes(syncLaneHierarchy(nodes), bizagiColors);

  if (edges.length === 0 && processNodes.length > 1) {
    warnings.push('Nenhuma sequenceFlow encontrada — conecte os elementos manualmente se necessário.');
  }

  return {
    payload: { name: processName, nodes: syncedNodes, edges },
    warnings,
  };
}

const BPMNDI_NS = 'http://www.omg.org/spec/BPMN/20100524/DI';
const DC_NS = 'http://www.omg.org/spec/DD/20100524/DC';
const DI_NS = 'http://www.omg.org/spec/DD/20100524/DI';

const AI_POOL_X = 100;
const AI_POOL_Y = 100;
const AI_POOL_WIDTH = 2000;
const AI_LANE_HEIGHT = 200;
const AI_LANE_INSET_X = 130;
const AI_NODE_START_X = 200;
const AI_NODE_GAP_X = 180;

function flowElementSize(tag: string): { width: number; height: number } {
  switch (tag) {
    case 'startEvent':
    case 'endEvent':
      return { width: 36, height: 36 };
    case 'exclusiveGateway':
    case 'inclusiveGateway':
    case 'parallelGateway':
    case 'complexGateway':
    case 'eventBasedGateway':
      return { width: 60, height: 60 };
    default:
      return { width: 150, height: 60 };
  }
}

function centerYInLane(laneY: number, height: number): number {
  return laneY + (AI_LANE_HEIGHT - height) / 2;
}

function needsDiagramGeneration(doc: Document, process: Element): boolean {
  const { boundsById } = collectDiagramMetrics(doc);
  const flowElements = collectFlowElements(process);
  if (flowElements.length === 0) return false;
  const covered = flowElements.filter((el) => {
    const id = el.getAttribute('id');
    return id && boundsById.has(id);
  }).length;
  return covered < flowElements.length;
}

function ensureRootNamespaces(definitions: Element): void {
  if (!definitions.getAttribute('xmlns')) {
    definitions.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
  }
  if (!definitions.getAttribute('xmlns:bpmndi')) {
    definitions.setAttribute('xmlns:bpmndi', BPMNDI_NS);
  }
  if (!definitions.getAttribute('xmlns:dc')) {
    definitions.setAttribute('xmlns:dc', DC_NS);
  }
  if (!definitions.getAttribute('xmlns:di')) {
    definitions.setAttribute('xmlns:di', DI_NS);
  }
}

function appendBounds(
  doc: Document,
  parent: Element,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const bounds = doc.createElementNS(DC_NS, 'dc:Bounds');
  bounds.setAttribute('x', String(Math.round(x)));
  bounds.setAttribute('y', String(Math.round(y)));
  bounds.setAttribute('width', String(Math.round(width)));
  bounds.setAttribute('height', String(Math.round(height)));
  parent.appendChild(bounds);
}

function appendShape(
  doc: Document,
  plane: Element,
  id: string,
  bpmnElement: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extraAttrs?: Record<string, string>,
): void {
  const shape = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNShape');
  shape.setAttribute('id', id);
  shape.setAttribute('bpmnElement', bpmnElement);
  for (const [key, value] of Object.entries(extraAttrs ?? {})) {
    shape.setAttribute(key, value);
  }
  appendBounds(doc, shape, x, y, width, height);
  plane.appendChild(shape);
}

function appendEdge(
  doc: Document,
  plane: Element,
  id: string,
  bpmnElement: string,
  points: Array<{ x: number; y: number }>,
): void {
  const edge = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNEdge');
  edge.setAttribute('id', id);
  edge.setAttribute('bpmnElement', bpmnElement);
  for (const point of points) {
    const waypoint = doc.createElementNS(DI_NS, 'di:waypoint');
    waypoint.setAttribute('x', String(Math.round(point.x)));
    waypoint.setAttribute('y', String(Math.round(point.y)));
    edge.appendChild(waypoint);
  }
  plane.appendChild(edge);
}

/** Gera BPMNDiagram quando a IA retorna só o modelo sem layout (causa importação vazia). */
export function ensureBpmnDiagramInterchange(xml: string): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return xml;
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return xml;

  const process = resolveMainProcess(doc);
  if (!process) return xml;
  if (!needsDiagramGeneration(doc, process)) return xml;

  const definitions = doc.documentElement;
  ensureRootNamespaces(definitions);

  for (const diagram of elementsByLocalName(doc, 'BPMNDiagram')) {
    diagram.remove();
  }

  const collaboration = elementsByLocalName(doc, 'collaboration')[0];
  const participant = elementsByLocalName(doc, 'participant')[0];
  const planeRef =
    collaboration?.getAttribute('id') ??
    participant?.getAttribute('id') ??
    process.getAttribute('id') ??
    'BPMNPlane_1';

  const lanes = elementsByLocalName(process, 'lane');
  const nodeToLane = new Map<string, string>();
  for (const lane of lanes) {
    const laneId = lane.getAttribute('id');
    if (!laneId) continue;
    for (const ref of elementsByLocalName(lane, 'flowNodeRef')) {
      const nodeId = ref.textContent?.trim();
      if (nodeId) nodeToLane.set(nodeId, laneId);
    }
  }

  const flowElements = collectFlowElements(process);
  const laneLayouts =
    lanes.length > 0
      ? lanes.map((lane, index) => ({
          lane,
          laneId: lane.getAttribute('id') ?? `lane-${index + 1}`,
          y: AI_POOL_Y + index * AI_LANE_HEIGHT,
          nodes: flowElements.filter(
            (node) => nodeToLane.get(node.getAttribute('id') ?? '') === lane.getAttribute('id'),
          ),
        }))
      : [
          {
            lane: null,
            laneId: 'lane-auto',
            y: AI_POOL_Y,
            nodes: flowElements,
          },
        ];

  const assignedIds = new Set<string>();
  for (const layout of laneLayouts) {
    for (const node of layout.nodes) {
      const id = node.getAttribute('id');
      if (id) assignedIds.add(id);
    }
  }
  const orphanNodes = flowElements.filter((node) => {
    const id = node.getAttribute('id');
    return id && !assignedIds.has(id);
  });
  if (orphanNodes.length > 0 && laneLayouts.length > 0) {
    laneLayouts[0]!.nodes.push(...orphanNodes);
  }

  const boundsById = new Map<string, { x: number; y: number; width: number; height: number }>();
  const poolHeight = Math.max(AI_LANE_HEIGHT, laneLayouts.length * AI_LANE_HEIGHT);

  const diagram = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNDiagram');
  diagram.setAttribute('id', 'BPMNDiagram_generated');
  const plane = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNPlane');
  plane.setAttribute('id', 'BPMNPlane_generated');
  plane.setAttribute('bpmnElement', planeRef);
  diagram.appendChild(plane);

  if (participant) {
    appendShape(doc, plane, `${participant.getAttribute('id') ?? 'pool1'}_di`, participant.getAttribute('id') ?? 'pool1', AI_POOL_X, AI_POOL_Y, AI_POOL_WIDTH, poolHeight, {
      isHorizontal: 'true',
    });
  }

  for (const layout of laneLayouts) {
    const { width, height } = { width: AI_POOL_WIDTH - (AI_LANE_INSET_X - AI_POOL_X), height: AI_LANE_HEIGHT };
    if (layout.lane) {
      appendShape(doc, plane, `${layout.laneId}_di`, layout.laneId, AI_LANE_INSET_X, layout.y, width, height, {
        isHorizontal: 'true',
      });
    }

    layout.nodes.forEach((nodeEl, index) => {
      const id = nodeEl.getAttribute('id');
      if (!id) return;
      const tag = bpmnTagLocalName(nodeEl);
      const size = flowElementSize(tag);
      const x = AI_NODE_START_X + index * AI_NODE_GAP_X;
      const y = centerYInLane(layout.y, size.height);
      boundsById.set(id, { x, y, ...size });
      appendShape(doc, plane, `${id}_di`, id, x, y, size.width, size.height, tag.includes('Gateway') ? { isMarkerVisible: 'true' } : undefined);
    });
  }

  const flowRecords = collectSequenceFlowRecords(doc, process);
  for (const record of flowRecords.values()) {
    if (!record.source || !record.target) continue;
    const sourceBounds = boundsById.get(record.source);
    const targetBounds = boundsById.get(record.target);
    if (!sourceBounds || !targetBounds) continue;

    const sourceCenter = {
      x: sourceBounds.x + sourceBounds.width,
      y: sourceBounds.y + sourceBounds.height / 2,
    };
    const targetCenter = {
      x: targetBounds.x,
      y: targetBounds.y + targetBounds.height / 2,
    };
    appendEdge(doc, plane, `${record.id}_di`, record.id, [sourceCenter, targetCenter]);
  }

  definitions.appendChild(diagram);
  return new XMLSerializer().serializeToString(doc);
}

/** Pipeline de preparação do XML gerado pela IA antes do import. */
export function prepareBpmnXmlForImport(xml: string): string {
  const named = fixElementNames(xml);
  const cleaned = cleanBpmnXmlForImport(named);
  return ensureBpmnDiagramInterchange(cleaned);
}

export function parseBpmnXmlWithFallback(text: string): BpmnParseResult {
  const prepared = prepareBpmnXmlForImport(text);
  const first = parseBpmnXml(prepared);
  if (first.payload) return first;

  if (prepared === text) return first;

  const second = parseBpmnXml(text);
  if (second.payload) {
    return {
      payload: second.payload,
      warnings: [
        ...second.warnings,
        'Alguns metadados de ferramentas externas foram ignorados na importação.',
      ],
    };
  }

  return {
    payload: null,
    warnings: [...first.warnings, ...second.warnings],
  };
}
