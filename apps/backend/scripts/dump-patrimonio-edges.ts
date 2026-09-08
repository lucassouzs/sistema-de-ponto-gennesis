import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type FlowNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  parentId?: string;
  data?: { label?: string };
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: { label?: string; routePoints?: Array<{ x: number; y: number }> };
};

function absPosition(node: FlowNode, nodeMap: Map<string, FlowNode>): { x: number; y: number } {
  let x = node.position?.x ?? 0;
  let y = node.position?.y ?? 0;
  let current: FlowNode | undefined = node;
  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += parent.position?.x ?? 0;
    y += parent.position?.y ?? 0;
    current = parent;
  }
  return { x, y };
}

async function main() {
  const diagram = await prisma.flowDiagram.findFirst({
    where: { name: { contains: 'PATRIMONIZ', mode: 'insensitive' } },
  });
  if (!diagram) {
    console.log('Diagram not found');
    return;
  }

  const nodes = diagram.nodes as FlowNode[];
  const edges = diagram.edges as FlowEdge[];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      console.log('INVALID EDGE', edge.id, edge.source, edge.target);
    }
    if (edge.id.includes('preview')) {
      console.log('PREVIEW EDGE', edge.id);
    }
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    const rp = edge.data?.routePoints;
    console.log({
      id: edge.id,
      label: edge.label ?? edge.data?.label,
      sourceLabel: source?.data?.label,
      targetLabel: target?.data?.label,
      sourceAbs: source ? absPosition(source, nodeMap) : null,
      targetAbs: target ? absPosition(target, nodeMap) : null,
      routePointCount: rp?.length ?? 0,
      routePoints: rp,
      handles: { source: edge.sourceHandle, target: edge.targetHandle },
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
