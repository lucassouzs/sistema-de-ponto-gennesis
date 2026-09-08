import type { ProcessLogic } from './bpmnLayoutEngine';

/** Nomes que indicam fase/etapa do processo — nunca devem ser raia. */
const PHASE_LANE_PATTERN =
  /^(?:fase\s*\d+|etapa\s*\d+|\d+\s*ª?\s*fase|\d+\s*ª?\s*etapa|abertura|triagem|conclus(?:ão|ao)|finaliza(?:ção|ao)|encerramento)$/i;

const PHASE_LANE_PARTIAL =
  /\b(fase\s*\d+|etapa\s*\d+|\d+\s*ª?\s*fase|\d+\s*ª?\s*etapa)\b/i;

/** Papéis/setores reconhecidos como executores legítimos de raia. */
export const ACTOR_LANE_PATTERN =
  /\b(cliente|atendente|especialista|desenvolvimento|desenvolvedor|dev|qa|qualidade|testes|analista|solicitante|aprovador|gestor|colaborador|rh|ti|dp|suporte|operador|fornecedor|compras|financeiro|engenharia|auditoria|fiscal|logística|logistica|suprimentos|backoffice|product\s*owner|po|scrum\s*master|arquiteto|designer|ux|negócio|comercial|vendas|marketing|jurídico|juridico|legal)\b/i;

export function isPhaseLikeLaneName(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  if (PHASE_LANE_PATTERN.test(clean)) return true;
  if (PHASE_LANE_PARTIAL.test(clean) && clean.length <= 24) return true;
  return false;
}

export function isActorLikeLaneName(name: string): boolean {
  const clean = name.trim();
  if (!clean || isPhaseLikeLaneName(clean)) return false;
  if (clean.length > 48 || clean.length < 2) return false;
  if (/^\d+$/.test(clean)) return false;
  if (ACTOR_LANE_PATTERN.test(clean)) return true;
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)*$/.test(clean)) {
    return true;
  }
  return false;
}

export function lanesMatchElements(logic: ProcessLogic): boolean {
  const laneSet = new Set(logic.lanes);
  if (logic.elements.length === 0) return true;
  return logic.elements.every((el) => laneSet.has(el.lane));
}

/** Raias da IA parecem papéis reais (não fases) e estão em uso. */
export function aiLanesAreCoherent(logic: ProcessLogic): boolean {
  if (logic.lanes.length < 2) return false;
  if (logic.lanes.some((name) => isPhaseLikeLaneName(name))) return false;
  if (!logic.lanes.every((name) => isActorLikeLaneName(name))) return false;

  const laneSet = new Set(logic.lanes);
  const usedLanes = new Set(
    logic.elements.map((el) => el.lane).filter((lane) => laneSet.has(lane)),
  );
  return usedLanes.size >= 2;
}

export type LaneStrategy =
  | { mode: 'keep_ai_lanes' }
  | { mode: 'collapse_to_single'; primaryLane: string }
  | { mode: 'merge_phase_lanes_to_tasks'; primaryLane: string };

function collectLaneNames(logic: ProcessLogic): string[] {
  if (logic.lanes.length > 0) return [...logic.lanes];
  return Array.from(new Set(logic.elements.map((el) => el.lane).filter(Boolean)));
}

function truncate(label: string, max: number): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

/**
 * Decide se mantém raias da IA, colapsa para uma, ou move fases para nome de tarefa.
 * Importado por flowAiLogicNormalize — descriptionImpliesMultipleLanes é critério secundário.
 */
export function resolveLaneStrategy(
  description: string,
  logic: ProcessLogic,
  descriptionImpliesMultipleLanes: (text: string) => boolean,
): LaneStrategy {
  const laneNames = collectLaneNames(logic);
  const logicWithLanes = { ...logic, lanes: laneNames };

  if (aiLanesAreCoherent(logicWithLanes)) {
    return { mode: 'keep_ai_lanes' };
  }

  const nonPhaseLanes = laneNames.filter((name) => !isPhaseLikeLaneName(name));
  if (
    nonPhaseLanes.length >= 2 &&
    nonPhaseLanes.every((name) => isActorLikeLaneName(name))
  ) {
    return { mode: 'keep_ai_lanes' };
  }

  const allPhase =
    laneNames.length >= 2 && laneNames.every((name) => isPhaseLikeLaneName(name));
  if (allPhase) {
    return {
      mode: 'merge_phase_lanes_to_tasks',
      primaryLane: truncate(logic.processName || 'Processo', 48),
    };
  }

  if (descriptionImpliesMultipleLanes(description) && laneNames.length >= 2) {
    return { mode: 'keep_ai_lanes' };
  }

  if (laneNames.length >= 2 && nonPhaseLanes.filter(isActorLikeLaneName).length >= 2) {
    return { mode: 'keep_ai_lanes' };
  }

  if (laneNames.length === 1) {
    return {
      mode: 'collapse_to_single',
      primaryLane: truncate(laneNames[0] || logic.processName || 'Processo', 48),
    };
  }

  return {
    mode: 'collapse_to_single',
    primaryLane: truncate(logic.processName || laneNames[0] || 'Processo', 48),
  };
}

export function applyLaneStrategy(
  logic: ProcessLogic,
  strategy: LaneStrategy,
): ProcessLogic {
  let { lanes, elements } = logic;

  switch (strategy.mode) {
    case 'keep_ai_lanes': {
      const laneNames = collectLaneNames(logic);
      lanes = laneNames;
      const laneSet = new Set(lanes);
      const fallbackLane = lanes[0] ?? 'Processo';
      elements = elements.map((el) => ({
        ...el,
        lane: laneSet.has(el.lane) ? el.lane : fallbackLane,
      }));
      break;
    }
    case 'merge_phase_lanes_to_tasks': {
      const primaryLane = strategy.primaryLane;
      lanes = [primaryLane];
      elements = elements.map((el) => {
        const phase = el.lane?.trim();
        const shouldPrefix =
          phase &&
          isPhaseLikeLaneName(phase) &&
          (el.type === 'task' || el.type === 'exclusiveGateway');
        return {
          ...el,
          lane: primaryLane,
          name: shouldPrefix ? `${truncate(phase, 20)}: ${el.name}` : el.name,
        };
      });
      break;
    }
    case 'collapse_to_single': {
      const primaryLane = strategy.primaryLane;
      lanes = [primaryLane];
      elements = elements.map((el) => ({ ...el, lane: primaryLane }));
      break;
    }
  }

  return { ...logic, lanes, elements };
}
