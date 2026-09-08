import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type FlowNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  parentId?: string;
  data?: { label?: string; labelOffset?: { x: number; y: number } };
  style?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: { label?: string; labelPosition?: { x: number; y: number } };
};

const GATEWAY_DIAMOND_SIZE = 56;

function absPosition(node: FlowNode, nodeMap: Map<string, FlowNode>): { x: number; y: number } {
  let x = node.position?.x ?? 0;
  let y = node.position?.y ?? 0;
  let current = node;
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += parent.position?.x ?? 0;
    y += parent.position?.y ?? 0;
    current = parent;
  }
  return { x, y };
}

function gatewayLabelCenter(node: FlowNode, nodeMap: Map<string, FlowNode>): { x: number; y: number } {
  const abs = absPosition(node, nodeMap);
  const measured = (node as { measured?: { width?: number; height?: number } }).measured;
  const width = measured?.width ?? 220;
  const offset = node.data?.labelOffset ?? { x: 0, y: 0 };
  const labelH = 26;
  return {
    x: abs.x + width / 2 + offset.x,
    y: abs.y + GATEWAY_DIAMOND_SIZE + 4 + labelH / 2 + offset.y,
  };
}

async function main() {
  const diagrams = await prisma.flowDiagram.findMany({
    where: { name: { contains: 'PATRIMONIZ', mode: 'insensitive' } },
    select: { id: true, name: true, nodes: true, edges: true, updatedAt: true },
  });

  console.log(
    'Diagramas encontrados:',
    diagrams.map((d) => ({ id: d.id, name: d.name, updatedAt: d.updatedAt })),
  );

  if (!diagrams.length) {
    console.log('Nenhum diagrama PATRIMONIZAÇÃO encontrado.');
    return;
  }

  const diagram = diagrams[0]!;
  const nodes = diagram.nodes as FlowNode[];
  const edges = diagram.edges as FlowEdge[];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  console.log('Diagrama analisado:', diagram.name, '(id:', diagram.id + ')');
  console.log('Total nodes:', nodes.length, 'edges:', edges.length);

  const endEvents = nodes.filter((n) => n.type === 'bpmnEnd');
  const incomingByTarget = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target, list);
  }

  const orphanEnds = endEvents.filter((n) => !(incomingByTarget.get(n.id)?.length));

  console.log(
    'Elementos órfãos:',
    orphanEnds.map((n) => ({
      id: n.id,
      type: 'bpmn:EndEvent',
      label: n.data?.label,
      x: n.position?.x,
      y: n.position?.y,
      parentId: n.parentId,
      incoming: incomingByTarget.get(n.id)?.length ?? 0,
    })),
  );

  const adminLane = nodes.find(
    (n) =>
      n.type === 'bpmnLane' &&
      String(n.data?.label ?? '')
        .toLowerCase()
        .includes('administr'),
  );

  console.log(
    'Raia Administrativo:',
    adminLane
      ? {
          id: adminLane.id,
          label: adminLane.data?.label,
          x: adminLane.position?.x,
          y: adminLane.position?.y,
          height: adminLane.style?.height ?? adminLane.height,
        }
      : null,
  );

  const orphanNearAdmin = orphanEnds.filter((n) => {
    if (!adminLane) return true;
    const laneY = adminLane.position?.y ?? 0;
    const laneH = adminLane.style?.height ?? adminLane.height ?? 200;
    const ny = n.position?.y ?? 0;
    return ny >= laneY - 20 && ny <= laneY + laneH + 20;
  });

  console.log(
    'EndEvents órfãos próximos à raia Administrativo:',
    orphanNearAdmin.map((n) => ({
      id: n.id,
      label: n.data?.label,
      x: n.position?.x,
      y: n.position?.y,
    })),
  );

  const gateway = nodes.find(
    (n) =>
      (n.type === 'bpmnGateway' || n.type === 'bpmnParallelGateway') &&
      String(n.data?.label ?? '')
        .toLowerCase()
        .includes('substitu'),
  );

  if (gateway) {
    const abs = absPosition(gateway, nodeMap);
    const labelCenter = gatewayLabelCenter(gateway, nodeMap);
    const lane = gateway.parentId ? nodeMap.get(gateway.parentId) : null;
    console.log('Gateway "Produto será substituído ou devolvido?":', {
      id: gateway.id,
      positionRelativa: { x: gateway.position?.x, y: gateway.position?.y },
      positionAbsoluta: abs,
      parentLane: lane?.data?.label ?? gateway.parentId,
      label: gateway.data?.label,
      labelOffset: gateway.data?.labelOffset,
      labelCenterAbsoluto: labelCenter,
    });
  } else {
    console.log('Gateway "Produto será substituído ou devolvido?" não encontrado.');
  }

  const devolvidoEdge = edges.find((e) =>
    String(e.label ?? e.data?.label ?? '')
      .toLowerCase()
      .includes('devolv'),
  );

  if (devolvidoEdge) {
    const lp = devolvidoEdge.data?.labelPosition;
    console.log('Conexão "Devolvido":', {
      id: devolvidoEdge.id,
      source: devolvidoEdge.source,
      target: devolvidoEdge.target,
      label: devolvidoEdge.label ?? devolvidoEdge.data?.label,
      labelPosition: lp,
    });

    if (gateway && lp) {
      const abs = absPosition(gateway, nodeMap);
      const labelCenter = gatewayLabelCenter(gateway, nodeMap);
      console.log('Comparação coordenadas gateway vs label "Devolvido":', {
        gatewayFormaRelativa: { x: gateway.position?.x, y: gateway.position?.y },
        gatewayFormaAbsoluta: abs,
        gatewayLabelAbsoluto: labelCenter,
        labelDevolvidoAbsoluto: { x: lp.x, y: lp.y },
        mesmaPosicaoXY_formaRelativa: gateway.position?.x === lp.x && gateway.position?.y === lp.y,
        mesmaPosicaoXY_formaAbsoluta: abs.x === lp.x && abs.y === lp.y,
        mesmaPosicaoXY_labelGateway: labelCenter.x === lp.x && labelCenter.y === lp.y,
        distancia_formaRelativa: Math.hypot((gateway.position?.x ?? 0) - lp.x, (gateway.position?.y ?? 0) - lp.y),
        distancia_labelGateway: Math.hypot(labelCenter.x - lp.x, labelCenter.y - lp.y),
      });
    }
  } else {
    console.log('Conexão "Devolvido" não encontrada.');
  }

  console.log(
    'Todas as raias:',
    nodes
      .filter((n) => n.type === 'bpmnLane')
      .map((n) => ({ id: n.id, label: n.data?.label, x: n.position?.x, y: n.position?.y })),
  );

  const startNodes = nodes.filter((n) => n.type === 'bpmnStart');
  console.log('StartEvents:', startNodes.map((n) => ({ id: n.id, label: n.data?.label, x: n.position?.x, y: n.position?.y })));

  const endsNearStart = endEvents.filter((n) => {
    const ex = n.position?.x ?? 9999;
    const ey = n.position?.y ?? 9999;
    return ex < 400 && ey < 300;
  });
  console.log('EndEvents com x<400 e y<300 (proximo ao inicio):', endsNearStart);

  // Edges connected to gateway Devolvido
  if (gateway) {
    const gwEdges = edges.filter((e) => e.source === gateway.id || e.target === gateway.id);
    console.log('Conexoes do gateway substituicao/devolucao:', gwEdges.map((e) => ({
      id: e.id,
      label: e.label ?? e.data?.label,
      source: e.source,
      target: e.target,
      labelPosition: e.data?.labelPosition,
    })));
  }

  console.log(
    'Todos os EndEvents:',
    endEvents.map((n) => ({
      id: n.id,
      label: n.data?.label,
      x: n.position?.x,
      y: n.position?.y,
      incoming: (incomingByTarget.get(n.id) ?? []).map((e) => e.id),
    })),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
