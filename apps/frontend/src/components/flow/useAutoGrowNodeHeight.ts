'use client';

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { useNodeId, useReactFlow, useStore, useUpdateNodeInternals } from '@xyflow/react';

/** True quando o nó tem width/height explícitos no style (ex.: importação BPMN). */
export function useNodeHasExplicitSize(nodeId: string): boolean {
  return useStore(
    useCallback(
      (state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        const style = node?.style as { width?: number; height?: number } | undefined;
        return Boolean(style?.width && style?.height);
      },
      [nodeId],
    ),
  );
}

/**
 * Só expande a altura de nós importados cujo rótulo não cabe na caixa original.
 *
 * Importante: `importedWidth`/`importedHeight` NÃO entram no array de dependências
 * do efeito — eles mudam como consequência do próprio `setNodes` chamado aqui, e
 * incluí-los causaria um loop infinito (o efeito rodaria de novo a cada ajuste,
 * indefinidamente). Em vez disso, lemos o valor mais recente via ref e só
 * reavaliamos quando o texto (`label`) realmente muda.
 */
export function useAutoGrowNodeHeight(
  boxRef: RefObject<HTMLElement | null>,
  label: string,
  enabled: boolean,
  importedWidth?: number,
  importedHeight?: number,
) {
  const nodeId = useNodeId();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const sizeRef = useRef({ importedWidth, importedHeight });
  sizeRef.current = { importedWidth, importedHeight };

  const processedLabelRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !boxRef.current || !nodeId) return;
    if (processedLabelRef.current === label) return;

    const { importedWidth: width, importedHeight: height } = sizeRef.current;
    if (typeof height !== 'number') return;

    processedLabelRef.current = label;

    const el = boxRef.current;
    const contentHeight = Math.ceil(el.scrollHeight);
    if (contentHeight <= height + 2) return;

    setNodes((nodes) => {
      let changed = false;
      const next = nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const style = (node.style ?? {}) as { width?: number; height?: number };
        const currentHeight = style.height ?? height;
        if (Math.abs(currentHeight - contentHeight) < 2) return node;
        changed = true;
        return {
          ...node,
          style: {
            ...style,
            ...(typeof width === 'number' ? { width } : {}),
            height: contentHeight,
          },
        };
      });
      if (changed) {
        updateNodeInternals(nodeId);
      }
      return changed ? next : nodes;
    });
  }, [boxRef, label, enabled, nodeId, setNodes, updateNodeInternals]);
}
