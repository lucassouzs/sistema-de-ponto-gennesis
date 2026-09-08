import { looksLikeTechnicalId } from './flowBpmnLabels';

const TASK_TAGS = [
  'task',
  'userTask',
  'serviceTask',
  'scriptTask',
  'manualTask',
  'businessRuleTask',
  'sendTask',
  'receiveTask',
  'subProcess',
];

function localName(el: Element): string {
  return el.localName.replace(/^[^:]+:/, '');
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(`bpmn:${name}`);
}

function setNameIfEmpty(el: Element, fallback: string): void {
  const current = attr(el, 'name')?.trim();
  if (!current || looksLikeTechnicalId(current)) {
    el.setAttribute('name', fallback);
  }
}

/** Garante atributos name em tasks, eventos, gateways e saídas de gateway antes do importXML. */
export function fixElementNames(xml: string): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return xml;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  if (doc.querySelector('parsererror')) {
    console.warn('fixElementNames: XML inválido, retornando original');
    return xml;
  }

  for (const tag of TASK_TAGS) {
    for (const task of elementsByLocalName(doc, tag)) {
      setNameIfEmpty(task, 'Tarefa');
    }
  }

  for (const start of elementsByLocalName(doc, 'startEvent')) {
    setNameIfEmpty(start, 'Início');
  }

  for (const end of elementsByLocalName(doc, 'endEvent')) {
    setNameIfEmpty(end, 'Fim');
  }

  for (const gateway of [
    ...elementsByLocalName(doc, 'exclusiveGateway'),
    ...elementsByLocalName(doc, 'inclusiveGateway'),
    ...elementsByLocalName(doc, 'parallelGateway'),
  ]) {
    setNameIfEmpty(gateway, 'Decisão?');
  }

  const gatewayIds = new Set(
    [
      ...elementsByLocalName(doc, 'exclusiveGateway'),
      ...elementsByLocalName(doc, 'inclusiveGateway'),
    ]
      .map((el) => attr(el, 'id'))
      .filter((id): id is string => Boolean(id)),
  );

  const outgoingByGateway = new Map<string, Element[]>();
  for (const flow of elementsByLocalName(doc, 'sequenceFlow')) {
    const source = attr(flow, 'sourceRef');
    if (!source || !gatewayIds.has(source)) continue;
    outgoingByGateway.set(source, [...(outgoingByGateway.get(source) ?? []), flow]);
  }

  const defaultFlowLabels = ['Sim', 'Não', 'Opção A', 'Opção B', 'Opção C'];
  for (const flows of outgoingByGateway.values()) {
    flows.forEach((flow, index) => {
      const current = attr(flow, 'name')?.trim();
      if (!current || looksLikeTechnicalId(current)) {
        flow.setAttribute('name', defaultFlowLabels[index] ?? `Saída ${index + 1}`);
      }
    });
  }

  return new XMLSerializer().serializeToString(doc);
}

function elementsByLocalName(root: Document | Element, local: string): Element[] {
  const result: Element[] = [];
  const rootEl = root instanceof Document ? root.documentElement : root;
  if (!rootEl) return result;

  for (const el of rootEl.getElementsByTagName('*')) {
    if (localName(el) === local) result.push(el);
  }
  return result;
}
