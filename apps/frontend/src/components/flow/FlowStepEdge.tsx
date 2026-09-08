'use client';

import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  useStore,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { resolveFlowMarkerEnd } from '@/lib/flowArrowMarkers';
import { type FlowEdgeData } from '@/lib/flowEdge';
import { buildFlowStepPath } from '@/lib/flowEdgeRoute';
import {
  bothEdgeHandlesDefined,
  computeEdgeSpreadOffsets,
  resolveConnectionSides,
} from '@/lib/flowEdgeRouting';
import { buildLiveNodeMap, resolveFlowEdgeAnchors } from '@/lib/flowNodeAnchors';
import { FlowEdgeInlineLabel } from './FlowEdgeInlineLabel';
import { FlowEdgeRouteHandles } from './FlowEdgeRouteHandles';
import { FlowEdgeSegments } from './FlowEdgeSegments';
import { FlowEdgeEndpointHandles } from './FlowEdgeEndpointHandles';
import { FlowEdgeToolbar } from './FlowEdgeToolbar';

type StepEdgeProps = EdgeProps & Pick<Edge, 'sourceHandle' | 'targetHandle'>;

/** Assina positionAbsolute como primitiva — re-render ao arrastar. */
function useNodeLayoutKey(nodeId: string): string {
  return useStore((state) => {
    const node = state.nodeLookup.get(nodeId);
    const abs = node?.internals.positionAbsolute;
    const measured = node?.measured;
    return [
      abs?.x ?? 0,
      abs?.y ?? 0,
      measured?.width ?? 0,
      measured?.height ?? 0,
      node?.dragging ? 1 : 0,
    ].join('|');
  });
}

export function FlowStepEdge(props: StepEdgeProps) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandle,
    targetHandle,
    label,
    markerEnd,
    style,
    selected,
    data,
  } = props;

  const sourceLayoutKey = useNodeLayoutKey(source);
  const targetLayoutKey = useNodeLayoutKey(target);
  const nodes = useStore((state) => state.nodes);
  const canvasEdges = useStore((state) => state.edges);
  const nodeLookup = useStore((state) => state.nodeLookup);

  const edgeFromStore = canvasEdges.find((edge) => edge.id === id);
  const edgeSourceHandle = edgeFromStore?.sourceHandle ?? sourceHandle;
  const edgeTargetHandle = edgeFromStore?.targetHandle ?? targetHandle;
  const bothHandlesDefined = bothEdgeHandlesDefined(edgeSourceHandle, edgeTargetHandle);

  void sourceLayoutKey;
  void targetLayoutKey;

  const nodeMap = buildLiveNodeMap(nodes, nodeLookup);
  const sourceNode = nodeLookup.get(source);
  const targetNode = nodeLookup.get(target);

  const edgeData = (data ?? edgeFromStore?.data ?? {}) as FlowEdgeData;
  const isAssociation = edgeData.isAssociation === true;

  const sideParams = {
    sourceHandle: edgeSourceHandle,
    targetHandle: edgeTargetHandle,
    ...(bothHandlesDefined ? {} : { sourcePosition, targetPosition }),
  };

  let sx = sourceX ?? 0;
  let sy = sourceY ?? 0;
  let tx = targetX ?? 0;
  let ty = targetY ?? 0;
  let { fromSide, toSide } = resolveConnectionSides(sideParams);

  if (sourceNode && targetNode) {
    const border = resolveFlowEdgeAnchors({
      sourceNode,
      targetNode,
      nodeMap,
      nodeLookup,
      sourceHandle: edgeSourceHandle,
      targetHandle: edgeTargetHandle,
      ...(bothHandlesDefined ? {} : { sourcePosition, targetPosition }),
    });
    sx = border.sourceX;
    sy = border.sourceY;
    tx = border.targetX;
    ty = border.targetY;
    fromSide = border.fromSide;
    toSide = border.toSide;
  }

  const spreadOffset =
    computeEdgeSpreadOffsets(
      canvasEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      (edgeId, end) => {
        const edge = canvasEdges.find((item) => item.id === edgeId);
        if (!edge) return null;
        const sides = resolveConnectionSides({
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        });
        return end === 'source' ? sides.fromSide : sides.toSide;
      },
    ).get(id) ?? 0;

  const { path: edgePath, labelX, labelY, points } = buildFlowStepPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    fromSide,
    toSide,
    sourceHandle: edgeSourceHandle,
    targetHandle: edgeTargetHandle,
    routePoints: undefined,
    spread: spreadOffset,
  });

  const textLabel = typeof label === 'string' ? label : '';
  const liveRoutePoints = selected ? edgeData.routePoints : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={isAssociation ? undefined : resolveFlowMarkerEnd(markerEnd)}
        style={style}
        interactionWidth={selected ? 36 : 12}
      />
      <EdgeLabelRenderer>
        <FlowEdgeSegments
          edgeId={id}
          selected={Boolean(selected)}
          points={points}
          routePoints={liveRoutePoints}
        />
        {selected && (
          <FlowEdgeRouteHandles
            edgeId={id}
            points={points}
            routePoints={liveRoutePoints}
          />
        )}
        {selected && (
          <FlowEdgeEndpointHandles
            edgeId={id}
            sourceNodeId={source}
            targetNodeId={target}
            sourcePoint={{ x: sx, y: sy }}
            targetPoint={{ x: tx, y: ty }}
            sourcePosition={sourcePosition}
            targetPosition={targetPosition}
          />
        )}
        {selected && <FlowEdgeToolbar edgeId={id} x={labelX} y={labelY - 22} />}
        <FlowEdgeInlineLabel
          edgeId={id}
          label={textLabel}
          defaultX={labelX}
          defaultY={labelY}
          selected={selected}
        />
      </EdgeLabelRenderer>
    </>
  );
}

FlowStepEdge.displayName = 'FlowStepEdge';

export const flowEdgeTypes = {
  step: FlowStepEdge,
};
