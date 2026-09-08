import { flowAiService, resolveGeneratedFlowWithRetry } from '../src/services/FlowAiService';
import { buildProcessLogicFromDescription } from '../src/services/flowDescriptionToLogic';
import { buildProcessLogicFromNaturalLanguage } from '../src/services/flowNaturalLanguageParser';
import { parseProcessLogicRaw } from '../src/services/flowAiProcessLogic';
import { runValidatedLogicPipeline } from '../src/services/flowAiPipeline';
import { BPMN_AI_JSON_SYSTEM } from '../src/services/flowAiSystemPrompt';
import { validateProcessLogic } from '../src/services/flowLogicValidate';

const DESCRIPTION =
  'Cliente abre chamado, Atendente triagem, Especialista analisa, Desenvolvimento implementa, QA testa';

async function main() {
  console.log('=== DIAGNÓSTICO:', DESCRIPTION.slice(0, 60) + '... ===\n');

  console.log('1) Prompt carregado:', BPMN_AI_JSON_SYSTEM.includes('EXEMPLO 2') ? 'OK (few-shot)' : 'FALHA');
  console.log('   Tamanho prompt:', BPMN_AI_JSON_SYSTEM.length, 'chars\n');

  console.log('2) Parser NL (se sim/não):', buildProcessLogicFromNaturalLanguage(DESCRIPTION) ? 'parseou' : 'null');
  const fromDesc = buildProcessLogicFromDescription(DESCRIPTION);
  console.log('3) buildProcessLogicFromDescription:');
  if (fromDesc) {
    console.log('   lanes:', fromDesc.lanes);
    console.log('   elements:', fromDesc.elements.length, fromDesc.elements.map((e) => `${e.type}:${e.name}`));
  } else {
    console.log('   null');
  }

  const badLogic = parseProcessLogicRaw(
    JSON.stringify({
      processName: 'Processo',
      lanes: ['Participante'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Início', lane: 'Participante' },
        { id: 'end1', type: 'endEvent', name: 'Fim', lane: 'Participante' },
      ],
      flows: [{ from: 'start1', to: 'end1' }],
    }),
  );
  if (badLogic) {
    const pipeline = runValidatedLogicPipeline(badLogic, DESCRIPTION);
    console.log('\n4) Validação start+end apenas:');
    console.log('   valid:', pipeline.valid);
    console.log('   errors:', pipeline.validation.errors);
  }

  const mockGood = parseProcessLogicRaw(
    JSON.stringify({
      processName: 'Abertura de chamado',
      lanes: ['Cliente', 'Atendente', 'Especialista', 'Desenvolvimento', 'QA'],
      elements: [
        { id: 'start1', type: 'startEvent', name: 'Abrir chamado', lane: 'Cliente' },
        { id: 't1', type: 'task', name: 'Triagem', lane: 'Atendente' },
        { id: 't2', type: 'task', name: 'Análise técnica', lane: 'Especialista' },
        { id: 't3', type: 'task', name: 'Implementar', lane: 'Desenvolvimento' },
        { id: 't4', type: 'task', name: 'Testar', lane: 'QA' },
        { id: 'end1', type: 'endEvent', name: 'Encerrado', lane: 'Cliente' },
      ],
      flows: [
        { from: 'start1', to: 't1' },
        { from: 't1', to: 't2' },
        { from: 't2', to: 't3' },
        { from: 't3', to: 't4' },
        { from: 't4', to: 'end1' },
      ],
    }),
  );
  if (mockGood) {
    const pipeline = runValidatedLogicPipeline(mockGood, DESCRIPTION);
    console.log('\n5) Mock 5 raias após pipeline:');
    console.log('   valid:', pipeline.valid);
    console.log('   lanes:', pipeline.logic.lanes);
    console.log('   elements:', pipeline.logic.elements.length);
  }

  console.log('\n6) Fallback sem IA (aiText null):');
  const fallback = resolveGeneratedFlowWithRetry(DESCRIPTION, [null]);
  console.log('   name:', fallback.name);
  console.log('   xml length:', fallback.xml?.length ?? 0);
  console.log('   validationMeta:', JSON.stringify(fallback.validationMeta));
  console.log('   reply:', fallback.reply.slice(0, 200));

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  console.log('\n7) ANTHROPIC_API_KEY:', hasKey ? 'configurada' : 'AUSENTE — Claude nunca é chamado');

  if (hasKey) {
    console.log('\n8) Chamada real à API (pode demorar)...');
    const result = await flowAiService.generateFromDescription(DESCRIPTION);
    console.log('   validationMeta:', JSON.stringify(result.validationMeta));
    console.log('   reply:', result.reply.slice(0, 300));
    const laneMatch = result.xml?.match(/name="([^"]+)"[^>]*>\s*<bpmn:lane/g);
    console.log('   pool name snippet:', result.xml?.match(/participant[^>]*name="([^"]+)"/)?.[1]);
    const shapeCount = (result.xml?.match(/BPMNShape/g) ?? []).length;
    console.log('   BPMNShape count:', shapeCount);
  }
}

main().catch(console.error);
