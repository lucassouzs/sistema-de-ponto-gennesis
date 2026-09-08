import {
  buildProcessLogicFromLoopGateway,
  parseActorCommaSteps,
  tryParseLoopGatewayFlow,
} from '../flowNaturalLanguageParser';
import { extractLoopExpectations, validateProcessLogic } from '../flowLogicValidate';

const LOOP_DESCRIPTION =
  'Dev implementa, QA testa; se reprova volta para Desenvolvimento corrigir; se aprova encerra';

describe('flowLoopGateway', () => {
  it('parseActorCommaSteps não engole cláusulas de loop', () => {
    expect(parseActorCommaSteps(LOOP_DESCRIPTION)).toBeNull();
  });

  it('tryParseLoopGatewayFlow extrai passos e retorno', () => {
    const parsed = tryParseLoopGatewayFlow(LOOP_DESCRIPTION);
    expect(parsed).not.toBeNull();
    expect(parsed!.steps).toEqual([
      { actor: 'Desenvolvimento', action: 'Implementa' },
      { actor: 'QA', action: 'Testa' },
    ]);
    expect(parsed!.returnTargetPhrase.toLowerCase()).toContain('desenvolvimento');
  });

  it('fallback determinístico gera gateway e back-edge', () => {
    const logic = buildProcessLogicFromLoopGateway(LOOP_DESCRIPTION);
    expect(logic).not.toBeNull();

    const gateways = logic!.elements.filter((el) => el.type === 'exclusiveGateway');
    expect(gateways.length).toBe(1);

    const qaTask = logic!.elements.find((el) => el.name === 'Testa');
    expect(qaTask?.name).toBe('Testa');
    expect(qaTask?.name).not.toContain(';');

    const devTarget = logic!.elements.find(
      (el) =>
        (el.type === 'startEvent' || el.type === 'task') &&
        /desenvolvimento/i.test(el.lane),
    );
    expect(devTarget).toBeDefined();

    const returnFlow = logic!.flows.find(
      (flow) =>
        flow.from === 'g1' &&
        flow.to === devTarget!.id &&
        flow.label?.toLowerCase().includes('reprov'),
    );
    expect(returnFlow).toBeDefined();

    const validation = validateProcessLogic(logic!, LOOP_DESCRIPTION);
    expect(validation.errors).toEqual([]);
  });

  it('validação falha diagrama sem gateway para texto de loop', () => {
    const badLogic = {
      processName: 'Ciclo',
      lanes: ['Desenvolvimento', 'QA'],
      elements: [
        { id: 'start1', type: 'startEvent' as const, name: 'Implementa', lane: 'Desenvolvimento' },
        {
          id: 't1',
          type: 'task' as const,
          name: 'Testa; se reprova volta para Desenvolvimento corrigir; se aprova encerra',
          lane: 'QA',
        },
        { id: 'end1', type: 'endEvent' as const, name: 'Fim', lane: 'QA' },
      ],
      flows: [
        { from: 'start1', to: 't1' },
        { from: 't1', to: 'end1' },
      ],
    };

    const validation = validateProcessLogic(badLogic, LOOP_DESCRIPTION);
    expect(validation.errors.some((e) => e.includes('gateway'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('texto bruto'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('retorno'))).toBe(true);
  });

  it('extractLoopExpectations detecta volta para Desenvolvimento', () => {
    const expectations = extractLoopExpectations(LOOP_DESCRIPTION);
    expect(expectations.length).toBeGreaterThan(0);
    expect(expectations[0]?.targetPhrase.toLowerCase()).toContain('desenvolvimento');
  });
});
