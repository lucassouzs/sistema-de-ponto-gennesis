export type FlowNodeInput = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  laneId?: string | null;
};

export type FlowEdgeInput = {
  id: string;
  source: string;
  target: string;
  label?: string | null;
};

export type FlowLaneInput = {
  id: string;
  label: string;
  y: number;
  height: number;
  width?: number;
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
  nodes: FlowNodeInput[];
  edges: FlowEdgeInput[];
  lanes: FlowLaneInput[];
  reply: string;
  validationMeta?: FlowValidationMeta;
};
