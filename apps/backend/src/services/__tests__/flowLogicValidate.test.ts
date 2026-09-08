import type { ProcessLogic } from '../bpmnLayoutEngine';
import {
  applyOrphanEndEventFixes,
  extractLoopExpectations,
  validateProcessLogic,
} from '../flowLogicValidate';
import { runValidatedLogicPipeline } from '../flowAiPipeline';

const CHAMADO_DESCRIPTION =
  'Cliente abre chamado, Atendente triagem, Especialista analisa, Desenvolvimento implementa, QA testa';

describe('flowLogicValidate', () => {
  it('detecta loop esperado no texto', () => {
    const expectations = extractLoopExpectations(
      'QA testa e se reprova volta para Desenvolvimento corrigir',
    );
    expect(expectations.length).toBeGreaterThan(0);
    expect(expectations[0]?.targetPhrase.toLowerCase()).toContain('desenvolvimento');
  });

  it('erro quando gateway tem uma saída só', () => {
    const logic: ProcessLogic = {
      processName: 'Teste',
      lanes: ['Processo'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Início', lane: 'Processo' },
        { id: 'g1', type: 'exclusiveGateway', name: 'Decisão?', lane: 'Processo' },
        { id: 'end1', type: 'endEvent', name: 'Fim', lane: 'Processo' },
      ],
      flows: [
        { from: 'start1', to: 'g1' },
        { from: 'g1', to: 'end1', label: 'Sim' },
      ],
    };

    const result = validateProcessLogic(logic, '');
    expect(result.errors.some((line) => line.includes('2 saídas'))).toBe(true);
  });

  it('adiciona fim automático com mensagem ao usuário', () => {
    const logic: ProcessLogic = {
      processName: 'Teste',
      lanes: ['Processo'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Início', lane: 'Processo' },
        { id: 't1', type: 'task', name: 'Executar', lane: 'Processo' },
      ],
      flows: [{ from: 'start1', to: 't1' }],
    };

    const { userMessages, logic: fixed } = applyOrphanEndEventFixes(logic);
    expect(userMessages[0]).toContain('Executar');
    expect(fixed.flows.some((flow) => flow.from === 't1')).toBe(true);
  });

  it('validação bloqueia diagrama só com início e fim', () => {
    const logic: ProcessLogic = {
      processName: 'Teste',
      lanes: ['Participante'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Início', lane: 'Participante' },
        { id: 'end1', type: 'endEvent', name: 'Fim', lane: 'Participante' },
      ],
      flows: [{ from: 'start1', to: 'end1' }],
    };

    const result = validateProcessLogic(logic, CHAMADO_DESCRIPTION);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('pipeline limpa tarefa órfã após auto-fix de fim', () => {
    const logic: ProcessLogic = {
      processName: 'Teste',
      lanes: ['Processo'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Início', lane: 'Processo' },
        { id: 't1', type: 'task', name: 'Executar', lane: 'Processo' },
      ],
      flows: [{ from: 'start1', to: 't1' }],
    };

    const pipeline = runValidatedLogicPipeline(logic, '');
    expect(pipeline.valid).toBe(true);
    expect(pipeline.meta.userNotices?.some((line) => line.includes('Executar'))).toBe(true);
  });
});
