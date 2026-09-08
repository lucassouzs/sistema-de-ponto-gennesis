/**
 * Ferramenta de mão — equivalente ao diagram-js HandTool
 * (bpmn-js importa via `diagram-js/lib/features/hand-tool`, palette hand-tool).
 *
 * O canvas do Flow usa React Flow; o modo hand é aplicado com panOnDrag e
 * desabilitando drag/seleção de nós, reproduzindo activateHand() / toggle().
 */

/** Mesmo cursor do diagram-js HandTool (HAND_CURSOR = 'grab'). */
export const FLOW_HAND_CURSOR = 'grab';

export type FlowCanvasMode = 'selection' | 'hand';

export const FLOW_HAND_TOOL_SHORTCUT = 'h';

export function isFlowEditorTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function isHandToolShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.toLowerCase() === FLOW_HAND_TOOL_SHORTCUT;
}

/** Botão esquerdo — pan no React Flow; cliques passam pelo canvas (pointer-events). */
export const FLOW_HAND_PAN_BUTTONS = [0] as const;
