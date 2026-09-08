import { buildProcessLogicFromActorCommaList, parseActorCommaSteps } from '../flowNaturalLanguageParser';

const DESCRIPTION =
  'Cliente abre chamado, Atendente triagem, Especialista analisa, Desenvolvimento implementa, QA testa';

describe('parseActorCommaSteps', () => {
  it('interpreta lista papel+ação separada por vírgulas', () => {
    const steps = parseActorCommaSteps(DESCRIPTION);
    expect(steps).not.toBeNull();
    expect(steps).toHaveLength(5);
    expect(steps?.map((step) => step.actor)).toEqual([
      'Cliente',
      'Atendente',
      'Especialista',
      'Desenvolvimento',
      'QA',
    ]);
  });

  it('gera 5 raias e passos encadeados', () => {
    const logic = buildProcessLogicFromActorCommaList(DESCRIPTION);
    expect(logic).not.toBeNull();
    expect(logic!.lanes).toHaveLength(5);
    expect(logic!.elements.filter((el) => el.type === 'task')).toHaveLength(4);
    expect(logic!.elements.find((el) => el.id === 'start1')?.lane).toBe('Cliente');
    expect(logic!.elements.find((el) => el.id === 't4')?.lane).toBe('QA');
  });
});
