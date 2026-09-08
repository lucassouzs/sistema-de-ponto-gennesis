import type { Edge, Node } from '@xyflow/react';

import type { FlowEdgeData } from './flowEdge';

import { normalizeFlowEdge } from './flowEdge';

import {

  buildNodeMap,

  findContainingLane,

  getAbsolutePosition,

  getLaneSize,

  getProcessNodeSize,

  LANE_NODE_TYPE,

} from './flowLaneHierarchy';



const LONG_SAME_LANE_PX = 160;

const CORRIDOR_INSET = 44;



function poolRightEdge(nodes: Node[], nodeMap: Map<string, Node>): number {

  let right = 0;

  for (const node of nodes) {

    if (node.type === LANE_NODE_TYPE || node.type === 'bpmnText') continue;

    const type = String(node.type ?? '');

    if (type === 'bpmnLane' || type === 'bpmnPool') continue;

    const abs = getAbsolutePosition(node, nodeMap);

    const size = getProcessNodeSize(node);

    right = Math.max(right, abs.x + size.width);

  }

  for (const lane of nodes.filter((node) => node.type === LANE_NODE_TYPE)) {

    const abs = getAbsolutePosition(lane, nodeMap);

    const size = getLaneSize(lane);

    right = Math.max(right, abs.x + size.width);

  }

  return right;

}



function incomingCount(edges: Edge[], targetId: string): number {

  return edges.filter((edge) => edge.target === targetId).length;

}



function withRoutePoints(edge: Edge, routePoints: { x: number; y: number }[]): Edge {

  const data = { ...(edge.data as FlowEdgeData), routePoints };

  return normalizeFlowEdge({

    ...edge,

    sourceHandle: edge.sourceHandle ?? 'right',

    targetHandle: edge.targetHandle ?? 'left',

    data,

  });

}



/** Roteia apenas merges longos na mesma raia e retornos que sobem com grande deslocamento horizontal. */

export function autoRouteFlowEdges(nodes: Node[], edges: Edge[]): Edge[] {

  const nodeMap = buildNodeMap(nodes);

  const lanes = nodes

    .filter((node) => node.type === LANE_NODE_TYPE)

    .sort((a, b) => {

      const aY = getAbsolutePosition(a, nodeMap).y;

      const bY = getAbsolutePosition(b, nodeMap).y;

      return aY - bY || getAbsolutePosition(a, nodeMap).x - getAbsolutePosition(b, nodeMap).x;

    });

  const laneIndexById = new Map(lanes.map((lane, index) => [lane.id, index]));

  const corridorX = poolRightEdge(nodes, nodeMap) - CORRIDOR_INSET;



  return edges.map((edge) => {

    const source = nodeMap.get(edge.source);

    const target = nodeMap.get(edge.target);

    if (!source || !target) return edge;



    const srcAbs = getAbsolutePosition(source, nodeMap);

    const tgtAbs = getAbsolutePosition(target, nodeMap);

    const srcSize = getProcessNodeSize(source);

    const tgtSize = getProcessNodeSize(target);

    const srcLane = findContainingLane(source, lanes, nodeMap);

    const tgtLane = findContainingLane(target, lanes, nodeMap);



    const srcRight = srcAbs.x + srcSize.width;

    const srcCy = srcAbs.y + srcSize.height / 2;

    const tgtLeft = tgtAbs.x;

    const tgtCy = tgtAbs.y + tgtSize.height / 2;



    if (srcLane && tgtLane && srcLane.id === tgtLane.id) {

      const gapX = tgtLeft - srcRight;

      const isMerge = incomingCount(edges, edge.target) >= 2;

      if (isMerge && gapX > LONG_SAME_LANE_PX && Math.abs(srcCy - tgtCy) <= 28) {

        const laneAbs = getAbsolutePosition(srcLane, nodeMap);

        const laneSize = getLaneSize(srcLane);

        const busY = laneAbs.y + laneSize.height - 12;

        return withRoutePoints(edge, [

          { x: srcRight, y: busY },

          { x: tgtLeft, y: busY },

        ]);

      }

      return edge;

    }



    if (!srcLane || !tgtLane || srcLane.id === tgtLane.id) return edge;



    const srcLaneIdx = laneIndexById.get(srcLane.id) ?? 0;

    const tgtLaneIdx = laneIndexById.get(tgtLane.id) ?? 0;

    const horizontalSpan = Math.abs(tgtLeft - srcRight);



    if (srcLaneIdx <= tgtLaneIdx || horizontalSpan < 120) return edge;



    const busX = Math.max(corridorX, srcRight + 24);

    return withRoutePoints(edge, [

      { x: busX, y: srcCy },

      { x: busX, y: tgtCy },

      { x: tgtLeft, y: tgtCy },

    ]);

  });

}


