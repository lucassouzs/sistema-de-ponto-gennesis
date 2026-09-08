import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';

class FlowBpmnCustomRules extends RuleProvider {
  static $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  init(): void {
    this.addRule('elements.move', () => true);
    this.addRule('shape.create', () => true);
    this.addRule('shape.attach', () => true);
  }
}

export default {
  __init__: ['flowBpmnCustomRules'],
  flowBpmnCustomRules: ['type', FlowBpmnCustomRules],
};
