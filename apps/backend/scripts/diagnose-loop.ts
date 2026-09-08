import 'dotenv/config';
import { parseProcessLogicRaw } from '../src/services/flowAiProcessLogic';
import { parseActorCommaSteps } from '../src/services/flowNaturalLanguageParser';
import { buildProcessLogicFromNaturalLanguage } from '../src/services/flowNaturalLanguageParser';
import { extractLoopExpectations, validateProcessLogic } from '../src/services/flowLogicValidate';
import { runValidatedLogicPipeline } from '../src/services/flowAiPipeline';
import { flowAiService } from '../src/services/FlowAiService';

const DESCRIPTION =
  'Dev implementa, QA testa; se reprova volta para Desenvolvimento corrigir; se aprova encerra';

async function main() {
  console.log('=== LOOP DIAGNÓSTICO ===\n');
  console.log('Texto:', DESCRIPTION, '\n');

  const actorSteps = parseActorCommaSteps(DESCRIPTION);
  console.log('1) parseActorCommaSteps (BUG?):', actorSteps);

  const loops = extractLoopExpectations(DESCRIPTION);
  console.log('2) extractLoopExpectations:', loops);

  const det = buildProcessLogicFromNaturalLanguage(DESCRIPTION);
  console.log('3) buildProcessLogicFromNaturalLanguage:');
  if (det) {
    console.log('   lanes:', det.lanes);
    console.log('   elements:', det.elements.map((e) => `${e.id} ${e.type} "${e.name}" [${e.lane}]`));
    console.log('   flows:', det.flows);
    const v = validateProcessLogic(det, DESCRIPTION);
    console.log('   validate:', { valid: v.errors.length === 0, errors: v.errors });
  } else {
    console.log('   null');
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  console.log('\n4) ANTHROPIC_API_KEY:', hasKey ? 'OK' : 'AUSENTE');

  if (hasKey) {
    console.log('\n5) Chamada real generateFromDescription...\n');
    const result = await flowAiService.generateFromDescription(DESCRIPTION);
    console.log('reply:', result.reply);
    console.log('validationMeta:', JSON.stringify(result.validationMeta, null, 2));
    const jsonMatch = result.reply; // xml path - need raw from service

    // Re-call claude manually to capture raw
    const { BPMN_AI_JSON_SYSTEM } = await import('../src/services/flowAiSystemPrompt');
    const { prepareDescriptionForAi } = await import('../src/services/flowNaturalLanguageParser');
    const userPrompt = prepareDescriptionForAi(DESCRIPTION);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.GENNECY_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: BPMN_AI_JSON_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const raw = data.content?.[0]?.text ?? '';
    console.log('\n6) JSON BRUTO Claude (primeiros 2000 chars):');
    console.log(raw.slice(0, 2000));
    const parsed = parseProcessLogicRaw(raw);
    if (parsed) {
      const pipeline = runValidatedLogicPipeline(parsed, DESCRIPTION);
      console.log('\n7) Após pipeline:', {
        valid: pipeline.valid,
        errors: pipeline.validation.errors,
        elements: pipeline.logic.elements.map((e) => `${e.type}:${e.name}`),
        flows: pipeline.logic.flows,
      });
    }
  }
}

main().catch(console.error);
