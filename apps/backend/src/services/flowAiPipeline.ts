import type { ProcessLogic } from './bpmnLayoutEngine';
import { normalizeProcessLogic } from './flowAiLogicNormalize';
import {
  applyAutoFixes,
  applyOrphanEndEventFixes,
  hasBlockingErrors,
  validateProcessLogic,
  type LogicValidationResult,
} from './flowLogicValidate';
import type { FlowValidationMeta } from './flowAiTypes';

export type ValidatedLogicResult = {
  logic: ProcessLogic;
  validation: LogicValidationResult;
  meta: FlowValidationMeta;
  valid: boolean;
};

/** Normaliza + valida + auto-fix (com avisos ao usuário quando aplicável). */
export function runValidatedLogicPipeline(
  rawLogic: ProcessLogic,
  description: string,
): ValidatedLogicResult {
  const userNotices: string[] = [];
  let logic = normalizeProcessLogic(rawLogic, description);

  let validation = validateProcessLogic(logic, description);

  const { logic: afterAutoFix, applied } = applyAutoFixes(logic, validation, description);
  if (applied.length > 0) {
    logic = afterAutoFix;
    for (const fix of applied) {
      if (fix.userMessage) userNotices.push(fix.userMessage);
    }
    validation = validateProcessLogic(logic, description);
  }

  if (hasBlockingErrors(validation)) {
    const orphanFix = applyOrphanEndEventFixes(logic);
    if (orphanFix.userMessages.length > 0) {
      logic = orphanFix.logic;
      userNotices.push(...orphanFix.userMessages);
      validation = validateProcessLogic(logic, description);
    }
  }

  return {
    logic,
    validation,
    valid: !hasBlockingErrors(validation),
    meta: {
      autoFixed: userNotices.length > 0,
      userNotices,
      attemptCount: 1,
    },
  };
}
