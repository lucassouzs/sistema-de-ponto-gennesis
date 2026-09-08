import type { Node } from '@xyflow/react';

const PROCESS_RENAME_PATTERN =
  /renome|mude o t[íi]tulo|mude o nome|troque o nome|altere o (?:nome|t[íi]tulo)/i;

/** Usuário pediu explicitamente para renomear o processo. */
export function wantsProcessRename(userMessage: string): boolean {
  return PROCESS_RENAME_PATTERN.test(userMessage.trim());
}

/** Diagrama já tem elementos de processo (refinamento, não geração do zero). */
export function isFlowAiRefinement(nodes: Node[]): boolean {
  return nodes.some(
    (node) =>
      node.type &&
      node.type !== 'bpmnLane' &&
      node.type !== 'bpmnPool' &&
      node.type !== 'bpmnText' &&
      !String(node.id).startsWith('ai-panel-'),
  );
}
