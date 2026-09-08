'use client';

import React, { memo, useRef } from 'react';
import { Handle, NodeResizer, Position, useStore, type NodeProps } from '@xyflow/react';
import { nodeAccentStyle, resolveNodeLabel } from '@/lib/flowNodeDefaults';
import { BpmnNodeContextPad } from './BpmnNodeContextPad';
import { BpmnLaneContextPad } from './BpmnLaneContextPad';
import { BpmnPoolContextPad } from './BpmnPoolContextPad';
import { FlowInlineLabel, getNodeLabelFallback } from './FlowInlineLabel';
import { FlowExternalNodeLabel } from './FlowExternalNodeLabel';
import { useAutoGrowNodeHeight, useNodeHasExplicitSize } from './useAutoGrowNodeHeight';
import { POOL_HEADER_WIDTH } from '@/lib/flowPoolHierarchy';
import { GATEWAY_DIAMOND_SIZE, GATEWAY_INNER_SIZE, EXCLUSIVE_GATEWAY_MARKER } from '@/lib/flowGatewayAnchors';

export const LANE_HEADER_WIDTH = 32;
export const LANE_DEFAULT_HEIGHT = 120;
export const MIN_LANE_HEIGHT = 56;
/** Caixa medida do React Flow — só a forma, sem rótulo externo. */
export const EVENT_NODE_SIZE = 48;
/** Tarefa padrão no canvas — mesma medida usada em âncoras e encadeamento. */
export const TASK_NODE_WIDTH = 150;
export const TASK_NODE_HEIGHT = 64;
type BpmnData = {
  label?: string;
  accentColor?: string;
  fillColor?: string;
  labelOffset?: { x: number; y: number };
  importedBpmn?: boolean;
  isCallActivity?: boolean;
};

const FLOW_SHAPE_FILL = 'bg-[var(--flow-shape-fill)]';
const FLOW_LABEL = 'text-[var(--flow-label)]';

function defaultBorderColor(data: BpmnData): string {
  return data.accentColor ?? 'var(--flow-shape-border)';
}

function externalNodeLabelClass(onLightFill: boolean): string {
  return onLightFill ? 'text-black max-w-[220px]' : `${FLOW_LABEL} max-w-[220px]`;
}

function NodeLabel({
  label,
  nodeType,
  onLightFill = false,
  constrained = false,
}: {
  label?: string;
  nodeType?: string;
  /** Fundo pastel fixo (ex.: cores da IA) — texto sempre escuro nos dois temas */
  onLightFill?: boolean;
  /** Caixa com largura fixa — quebra linha dentro da forma */
  constrained?: boolean;
}) {
  const display = String(label ?? '').trim() || getNodeLabelFallback(nodeType);
  const textClass = onLightFill ? 'text-black' : FLOW_LABEL;

  return (
    <FlowInlineLabel
      label={display}
      fallback={getNodeLabelFallback(nodeType)}
      className={`block ${textClass} ${
        constrained
          ? 'w-full break-words text-center text-[10px] font-normal leading-[1.2]'
          : 'max-w-[220px] text-center text-[12px] font-medium leading-snug'
      }`}
    />
  );
}

const handleClass =
  'nodrag nopan flow-bpmn-handle !z-40 !h-3.5 !w-3.5 !border-2 !border-[var(--flow-shape-border)] !bg-[var(--flow-shape-fill)] !pointer-events-auto';

/** Bolinhas no centro de cada lado — origem e destino (ConnectionMode.Strict). */
function BpmnShapeBorderHandles({ nodeId }: { nodeId: string }) {
  const nodeType = useStore((state) => {
    const fromLookup = state.nodeLookup.get(nodeId)?.type;
    if (fromLookup) return String(fromLookup);
    return String(state.nodes.find((node) => node.id === nodeId)?.type ?? '');
  });
  const isStart = nodeType === 'bpmnStart';
  const isEnd = nodeType === 'bpmnEnd';

  const tip = `${handleClass} !absolute !m-0`;
  const topPos = `${tip} !left-1/2 !top-0 !-translate-x-1/2 !-translate-y-1/2`;
  const leftPos = `${tip} !left-0 !top-1/2 !-translate-x-1/2 !-translate-y-1/2`;
  const rightPos = `${tip} !left-full !top-1/2 !-translate-x-1/2 !-translate-y-1/2`;
  const bottomPos = `${tip} !left-1/2 !top-full !-translate-x-1/2 !-translate-y-1/2`;

  const sides = [
    { position: Position.Top, id: 'top', className: topPos },
    { position: Position.Left, id: 'left', className: leftPos },
    { position: Position.Right, id: 'right', className: rightPos },
    { position: Position.Bottom, id: 'bottom', className: bottomPos },
  ] as const;

  return (
    <>
      {sides.map(({ position, id, className }) => {
        const sourceId = `source-${id}`;
        const targetId = `target-${id}`;
        return (
          <React.Fragment key={id}>
            {!isEnd ? (
              <Handle
                type="source"
                position={position}
                id={sourceId}
                className={`${className} flow-handle-source`}
              />
            ) : null}
            {!isStart ? (
              <Handle
                type="target"
                position={position}
                id={targetId}
                className={`${className} flow-handle-target`}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

function BpmnFourWayHandles({ nodeId }: { nodeId: string }) {
  return <BpmnShapeBorderHandles nodeId={nodeId} />;
}

function BpmnExternalLabelBelow({
  label,
  nodeType,
  className,
}: {
  label: string;
  nodeType: string;
  className: string;
}) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-[220px] -translate-x-1/2">
      <FlowExternalNodeLabel label={label} nodeType={nodeType} className={className} />
    </div>
  );
}

/** Área interna de rótulo em formas com largura/altura fixas (importação BPMN). */
const CONSTRAINED_LABEL_WRAPPER =
  'flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden px-2 py-1.5 text-center';

function EventCircleShell({
  selected,
  border,
  nodeData,
  nodeId,
  thickInnerBorder = false,
}: {
  selected?: boolean;
  border: string;
  nodeData: BpmnData;
  nodeId: string;
  thickInnerBorder?: boolean;
}) {
  return (
    <div
      className="relative shrink-0 overflow-visible"
      style={{ width: EVENT_NODE_SIZE, height: EVENT_NODE_SIZE }}
    >
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-full border-[1.5px] p-1 ${selectionRing(selected, 'circle')} ${
          nodeData.fillColor ? '' : FLOW_SHAPE_FILL
        }`}
        style={{ ...shapeStyle(nodeData), borderColor: border }}
      >
        {thickInnerBorder ? (
          <div
            className="pointer-events-none h-full w-full rounded-full border-[3px]"
            style={{ borderColor: border }}
          />
        ) : null}
      </div>
      <BpmnShapeBorderHandles nodeId={nodeId} />
    </div>
  );
}

function GatewayDiamondShell({
  selected,
  border,
  fillStyle,
  fillClass,
  icon,
  nodeId,
}: {
  selected?: boolean;
  border: string;
  fillStyle: React.CSSProperties;
  fillClass: string;
  icon: React.ReactNode;
  nodeId: string;
}) {
  const innerOffset = (GATEWAY_DIAMOND_SIZE - GATEWAY_INNER_SIZE) / 2;

  return (
    <div
      className="relative shrink-0"
      style={{ width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE }}
    >
      <div
        className={`pointer-events-none absolute rotate-45 border-2 shadow-sm ${selectionRing(selected, 'diamond')} ${fillClass}`}
        style={{
          ...fillStyle,
          borderColor: border,
          width: GATEWAY_INNER_SIZE,
          height: GATEWAY_INNER_SIZE,
          left: innerOffset,
          top: innerOffset,
        }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">{icon}</span>
      <BpmnShapeBorderHandles nodeId={nodeId} />
    </div>
  );
}

function selectionRing(selected: boolean | undefined, shape: 'rect' | 'circle' | 'diamond' = 'rect') {
  if (!selected) return '';
  const base = 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[var(--flow-ring-offset)]';
  if (shape === 'circle') return `${base} rounded-full`;
  if (shape === 'diamond') return `${base} rotate-45`;
  return `${base} rounded-md`;
}

function shapeStyle(data: BpmnData) {
  return nodeAccentStyle(data.accentColor, data.fillColor);
}

export const BpmnStartNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const border = defaultBorderColor(nodeData);
  return (
    <div className="relative" style={{ width: EVENT_NODE_SIZE, height: EVENT_NODE_SIZE }}>
      <BpmnNodeContextPad selected={selected} />
      <EventCircleShell selected={selected} border={border} nodeData={nodeData} nodeId={id} />
      <BpmnExternalLabelBelow
        label={label}
        nodeType={String(type)}
        className={externalNodeLabelClass(false)}
      />
    </div>
  );
});
BpmnStartNode.displayName = 'BpmnStartNode';

export const BpmnEndNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const border = defaultBorderColor(nodeData);
  return (
    <div className="relative" style={{ width: EVENT_NODE_SIZE, height: EVENT_NODE_SIZE }}>
      <BpmnNodeContextPad selected={selected} />
      <EventCircleShell
        selected={selected}
        border={border}
        nodeData={nodeData}
        nodeId={id}
        thickInnerBorder
      />
      <BpmnExternalLabelBelow
        label={label}
        nodeType={String(type)}
        className={externalNodeLabelClass(false)}
      />
    </div>
  );
});
BpmnEndNode.displayName = 'BpmnEndNode';

export const BpmnTaskNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const boxRef = useRef<HTMLDivElement>(null);
  const hasExplicitSize = useNodeHasExplicitSize(id);
  const importedStyle = useStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    return node?.style as { width?: number; height?: number } | undefined;
  });
  useAutoGrowNodeHeight(
    boxRef,
    label,
    hasExplicitSize && !nodeData.importedBpmn,
    importedStyle?.width,
    importedStyle?.height,
  );

  return (
    <>
      <BpmnNodeContextPad selected={selected} />
      {hasExplicitSize ? (
        <div
          ref={boxRef}
          className={`relative box-border flex rounded-md border-[1.5px] min-h-full w-full items-center justify-center overflow-visible ${selectionRing(selected)} ${
            selected && !nodeData.accentColor ? 'border-blue-500' : 'border-[var(--flow-shape-border)]'
          } ${nodeData.fillColor ? '' : FLOW_SHAPE_FILL}`}
          style={nodeAccentStyle(nodeData.accentColor, nodeData.fillColor)}
        >
          <BpmnFourWayHandles nodeId={id} />
          <div className={`pointer-events-none ${CONSTRAINED_LABEL_WRAPPER}${nodeData.isCallActivity ? ' pb-4' : ''}`}>
            <NodeLabel
              label={label}
              nodeType={String(type)}
              onLightFill={Boolean(nodeData.fillColor)}
              constrained
            />
          </div>
          {nodeData.isCallActivity ? (
            <span className="pointer-events-none absolute bottom-0.5 left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-sm border border-black/50 bg-white/90 text-[10px] font-bold leading-none text-black">
              +
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className="relative shrink-0"
          style={{ width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT }}
        >
          <div
            className={`absolute inset-0 box-border flex items-center justify-center overflow-visible rounded-md border-[1.5px] px-3 py-2 ${selectionRing(selected)} ${
              selected && !nodeData.accentColor ? 'border-blue-500' : 'border-[var(--flow-shape-border)]'
            } ${nodeData.fillColor ? '' : FLOW_SHAPE_FILL}`}
            style={nodeAccentStyle(nodeData.accentColor, nodeData.fillColor)}
          >
            <BpmnFourWayHandles nodeId={id} />
            <div className="pointer-events-none w-full">
              <NodeLabel
                label={label}
                nodeType={String(type)}
                onLightFill={Boolean(nodeData.fillColor)}
                constrained={false}
              />
            </div>
            {nodeData.isCallActivity ? (
              <span className="pointer-events-none absolute bottom-0.5 left-1/2 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-sm border border-black/50 bg-white/90 text-[10px] font-bold leading-none text-black">
                +
              </span>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
});
BpmnTaskNode.displayName = 'BpmnTaskNode';

export const BpmnGatewayNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const border = defaultBorderColor(nodeData);
  return (
    <>
      <BpmnNodeContextPad selected={selected} />
      {/* Rótulo renderizado como filho normal do nó (não via NodeToolbar) para
          escalar junto com o zoom do canvas, igual ao restante do diagrama. */}
      <div className="relative" style={{ width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE }}>
        <GatewayDiamondShell
          selected={selected}
          border={border}
          fillStyle={shapeStyle(nodeData) ?? {}}
          fillClass={nodeData.fillColor ? '' : FLOW_SHAPE_FILL}
          nodeId={id}
          icon={
            <span className="text-xl font-bold leading-none text-black">
              {EXCLUSIVE_GATEWAY_MARKER}
            </span>
          }
        />
        <BpmnExternalLabelBelow
          label={label}
          nodeType={String(type)}
          className={externalNodeLabelClass(false)}
        />
      </div>
    </>
  );
});
BpmnGatewayNode.displayName = 'BpmnGatewayNode';

export const BpmnParallelGatewayNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const border = defaultBorderColor(nodeData);
  return (
    <>
      <BpmnNodeContextPad selected={selected} />
      <div className="relative" style={{ width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE }}>
        <GatewayDiamondShell
          selected={selected}
          border={border}
          fillStyle={shapeStyle(nodeData) ?? {}}
          fillClass={nodeData.fillColor ? '' : FLOW_SHAPE_FILL}
          nodeId={id}
          icon={<span className="text-xl font-bold text-black">+</span>}
        />
        <BpmnExternalLabelBelow
          label={label}
          nodeType={String(type)}
          className={externalNodeLabelClass(false)}
        />
      </div>
    </>
  );
});
BpmnParallelGatewayNode.displayName = 'BpmnParallelGatewayNode';

export const BpmnDocumentNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const boxRef = useRef<HTMLDivElement>(null);
  const hasExplicitSize = useNodeHasExplicitSize(id);
  const importedStyle = useStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    return node?.style as { width?: number; height?: number } | undefined;
  });
  useAutoGrowNodeHeight(
    boxRef,
    label,
    hasExplicitSize && !nodeData.importedBpmn,
    importedStyle?.width,
    importedStyle?.height,
  );

  return (
    <>
      <BpmnNodeContextPad selected={selected} />
      <div
        ref={hasExplicitSize ? undefined : boxRef}
        className={`relative box-border flex border-[1.5px] ${
          hasExplicitSize
            ? 'min-h-full w-full items-center justify-center'
            : 'min-w-[110px] max-w-[160px] items-center justify-center px-3 py-2'
        } ${selectionRing(selected)} ${
          selected && !nodeData.accentColor ? 'border-blue-500' : 'border-[var(--flow-shape-border)]'
        } ${nodeData.fillColor ? '' : FLOW_SHAPE_FILL}`}
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 82%, 92% 100%, 0 100%)',
          borderRadius: '4px 4px 0 0',
          ...nodeAccentStyle(nodeData.accentColor, nodeData.fillColor),
        }}
      >
        <BpmnFourWayHandles nodeId={id} />
        {hasExplicitSize ? (
          <div ref={boxRef} className={CONSTRAINED_LABEL_WRAPPER}>
            <NodeLabel
              label={label}
              nodeType={String(type)}
              onLightFill={Boolean(nodeData.fillColor)}
              constrained
            />
          </div>
        ) : (
          <NodeLabel
            label={label}
            nodeType={String(type)}
            onLightFill={Boolean(nodeData.fillColor)}
            constrained={false}
          />
        )}
      </div>
    </>
  );
});
BpmnDocumentNode.displayName = 'BpmnDocumentNode';

export const BpmnDataNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const boxRef = useRef<HTMLDivElement>(null);
  const hasExplicitSize = useNodeHasExplicitSize(id);
  const importedStyle = useStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    return node?.style as { width?: number; height?: number } | undefined;
  });
  useAutoGrowNodeHeight(
    boxRef,
    label,
    hasExplicitSize && !nodeData.importedBpmn,
    importedStyle?.width,
    importedStyle?.height,
  );

  return (
    <>
      <BpmnNodeContextPad selected={selected} />
      <div className={`relative skew-x-[-12deg] ${hasExplicitSize ? 'min-h-full w-full' : ''} ${selectionRing(selected)}`}>
        <div
          ref={hasExplicitSize ? undefined : boxRef}
          className={`relative box-border flex border-[1.5px] ${
            hasExplicitSize
              ? 'h-full w-full items-center justify-center'
              : 'min-w-[110px] max-w-[160px] items-center justify-center px-3 py-2'
          } ${selected ? 'border-blue-500' : 'border-[var(--flow-shape-border)]'} ${nodeData.fillColor ? '' : FLOW_SHAPE_FILL}`}
          style={nodeAccentStyle(nodeData.accentColor, nodeData.fillColor)}
        >
          <BpmnFourWayHandles nodeId={id} />
          {hasExplicitSize ? (
            <div ref={boxRef} className={CONSTRAINED_LABEL_WRAPPER}>
              <div className="skew-x-[12deg]">
                <NodeLabel
                  label={label}
                  nodeType={String(type)}
                  onLightFill={Boolean(nodeData.fillColor)}
                  constrained
                />
              </div>
            </div>
          ) : (
            <div className="skew-x-[12deg]">
              <NodeLabel
                label={label}
                nodeType={String(type)}
                onLightFill={Boolean(nodeData.fillColor)}
                constrained={false}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
});
BpmnDataNode.displayName = 'BpmnDataNode';

export const BpmnTextNode = memo(({ data, selected, type, id }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: String(type), data: nodeData });
  const hasExplicitSize = useNodeHasExplicitSize(id);
  const annotationStyle = nodeData.fillColor
    ? nodeAccentStyle(nodeData.accentColor, nodeData.fillColor)
    : { backgroundColor: '#f5f5f5', borderColor: 'var(--flow-shape-border)' };

  return (
    <>
      <BpmnNodeContextPad selected={selected} />
      <div
        className={`relative box-border flex border-[1.5px] ${
          hasExplicitSize ? 'h-full w-full items-center justify-center overflow-hidden p-1.5' : 'min-w-[80px] max-w-[280px] px-1'
        } ${selectionRing(selected)}`}
        style={annotationStyle}
      >
        <FlowInlineLabel
          label={label}
          fallback="Texto"
          className={`block text-[var(--flow-label)] ${
            hasExplicitSize
              ? 'w-full break-words text-center text-[10px] font-normal leading-[1.2]'
              : 'text-center text-[12px] font-medium leading-snug'
          }`}
          inputClassName="!text-sm"
        />
      </div>
    </>
  );
});
BpmnTextNode.displayName = 'BpmnTextNode';

export const BpmnLaneNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: 'bpmnLane', data: nodeData });
  const border = defaultBorderColor(nodeData);
  const customFill = nodeData.fillColor;

  return (
    <>
      <BpmnLaneContextPad selected={selected} />
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={360}
        minHeight={MIN_LANE_HEIGHT}
        lineClassName="!border-blue-500"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-2 !border-blue-500 !bg-[var(--flow-shape-fill)]"
      />
      <div
        className={`relative h-full w-full overflow-hidden ${
          customFill ? '' : FLOW_SHAPE_FILL
        }`}
        style={{
          border: `1.5px solid ${border}`,
          ...(customFill ? { backgroundColor: customFill } : {}),
        }}
      >
        <div
          className="lane-drag-handle absolute inset-y-0 left-0 flex cursor-grab items-center justify-center border-r bg-[var(--flow-lane-header)] active:cursor-grabbing"
          style={{ width: LANE_HEADER_WIDTH, borderColor: border }}
        >
          <FlowInlineLabel
            label={label}
            fallback="Raia"
            vertical
            className={`text-[11px] font-bold uppercase tracking-wide ${FLOW_LABEL}`}
            inputClassName="!text-[11px] !font-bold !uppercase"
          />
        </div>
      </div>
    </>
  );
});
BpmnLaneNode.displayName = 'BpmnLaneNode';

export const BpmnPoolNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as BpmnData;
  const label = resolveNodeLabel({ type: 'bpmnPool', data: nodeData });
  const border = defaultBorderColor(nodeData);

  return (
    <>
      <BpmnPoolContextPad selected={selected} />
      <div className="relative h-full w-full">
      <div
        className="pool-drag-handle absolute inset-y-0 left-0 z-10 flex cursor-grab items-center justify-center border-r bg-[var(--flow-lane-header)] active:cursor-grabbing"
        style={{ width: POOL_HEADER_WIDTH, borderColor: border }}
      >
        <FlowInlineLabel
          label={label}
          fallback="Participante"
          vertical
          className={`text-[11px] font-bold uppercase tracking-wide ${FLOW_LABEL}`}
          inputClassName="!text-[11px] !font-bold !uppercase"
        />
      </div>
      <div
        className={`pointer-events-none absolute inset-0 ${selectionRing(selected)}`}
        style={{ border: `2px solid ${border}` }}
      />
    </div>
    </>
  );
});
BpmnPoolNode.displayName = 'BpmnPoolNode';

export const flowNodeTypes = {
  bpmnStart: BpmnStartNode,
  bpmnEnd: BpmnEndNode,
  bpmnTask: BpmnTaskNode,
  bpmnGateway: BpmnGatewayNode,
  bpmnParallelGateway: BpmnParallelGatewayNode,
  bpmnDocument: BpmnDocumentNode,
  bpmnData: BpmnDataNode,
  bpmnText: BpmnTextNode,
  bpmnLane: BpmnLaneNode,
  bpmnPool: BpmnPoolNode,
};

export const FLOW_DND_TYPE = 'application/flow-bpmn';

export function getDefaultNodeSize(type: string): { width: number; height: number } {
  switch (type) {
    case 'bpmnStart':
    case 'bpmnEnd':
      return { width: EVENT_NODE_SIZE, height: EVENT_NODE_SIZE };
    case 'bpmnGateway':
    case 'bpmnParallelGateway':
      return { width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE };
    case 'bpmnLane':
      return { width: 1200, height: LANE_DEFAULT_HEIGHT };
    case 'bpmnPool':
      return { width: 1200 + POOL_HEADER_WIDTH, height: LANE_DEFAULT_HEIGHT };
    case 'bpmnText':
      return { width: 120, height: 36 };
    default:
      return { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT };
  }
}
