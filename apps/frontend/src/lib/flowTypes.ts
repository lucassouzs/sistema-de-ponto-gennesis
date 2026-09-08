export type BpmnNodeType =
  | 'bpmnStart'
  | 'bpmnEnd'
  | 'bpmnTask'
  | 'bpmnGateway'
  | 'bpmnParallelGateway'
  | 'bpmnDocument'
  | 'bpmnData'
  | 'bpmnText'
  | 'bpmnLane'
  | 'bpmnPool';

export type FlowDiagramSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FlowDiagram = FlowDiagramSummary & {
  nodes: unknown;
  edges: unknown;
  viewport: unknown | null;
};

export type FlowAiNode = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  laneId?: string | null;
};

export type FlowAiEdge = {
  id: string;
  source: string;
  target: string;
  label?: string | null;
};

export type FlowAiLane = {
  id: string;
  label: string;
  y: number;
  height: number;
};

export type FlowValidationMeta = {
  retried?: boolean;
  autoFixed?: boolean;
  usedFallback?: boolean;
  attemptCount?: number;
  userNotices?: string[];
};

export type FlowAiResult = {
  name: string;
  description?: string;
  xml?: string;
  nodes: FlowAiNode[];
  edges: FlowAiEdge[];
  lanes: FlowAiLane[];
  reply: string;
  validationMeta?: FlowValidationMeta;
};

export type FlowShapeDef = {
  type: BpmnNodeType;
  label: string;
  description: string;
};

export const FLOW_SHAPE_CATALOG: FlowShapeDef[] = [
  { type: 'bpmnStart', label: 'Início', description: 'Evento de início' },
  { type: 'bpmnEnd', label: 'Fim', description: 'Evento de fim' },
  { type: 'bpmnTask', label: 'Tarefa', description: 'Atividade do processo' },
  { type: 'bpmnGateway', label: 'Decisão', description: 'Gateway exclusivo' },
  { type: 'bpmnParallelGateway', label: 'Paralelo', description: 'Gateway paralelo' },
  { type: 'bpmnDocument', label: 'Documento', description: 'Documento ou formulário' },
  { type: 'bpmnData', label: 'Dados', description: 'Entrada ou saída de dados' },
  { type: 'bpmnText', label: 'Texto', description: 'Rótulo ou anotação livre' },
  { type: 'bpmnLane', label: 'Raia', description: 'Swimlane / setor' },
];
