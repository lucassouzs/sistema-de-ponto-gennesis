import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { userHasFlowAccess } from '../lib/flowAccess';
import { flowAiService } from './FlowAiService';

export const FLOW_FORBIDDEN = 'FLOW_FORBIDDEN';
export const FLOW_NOT_FOUND = 'FLOW_NOT_FOUND';

export class FlowService {
  private async assertAccess(userId: string, isAdmin: boolean) {
    const ok = await userHasFlowAccess(userId, isAdmin);
    if (!ok) throw new Error(FLOW_FORBIDDEN);
  }

  async listDiagrams(userId: string, isAdmin: boolean) {
    await this.assertAccess(userId, isAdmin);
    return prisma.flowDiagram.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getDiagram(userId: string, isAdmin: boolean, id: string) {
    await this.assertAccess(userId, isAdmin);
    const diagram = await prisma.flowDiagram.findFirst({
      where: { id, userId },
    });
    if (!diagram) throw new Error(FLOW_NOT_FOUND);
    return diagram;
  }

  async createDiagram(userId: string, isAdmin: boolean, data: { name?: string; description?: string }) {
    await this.assertAccess(userId, isAdmin);
    return prisma.flowDiagram.create({
      data: {
        userId,
        name: data.name?.trim() || 'Fluxo sem título',
        description: data.description?.trim() || null,
        nodes: [],
        edges: [],
      },
    });
  }

  async updateDiagram(
    userId: string,
    isAdmin: boolean,
    id: string,
    data: {
      name?: string;
      description?: string | null;
      nodes?: unknown;
      edges?: unknown;
      viewport?: unknown;
    },
  ) {
    await this.getDiagram(userId, isAdmin, id);
    return prisma.flowDiagram.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() || 'Fluxo sem título' } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.nodes !== undefined ? { nodes: data.nodes as Prisma.InputJsonValue } : {}),
        ...(data.edges !== undefined ? { edges: data.edges as Prisma.InputJsonValue } : {}),
        ...(data.viewport !== undefined ? { viewport: data.viewport as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async deleteDiagram(userId: string, isAdmin: boolean, id: string) {
    await this.getDiagram(userId, isAdmin, id);
    await prisma.flowDiagram.delete({ where: { id } });
  }

  async generateFromAi(
    userId: string,
    isAdmin: boolean,
    description: string,
    existingNodes?: unknown,
    currentProcessName?: string,
    existingEdges?: unknown,
  ) {
    await this.assertAccess(userId, isAdmin);
    const nodes = Array.isArray(existingNodes) ? existingNodes : undefined;
    const edges = Array.isArray(existingEdges) ? existingEdges : undefined;
    return flowAiService.generateFromDescription(
      description,
      nodes as never,
      currentProcessName,
      edges as never,
    );
  }
}
