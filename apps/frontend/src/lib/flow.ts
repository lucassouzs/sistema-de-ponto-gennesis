import api from './api';
import type { FlowDiagram, FlowDiagramSummary } from './flowTypes';

export async function fetchFlowDiagrams(): Promise<FlowDiagramSummary[]> {
  const res = await api.get('/flow/diagrams');
  return res.data.data;
}

export async function fetchFlowDiagram(id: string): Promise<FlowDiagram> {
  const res = await api.get(`/flow/diagrams/${id}`);
  return res.data.data;
}

export async function createFlowDiagram(payload: { name?: string; description?: string }): Promise<FlowDiagram> {
  const res = await api.post('/flow/diagrams', payload);
  return res.data.data;
}

export async function updateFlowDiagram(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    nodes?: unknown;
    edges?: unknown;
    viewport?: unknown;
  },
): Promise<FlowDiagram> {
  const res = await api.patch(`/flow/diagrams/${id}`, payload);
  return res.data.data;
}

export async function deleteFlowDiagram(id: string): Promise<void> {
  await api.delete(`/flow/diagrams/${id}`);
}
