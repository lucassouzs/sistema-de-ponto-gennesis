export interface LogicElement {
  id: string;
  type: 'startEvent' | 'endEvent' | 'task' | 'exclusiveGateway';
  name: string;
  lane: string;
}

export interface LogicFlow {
  from: string;
  to: string;
  label?: string;
}

export interface ProcessLogic {
  processName: string;
  lanes: string[];
  elements: LogicElement[];
  flows: LogicFlow[];
}

const ELEMENT_SIZES: Record<LogicElement['type'], { width: number; height: number }> = {
  startEvent: { width: 36, height: 36 },
  endEvent: { width: 36, height: 36 },
  task: { width: 150, height: 60 },
  exclusiveGateway: { width: 50, height: 50 },
};

const LANE_HEIGHT = 200;
const LANE_HEIGHT_BRANCHING = 320;
const LANE_HEIGHT_LOOP = 400;
const LAYER_SPACING_X = 180;
const BRANCH_OFFSET_Y = 88;
const LOOP_ROUTE_OFFSET_Y = 100;
const START_X = 150;
const START_Y = 80;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateLabel(label: string, max: number): string {
  const clean = String(label || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function inferGatewayFlowLabel(
  logic: ProcessLogic,
  flow: LogicFlow,
  indexInOutgoing: number,
): string | undefined {
  if (flow.label?.trim()) return flow.label.trim();
  const source = logic.elements.find((el) => el.id === flow.from);
  if (source?.type !== 'exclusiveGateway') return undefined;
  const target = logic.elements.find((el) => el.id === flow.to);
  const targetName = (target?.name ?? '').toLowerCase();
  if (
    targetName.includes('casa') ||
    targetName.includes('ficar') ||
    targetName.includes('cancel') ||
    targetName.includes('reprova')
  ) {
    return 'Não';
  }
  if (
    targetName.includes('trabalho') ||
    targetName.includes('ônibus') ||
    targetName.includes('onibus') ||
    targetName.includes('chegar')
  ) {
    return 'Sim';
  }
  return ['Sim', 'Não', 'Opção A', 'Opção B'][indexInOutgoing];
}

function ensureGatewayFlowLabels(logic: ProcessLogic): LogicFlow[] {
  const gatewayIds = new Set(
    logic.elements.filter((el) => el.type === 'exclusiveGateway').map((el) => el.id),
  );
  const outgoingByGateway = new Map<string, LogicFlow[]>();
  for (const flow of logic.flows) {
    if (!gatewayIds.has(flow.from)) continue;
    outgoingByGateway.set(flow.from, [...(outgoingByGateway.get(flow.from) ?? []), flow]);
  }

  return logic.flows.map((flow) => {
    if (!gatewayIds.has(flow.from) || flow.label?.trim()) return flow;
    const outgoing = outgoingByGateway.get(flow.from) ?? [];
    const index = outgoing.findIndex((item) => item.from === flow.from && item.to === flow.to);
    const label = inferGatewayFlowLabel(logic, flow, index);
    return label ? { ...flow, label } : flow;
  });
}

/** Gateway exibe rótulo externo — nunca usar o prompt inteiro como nome. */
function normalizeElementName(type: LogicElement['type'], name: string): string {
  const clean = String(name || '').trim();
  if (type === 'exclusiveGateway') {
    if (!clean || clean.length > 72) return 'Decisão?';
    return truncateLabel(clean, 40);
  }
  if (type === 'startEvent') return truncateLabel(clean || 'Início', 32);
  if (type === 'endEvent') return truncateLabel(clean || 'Fim', 32);
  return truncateLabel(clean || 'Tarefa', 56);
}

export function calculateLayers(elements: LogicElement[], flows: LogicFlow[]): Map<string, number> {
  const layers = new Map<string, number>();
  const outgoing = new Map<string, LogicFlow[]>();
  const incomingCount = new Map<string, number>();

  for (const flow of flows) {
    outgoing.set(flow.from, [...(outgoing.get(flow.from) ?? []), flow]);
    incomingCount.set(flow.to, (incomingCount.get(flow.to) ?? 0) + 1);
  }

  const assignPathFrom = (nodeId: string, startLayer: number) => {
    let layer = startLayer;
    let current: string | null = nodeId;
    while (current) {
      const prev = layers.get(current);
      if (prev === undefined || prev < layer) {
        layers.set(current, layer);
      }
      layer += 1;
      const outs: LogicFlow[] = outgoing.get(current) ?? [];
      if (outs.length !== 1) break;
      current = outs[0]!.to;
    }
  };

  const start =
    elements.find((el) => el.type === 'startEvent') ??
    elements.find((el) => (incomingCount.get(el.id) ?? 0) === 0);
  if (!start) {
    elements.forEach((el, index) => layers.set(el.id, index));
    return layers;
  }

  let layer = 0;
  let current: string | null = start.id;
  while (current) {
    layers.set(current, layer);
    layer += 1;
    const outs: LogicFlow[] = outgoing.get(current) ?? [];
    if (outs.length === 0) break;
    if (outs.length > 1) {
      for (const flow of outs) {
        assignPathFrom(flow.to, layer);
      }
      break;
    }
    current = outs[0]!.to;
  }

  for (const el of elements) {
    if (!layers.has(el.id)) {
      layers.set(el.id, layer);
    }
  }

  return layers;
}

function collectSpineNodeIds(logic: ProcessLogic, flows: LogicFlow[]): Set<string> {
  const spine = new Set<string>();
  const outgoing = new Map<string, LogicFlow[]>();
  for (const flow of flows) {
    outgoing.set(flow.from, [...(outgoing.get(flow.from) ?? []), flow]);
  }

  const start = logic.elements.find((el) => el.type === 'startEvent');
  let current: string | null = start?.id ?? null;
  while (current) {
    spine.add(current);
    const outs = outgoing.get(current) ?? [];
    if (outs.length !== 1) break;
    current = outs[0]!.to;
  }
  return spine;
}

function propagateBranchCenterY(
  nodeId: string,
  y: number,
  centerY: Map<string, number>,
  flows: LogicFlow[],
  visited: Set<string>,
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  centerY.set(nodeId, y);
  for (const flow of flows.filter((f) => f.from === nodeId)) {
    propagateBranchCenterY(flow.to, y, centerY, flows, visited);
  }
}

function branchCenterY(
  gatewayCenterY: number,
  label: string | undefined,
  branchIndex: number,
  totalBranches: number,
): number {
  const normalized = (label ?? '').trim().toLowerCase();
  if (normalized === 'sim' || normalized === 'yes') return gatewayCenterY - BRANCH_OFFSET_Y;
  if (normalized === 'não' || normalized === 'nao' || normalized === 'no') return gatewayCenterY + BRANCH_OFFSET_Y;
  return gatewayCenterY + (branchIndex - (totalBranches - 1) / 2) * BRANCH_OFFSET_Y;
}

/** Espinha horizontal + ramos Sim/Não paralelos e alinhados. */
function assignElementCenterY(
  logic: ProcessLogic,
  flows: LogicFlow[],
  laneCenterY: number,
): Map<string, number> {
  const centerY = new Map<string, number>();
  const spine = collectSpineNodeIds(logic, flows);
  for (const id of spine) {
    centerY.set(id, laneCenterY);
  }

  const gatewayIds = new Set(
    logic.elements.filter((el) => el.type === 'exclusiveGateway').map((el) => el.id),
  );

  for (const gatewayId of gatewayIds) {
    const outgoing = flows.filter((f) => f.from === gatewayId);
    outgoing.forEach((flow, index) => {
      const branchY = branchCenterY(laneCenterY, flow.label, index, outgoing.length);
      propagateBranchCenterY(flow.to, branchY, centerY, flows, new Set());
    });
  }

  for (const el of logic.elements) {
    if (!centerY.has(el.id)) {
      centerY.set(el.id, laneCenterY);
    }
  }

  return centerY;
}

function hasGatewayBranches(logic: ProcessLogic, flows: LogicFlow[]): boolean {
  const gatewayIds = new Set(
    logic.elements.filter((el) => el.type === 'exclusiveGateway').map((el) => el.id),
  );
  return flows.some((f) => gatewayIds.has(f.from));
}

function hasBackEdges(layers: Map<string, number>, flows: LogicFlow[]): boolean {
  return flows.some((flow) => {
    const fromLayer = layers.get(flow.from) ?? 0;
    const toLayer = layers.get(flow.to) ?? 0;
    return toLayer < fromLayer;
  });
}

function buildBackEdgeWaypoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  positions: Map<string, { x: number; y: number; width: number; height: number }>,
): Array<{ x: number; y: number }> {
  const maxBottom = Math.max(
    ...Array.from(positions.values()).map((pos) => pos.y + pos.height),
  );
  const loopY = maxBottom + LOOP_ROUTE_OFFSET_Y;
  const dropX = x1 + 48;
  const approachX = Math.max(x2 - 24, START_X);

  return [
    { x: x1, y: y1 },
    { x: dropX, y: y1 },
    { x: dropX, y: loopY },
    { x: approachX, y: loopY },
    { x: approachX, y: y2 },
    { x: x2, y: y2 },
  ];
}

export function buildBpmnXmlFromLogic(logic: ProcessLogic): string {
  const flows = ensureGatewayFlowLabels(logic);
  const layers = calculateLayers(logic.elements, flows);
  const branching = hasGatewayBranches(logic, flows);
  const looping = hasBackEdges(layers, flows);
  const laneBlockHeight = looping
    ? LANE_HEIGHT_LOOP
    : branching
      ? LANE_HEIGHT_BRANCHING
      : LANE_HEIGHT;

  const laneYPositions = new Map<string, number>();
  logic.lanes.forEach((lane, index) => {
    laneYPositions.set(lane, START_Y + index * laneBlockHeight);
  });

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();

  logic.lanes.forEach((lane) => {
    const laneY = laneYPositions.get(lane) ?? START_Y;
    const laneCenterY = laneY + laneBlockHeight / 2;
    const laneElements = logic.elements.filter((el) => el.lane === lane);
    const centerYById = assignElementCenterY(
      { ...logic, elements: laneElements },
      flows.filter((f) => laneElements.some((el) => el.id === f.from || el.id === f.to)),
      laneCenterY,
    );

    for (const el of laneElements) {
      const layer = layers.get(el.id) || 0;
      const size = ELEMENT_SIZES[el.type];
      const centerY = centerYById.get(el.id) ?? laneCenterY;
      positions.set(el.id, {
        x: START_X + layer * LAYER_SPACING_X,
        y: Math.round(centerY - size.height / 2),
        width: size.width,
        height: size.height,
      });
    }
  });

  const maxLayer = Math.max(...Array.from(layers.values()), 0);
  const poolWidth = START_X + (maxLayer + 1) * LAYER_SPACING_X + 220;
  const poolHeight = logic.lanes.length * laneBlockHeight;

  const laneRefs = logic.lanes
    .map((lane, i) => {
      const laneId = `lane_${i}`;
      const elementsInLane = logic.elements.filter((el) => el.lane === lane);
      const refs = elementsInLane
        .map((el) => `<bpmn:flowNodeRef>${escapeXml(el.id)}</bpmn:flowNodeRef>`)
        .join('\n        ');
      return `      <bpmn:lane id="${laneId}" name="${escapeXml(lane)}">
        ${refs}
      </bpmn:lane>`;
    })
    .join('\n');

  const elementsXml = logic.elements
    .map((el) => {
      const tagMap: Record<LogicElement['type'], string> = {
        startEvent: 'startEvent',
        endEvent: 'endEvent',
        task: 'task',
        exclusiveGateway: 'exclusiveGateway',
      };
      const tag = tagMap[el.type];
      const displayName = normalizeElementName(el.type, el.name);
      return `    <bpmn:${tag} id="${escapeXml(el.id)}" name="${escapeXml(displayName)}" />`;
    })
    .join('\n');

  const flowsXml = flows
    .map((flow, i) => {
      const flowId = `flow_${i}`;
      const nameAttr = flow.label ? ` name="${escapeXml(flow.label)}"` : '';
      return `    <bpmn:sequenceFlow id="${flowId}"${nameAttr} sourceRef="${escapeXml(flow.from)}" targetRef="${escapeXml(flow.to)}" />`;
    })
    .join('\n');

  const shapesXml = logic.elements
    .map((el) => {
      const pos = positions.get(el.id)!;
      return `      <bpmndi:BPMNShape id="${escapeXml(el.id)}_di" bpmnElement="${escapeXml(el.id)}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" />
      </bpmndi:BPMNShape>`;
    })
    .join('\n');

  const edgesXml = flows
    .map((flow, i) => {
      const flowId = `flow_${i}`;
      const source = positions.get(flow.from)!;
      const target = positions.get(flow.to)!;

      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const x2 = target.x;
      const y2 = target.y + target.height / 2;

      const fromLayer = layers.get(flow.from) ?? 0;
      const toLayer = layers.get(flow.to) ?? 0;
      const isBackEdge = toLayer < fromLayer;

      let waypoints: Array<{ x: number; y: number }>;
      if (isBackEdge) {
        waypoints = buildBackEdgeWaypoints(x1, y1, x2, y2, positions);
      } else {
        waypoints = [{ x: x1, y: y1 }];
        const yDiff = Math.abs(y2 - y1);
        const xDiff = x2 - x1;

        if (yDiff > 8 && xDiff > 40) {
          const elbowX = x1 + Math.max(48, xDiff * 0.45);
          waypoints.push({ x: elbowX, y: y1 });
          waypoints.push({ x: elbowX, y: y2 });
        } else if (yDiff > 8) {
          const midY = Math.round((y1 + y2) / 2);
          waypoints.push({ x: x1, y: midY });
          waypoints.push({ x: x2, y: midY });
        }

        waypoints.push({ x: x2, y: y2 });
      }

      const waypointsXml = waypoints
        .map((wp) => `<di:waypoint x="${Math.round(wp.x)}" y="${Math.round(wp.y)}" />`)
        .join('\n        ');

      return `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">
        ${waypointsXml}
      </bpmndi:BPMNEdge>`;
    })
    .join('\n');

  const laneShapesXml = logic.lanes
    .map((lane, i) => {
      const laneId = `lane_${i}`;
      const laneY = laneYPositions.get(lane)!;
      return `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true">
        <dc:Bounds x="130" y="${laneY}" width="${poolWidth - 30}" height="${laneBlockHeight}" />
      </bpmndi:BPMNShape>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="pool1" name="${escapeXml(logic.processName)}" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
${laneRefs}
    </bpmn:laneSet>
${elementsXml}
${flowsXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="pool1_di" bpmnElement="pool1" isHorizontal="true">
        <dc:Bounds x="100" y="${START_Y}" width="${poolWidth}" height="${poolHeight}" />
      </bpmndi:BPMNShape>
${laneShapesXml}
${shapesXml}
${edgesXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
