import type { Edge, Node } from '@xyflow/react';
import { copyFlowSelection, pasteFlowClipboard } from '../flowClipboard';

const lane: Node = {
  id: 'lane-1',
  type: 'bpmnLane',
  position: { x: 100, y: 200 },
  data: { label: 'Dev' },
  style: { width: 800, height: 120 },
  selected: true,
};

const task: Node = {
  id: 'task-1',
  type: 'bpmnTask',
  parentId: 'lane-1',
  position: { x: 120, y: 40 },
  data: { label: 'Implementar' },
  selected: false,
};

const start: Node = {
  id: 'start-1',
  type: 'bpmnStart',
  parentId: 'lane-1',
  position: { x: 40, y: 36 },
  data: { label: 'Início' },
  selected: false,
};

const edge: Edge = {
  id: 'edge-1',
  source: 'start-1',
  target: 'task-1',
  type: 'step',
};

describe('flowClipboard', () => {
  it('copia raia completa com filhos e conexões internas', () => {
    const payload = copyFlowSelection([lane, task, start], [edge]);
    expect(payload).not.toBeNull();
    expect(payload!.kind).toBe('lane');
    expect(payload!.nodes.map((node) => node.id).sort()).toEqual(['lane-1', 'start-1', 'task-1']);
    expect(payload!.edges).toHaveLength(1);
  });

  it('copia só elementos selecionados', () => {
    const payload = copyFlowSelection(
      [
        { ...lane, selected: false },
        { ...task, selected: true },
      ],
      [edge],
    );
    expect(payload).not.toBeNull();
    expect(payload!.kind).toBe('selection');
    expect(payload!.nodes).toHaveLength(1);
    expect(payload!.nodes[0]?.id).toBe('task-1');
  });

  it('cola raia abaixo da original com novos ids', () => {
    const payload = copyFlowSelection([lane, task, start], [edge]);
    const result = pasteFlowClipboard(payload!, [lane, task, start], [edge]);

    const pastedLane = result.nodes.find(
      (node) => node.type === 'bpmnLane' && node.id !== 'lane-1',
    );
    expect(pastedLane).toBeDefined();
    expect(pastedLane!.position.y).toBe(320);

    const pastedTasks = result.nodes.filter((node) => node.type === 'bpmnTask');
    expect(pastedTasks).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
  });
});
