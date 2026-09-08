/** IDs técnicos do BPMN (UUID, id_..., Activity_...) — não usar como rótulo visível. */
export function looksLikeTechnicalId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('id_')) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  if (/^(Activity|Event|Gateway|Flow|Task|SubProcess|Participant|Lane)_[0-9a-f-]+$/i.test(v)) {
    return true;
  }
  return false;
}

function truncateImportedLabel(label: string, type: string): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  const local = type.replace(/^bpmn:/, '');
  const isGateway = local.toLowerCase().includes('gateway');
  const max = isGateway ? 40 : 72;
  if (clean.length <= max) return clean;
  if (isGateway && clean.length > 72) return 'Decisão?';
  return `${clean.slice(0, max - 1)}…`;
}

export function defaultLabelForBpmnTag(tag: string): string {
  const local = tag.replace(/^bpmn:/, '');
  switch (local) {
    case 'startEvent':
      return 'Início';
    case 'endEvent':
      return 'Fim';
    case 'exclusiveGateway':
    case 'inclusiveGateway':
    case 'complexGateway':
    case 'eventBasedGateway':
      return 'Decisão';
    case 'parallelGateway':
      return 'Paralelo';
    case 'textAnnotation':
      return '';
    case 'Participant':
      return 'Processo';
    case 'Lane':
      return 'Raia';
    default:
      return 'Tarefa';
  }
}

export function resolveImportedShapeLabel(params: {
  type: string;
  name?: string | null;
  text?: string | null;
  id?: string | null;
}): string {
  const local = params.type.replace(/^bpmn:/, '');

  if (local === 'textAnnotation') {
    const text = params.text?.trim();
    if (text && !looksLikeTechnicalId(text)) return text;
    return '';
  }

  const name = params.name?.trim();
  if (name && !looksLikeTechnicalId(name)) {
    return truncateImportedLabel(name, params.type);
  }

  return defaultLabelForBpmnTag(params.type);
}
