/** Tipos com caixa retangular — preservam o tamanho exato do diagrama importado. */
export const RECTANGULAR_NODE_TYPES = new Set(['bpmnTask', 'bpmnDocument', 'bpmnData']);

export const SIZED_IMPORT_NODE_TYPES = new Set([...RECTANGULAR_NODE_TYPES, 'bpmnText']);
