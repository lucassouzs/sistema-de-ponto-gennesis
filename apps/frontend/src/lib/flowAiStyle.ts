import type { BpmnNodeType } from './flowTypes';

/** Cores padrão do diagrama gerado pela IA (estilo Bizagi) */
export function getAiNodeStyle(type: string): { fillColor?: string; accentColor?: string } {
  switch (type as BpmnNodeType) {
    case 'bpmnTask':
    case 'bpmnDocument':
    case 'bpmnData':
      return { fillColor: '#ffffff', accentColor: '#2563eb' };
    case 'bpmnGateway':
    case 'bpmnParallelGateway':
      return { fillColor: '#fff1f2', accentColor: '#ec4899' };
    case 'bpmnStart':
    case 'bpmnEnd':
      return { fillColor: '#ffffff', accentColor: '#2563eb' };
    default:
      return {};
  }
}

export const AI_LANE_WIDTH = 2800;
export const AI_HEADER_HEIGHT = 48;
