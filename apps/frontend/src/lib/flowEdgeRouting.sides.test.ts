import assert from 'node:assert/strict';
import {
  bothEdgeHandlesDefined,
  normalizeEdgeHandleToSide,
  resolveConnectionSides,
} from './flowEdgeRouting';

function expectSides(
  label: string,
  params: Parameters<typeof resolveConnectionSides>[0],
  expected: { fromSide: string; toSide: string },
) {
  const result = resolveConnectionSides(params);
  assert.equal(
    result.fromSide,
    expected.fromSide,
    `${label}: fromSide expected ${expected.fromSide}, got ${result.fromSide}`,
  );
  assert.equal(
    result.toSide,
    expected.toSide,
    `${label}: toSide expected ${expected.toSide}, got ${result.toSide}`,
  );
}

// 4 conexões manuais para cada lado do destino (origem sempre pela direita)
const targetSides = ['top', 'right', 'bottom', 'left'] as const;
for (const targetSide of targetSides) {
  expectSides(`right→${targetSide}`, {
    sourceHandle: 'right',
    targetHandle: targetSide,
    sourcePosition: 'bottom',
    targetPosition: 'bottom',
  }, { fromSide: 'right', toSide: targetSide });
}

// Posição RF envenenada não altera quando ambos handles definidos
expectSides('RF bottom ignorado', {
  sourceHandle: 'right',
  targetHandle: 'left',
  sourcePosition: 'bottom',
  targetPosition: 'bottom',
}, { fromSide: 'right', toSide: 'left' });

// Só um handle → oposto, nunca RF
expectSides('só sourceHandle', {
  sourceHandle: 'right',
  targetPosition: 'bottom',
}, { fromSide: 'right', toSide: 'left' });

expectSides('só targetHandle', {
  targetHandle: 'top',
  sourcePosition: 'bottom',
}, { fromSide: 'bottom', toSide: 'top' });

// Nenhum handle → RF
expectSides('sem handles usa RF', {
  sourcePosition: 'right',
  targetPosition: 'left',
}, { fromSide: 'right', toSide: 'left' });

assert.equal(bothEdgeHandlesDefined('right', 'left'), true);
assert.equal(bothEdgeHandlesDefined('source-right', 'target-left'), true);
assert.equal(bothEdgeHandlesDefined('right', null), false);

expectSides('ids RF normalizados', {
  sourceHandle: 'source-right',
  targetHandle: 'target-top',
  targetPosition: 'bottom',
}, { fromSide: 'right', toSide: 'top' });

console.log('flowEdgeRouting.sides.test.ts — OK (10 cenários)');
