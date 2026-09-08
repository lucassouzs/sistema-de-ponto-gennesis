import type { AnchorSide } from './flowEdgeRouting';

/** Losango BPMN — caixa 56×56; pontas nos centros de cada lado. */
export const GATEWAY_DIAMOND_SIZE = 56;

/** Marcador BPMN 2.0 para Exclusive Gateway (cruz), não interrogação. */
export const EXCLUSIVE_GATEWAY_MARKER = '×';

/** Quadrado interno girado 45° para as pontas encostarem na borda da caixa. */
export const GATEWAY_INNER_SIZE = GATEWAY_DIAMOND_SIZE / Math.SQRT2;

export function isGatewayNodeType(type: string | undefined): boolean {
  return type === 'bpmnGateway' || type === 'bpmnParallelGateway';
}

/** Pontas do losango para um retângulo alinhado ao topo (x,y) com largura/altura do diamante. */
export function getGatewayDiamondAnchor(
  box: { x: number; y: number; width?: number; height?: number },
  side: AnchorSide,
): { x: number; y: number } {
  const width = box.width ?? GATEWAY_DIAMOND_SIZE;
  const height = box.height ?? GATEWAY_DIAMOND_SIZE;
  const cx = box.x + width / 2;
  const cy = box.y + height / 2;

  switch (side) {
    case 'top':
      return { x: cx, y: box.y };
    case 'bottom':
      return { x: cx, y: box.y + height };
    case 'left':
      return { x: box.x, y: cy };
    case 'right':
      return { x: box.x + width, y: cy };
    default:
      return { x: cx, y: cy };
  }
}
