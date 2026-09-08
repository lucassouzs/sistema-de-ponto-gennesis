import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

export type BpmnModelerInstance = {
  importXML(xml: string): Promise<{ warnings: string[] }>;
  saveSVG(): Promise<{ svg: string }>;
  destroy(): void;
  get<T = unknown>(service: string): T;
};

export async function createBpmnModeler(container: HTMLElement): Promise<BpmnModelerInstance> {
  const [{ default: BpmnModeler }, customRulesModule] = await Promise.all([
    import('bpmn-js/lib/Modeler'),
    import('./flowBpmnCustomRules'),
  ]);

  return new BpmnModeler({
    container,
    additionalModules: [customRulesModule.default],
  }) as unknown as BpmnModelerInstance;
}
