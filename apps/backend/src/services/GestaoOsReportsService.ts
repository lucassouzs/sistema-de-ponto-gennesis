import { GestaoOsStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  type GestaoOsAccessContext,
  workOrderVisibilityWhere
} from '../lib/gestaoOsAccess';

export class GestaoOsReportsService {
  async summary(access: GestaoOsAccessContext) {
    const visibility = workOrderVisibilityWhere(access);

    const openStatuses: GestaoOsStatus[] = [
      'OPEN',
      'UNDER_REVIEW',
      'APPROVED',
      'SAFETY_CHECK',
      'IN_PROGRESS',
      'WAITING_PARTS'
    ];

    const [byStatus, overdue, completed, byCategory, byBuilding, byAssignee] = await Promise.all([
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['status'],
        where: visibility,
        _count: { _all: true }
      }),
      prisma.gestaoOsWorkOrder.count({
        where: {
          ...visibility,
          dueAt: { lt: new Date() },
          status: { in: openStatuses }
        }
      }),
      prisma.gestaoOsWorkOrder.findMany({
        where: {
          ...visibility,
          status: { in: ['COMPLETED', 'CLOSED'] },
          startedAt: { not: null },
          completedAt: { not: null }
        },
        select: { startedAt: true, completedAt: true },
        take: 2000
      }),
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['category'],
        where: visibility,
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 20
      }),
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['buildingId'],
        where: { ...visibility, buildingId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { buildingId: 'desc' } },
        take: 20
      }),
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['assigneeId'],
        where: { ...visibility, assigneeId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { assigneeId: 'desc' } },
        take: 20
      })
    ]);

    let mttrHours: number | null = null;
    if (completed.length) {
      const totalMs = completed.reduce((sum, row) => {
        if (!row.startedAt || !row.completedAt) return sum;
        return sum + (row.completedAt.getTime() - row.startedAt.getTime());
      }, 0);
      mttrHours = Math.round((totalMs / completed.length / (1000 * 60 * 60)) * 10) / 10;
    }

    const buildingIds = byBuilding.map((b) => b.buildingId!).filter(Boolean);
    const assigneeIds = byAssignee.map((a) => a.assigneeId!).filter(Boolean);
    const [buildings, users] = await Promise.all([
      buildingIds.length
        ? prisma.gestaoOsBuilding.findMany({
            where: { id: { in: buildingIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([]),
      assigneeIds.length
        ? prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([])
    ]);
    const buildingMap = new Map(buildings.map((b) => [b.id, b.name]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const backlog = byStatus.reduce((s, g) => s + g._count._all, 0);
    const openLike = byStatus
      .filter((g) => openStatuses.includes(g.status))
      .reduce((s, g) => s + g._count._all, 0);

    return {
      backlog,
      openLike,
      overdue,
      mttrHours,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      byCategory: byCategory.map((g) => ({ category: g.category, count: g._count._all })),
      byBuilding: byBuilding.map((g) => ({
        buildingId: g.buildingId,
        name: buildingMap.get(g.buildingId!) || '—',
        count: g._count._all
      })),
      byTechnician: byAssignee.map((g) => ({
        assigneeId: g.assigneeId,
        name: userMap.get(g.assigneeId!) || '—',
        count: g._count._all
      }))
    };
  }
}

export const gestaoOsReportsService = new GestaoOsReportsService();
