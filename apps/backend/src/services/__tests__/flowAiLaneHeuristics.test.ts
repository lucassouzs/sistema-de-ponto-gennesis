import type { ProcessLogic } from '../bpmnLayoutEngine';
import {
  aiLanesAreCoherent,
  applyLaneStrategy,
  isPhaseLikeLaneName,
  resolveLaneStrategy,
} from '../flowAiLaneHeuristics';
import { normalizeProcessLogic, descriptionImpliesMultipleLanes } from '../flowAiLogicNormalize';

describe('flowAiLaneHeuristics', () => {
  const multiActorLogic: ProcessLogic = {
    processName: 'Abertura de chamado',
    lanes: ['Cliente', 'Atendente', 'Desenvolvimento', 'QA'],
    elements: [
      { id: 'start1', type: 'startEvent', name: 'Abrir chamado', lane: 'Cliente' },
      { id: 't1', type: 'task', name: 'Triagem', lane: 'Atendente' },
      { id: 't2', type: 'task', name: 'Implementar', lane: 'Desenvolvimento' },
      { id: 't3', type: 'task', name: 'Testar', lane: 'QA' },
      { id: 'end1', type: 'endEvent', name: 'Encerrado', lane: 'Cliente' },
    ],
    flows: [
      { from: 'start1', to: 't1' },
      { from: 't1', to: 't2' },
      { from: 't2', to: 't3' },
      { from: 't3', to: 'end1' },
    ],
  };

  it('preserva raias coerentes da IA mesmo sem RH/TI na descrição', () => {
    expect(aiLanesAreCoherent(multiActorLogic)).toBe(true);

    const strategy = resolveLaneStrategy(
      'Cliente abre chamado, atendente triagem, dev implementa, QA testa',
      multiActorLogic,
      descriptionImpliesMultipleLanes,
    );
    expect(strategy.mode).toBe('keep_ai_lanes');

    const normalized = normalizeProcessLogic(multiActorLogic, 'fluxo de chamado simples');
    expect(normalized.lanes).toEqual(['Cliente', 'Atendente', 'Desenvolvimento', 'QA']);
    expect(normalized.elements.find((el) => el.id === 't2')?.lane).toBe('Desenvolvimento');
  });

  it('colapsa raias phase-like e prefixa tarefas', () => {
    const phaseLogic: ProcessLogic = {
      processName: 'Processo X',
      lanes: ['Fase 1', 'Fase 2'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Início', lane: 'Fase 1' },
        { id: 't1', type: 'task', name: 'Validar', lane: 'Fase 1' },
        { id: 't2', type: 'task', name: 'Aprovar', lane: 'Fase 2' },
        { id: 'end1', type: 'endEvent', name: 'Fim', lane: 'Fase 2' },
      ],
      flows: [
        { from: 'start1', to: 't1' },
        { from: 't1', to: 't2' },
        { from: 't2', to: 'end1' },
      ],
    };

    expect(isPhaseLikeLaneName('Fase 1')).toBe(true);
    const strategy = resolveLaneStrategy('', phaseLogic, descriptionImpliesMultipleLanes);
    expect(strategy.mode).toBe('merge_phase_lanes_to_tasks');

    const normalized = normalizeProcessLogic(phaseLogic, '');
    expect(normalized.lanes).toHaveLength(1);
    expect(normalized.elements.find((el) => el.id === 't1')?.name).toContain('Fase 1');
  });

  it('colapsa para uma raia quando IA mandou uma só', () => {
    const single: ProcessLogic = {
      processName: 'Rotina',
      lanes: ['Rotina'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Acordar', lane: 'Rotina' },
        { id: 'end1', type: 'endEvent', name: 'Fim', lane: 'Rotina' },
      ],
      flows: [{ from: 'start1', to: 'end1' }],
    };

    const normalized = normalizeProcessLogic(single, 'acordar e terminar');
    expect(normalized.lanes).toHaveLength(1);
    expect(normalized.lanes[0]).toBe('Rotina');
  });

  it('applyLaneStrategy mantém lanes distintas', () => {
    const applied = applyLaneStrategy(multiActorLogic, { mode: 'keep_ai_lanes' });
    expect(applied.lanes).toHaveLength(4);
  });
});
