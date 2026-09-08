/**
 * Remove labelPosition salvo (sobreposto ao rótulo do gateway) e normaliza labelOffset.
 * Uso: npx tsx scripts/repair-patrimonio-labels.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DIAGRAM_ID = 'cmr2dl84i000179i09ymoccls';
const GATEWAY_ID = 'Id_080e3f4b-3cdb-4f76-a7e1-c1c275738015';

type FlowNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  parentId?: string;
  data?: { label?: string; labelOffset?: { x: number; y: number } };
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: Record<string, unknown> & { label?: string; labelPosition?: { x: number; y: number } };
};

function inspectOrphans(nodes: FlowNode[], edges: FlowEdge[]) {
  const incomingByTarget = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target, list);
  }
  const orphanEnds = nodes.filter(
    (n) => n.type === 'bpmnEnd' && !(incomingByTarget.get(n.id)?.length),
  );
  console.log(
    'Elementos órfãos:',
    orphanEnds.map((n) => ({
      id: n.id,
      type: 'bpmn:EndEvent',
      label: n.data?.label,
      x: n.position?.x,
      y: n.position?.y,
    })),
  );
}

async function main() {
  const diagram = await prisma.flowDiagram.findUnique({ where: { id: DIAGRAM_ID } });
  if (!diagram) {
    console.error('Diagrama não encontrado:', DIAGRAM_ID);
    process.exit(1);
  }

  let nodes = diagram.nodes as FlowNode[];
  let edges = diagram.edges as FlowEdge[];

  console.log('=== ANTES ===');
  inspectOrphans(nodes, edges);
  const devolvido = edges.find((e) => String(e.label ?? e.data?.label ?? '').toLowerCase().includes('devolv'));
  console.log('Devolvido labelPosition:', devolvido?.data?.labelPosition);
  console.log('Gateway labelOffset:', nodes.find((n) => n.id === GATEWAY_ID)?.data?.labelOffset);

  // Rótulos de conexão do gateway: remover labelPosition para o React Flow recalcular no caminho
  edges = edges.map((edge) => {
    if (edge.source !== GATEWAY_ID) return edge;
    const label = String(edge.label ?? edge.data?.label ?? '').trim();
    if (!label) return edge;
    const data = { ...(edge.data ?? {}) };
    delete data.labelPosition;
    return { ...edge, label, data: { ...data, label } };
  });

  // Rótulo externo do gateway: zerar offset exagerado que empurrou o texto sobre "Devolvido"
  nodes = nodes.map((node) => {
    if (node.id !== GATEWAY_ID) return node;
    return {
      ...node,
      data: { ...(node.data ?? {}), labelOffset: { x: 0, y: 0 } },
    };
  });

  console.log('=== DEPOIS ===');
  inspectOrphans(nodes, edges);
  const devolvidoAfter = edges.find((e) => String(e.label ?? e.data?.label ?? '').toLowerCase().includes('devolv'));
  console.log('Devolvido labelPosition:', devolvidoAfter?.data?.labelPosition ?? '(removido — usa posição padrão da aresta)');
  console.log('Gateway labelOffset:', nodes.find((n) => n.id === GATEWAY_ID)?.data?.labelOffset);

  await prisma.flowDiagram.update({
    where: { id: DIAGRAM_ID },
    data: { nodes: nodes as object[], edges: edges as object[] },
  });

  console.log('Diagrama reparado e salvo.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
