import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import {
  getDpManagerApprovalVisibilityWhere,
  getManagerDpApprovalContractScope,
} from '../lib/dpApprovalAccess';
import { admTstManagerApprovalExclusionWhere } from '../lib/dpRequestAdmTst';
import { getManagerFuelApprovalContractScope } from '../lib/fuelApprovalAccess';
import {
  userHasOcComprasApprovePermission,
  userHasOcDiretoriaApprovePermission,
  userHasOcGestorApprovePermission,
  getOcGestorApproverListScopeCostCenterIds,
} from '../lib/ocApprovalAccess';
import { userHasRmApprovePermission } from '../lib/rmApprovalAccess';
import { getContractGestorListScopeCostCenterIds } from '../lib/contractGestorApprovalAccess';
import { fuelRefuelRequestService } from '../services/FuelRefuelRequestService';

const ESPELHO_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-espelho-nf');

function mapManagerScopeToFdWhere(
  scope: Record<string, unknown> | null,
): Prisma.DemandSheetApprovalWhereInput {
  if (!scope || Object.keys(scope).length === 0) return {};
  const contractFilter = scope.contractId as { in?: string[] } | undefined;
  if (contractFilter?.in?.length) {
    return { contratoId: { in: contractFilter.in } };
  }
  return {};
}

function mapManagerScopeToFuelWhere(
  scope: Record<string, unknown>,
): Prisma.FuelRefuelRequestWhereInput {
  const contractId = scope.contractId as { in: string[] } | undefined;
  if (contractId?.in?.length) return { contractId };
  return {};
}

async function userHasEspelhoApprovePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: ESPELHO_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

export class ApprovalNotificationController {
  async getNotificationCounts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const userId = req.user.id;
      const isAdmin = req.user.isAdmin;

      let dp = 0;
      const dpVisibility = await getDpManagerApprovalVisibilityWhere(userId, isAdmin);
      if (dpVisibility !== null) {
        dp = await prisma.dpRequest.count({
          where: {
            AND: [
              { status: 'WAITING_MANAGER' },
              dpVisibility as Prisma.DpRequestWhereInput,
              admTstManagerApprovalExclusionWhere(),
            ],
          },
        });
      }

      const dpScope = await getManagerDpApprovalContractScope(userId, isAdmin);

      let fd = 0;
      if (dpScope !== null) {
        const managerScope = mapManagerScopeToFdWhere(dpScope);
        fd = await prisma.demandSheetApproval.count({
          where: { status: 'WAITING_MANAGER', ...managerScope },
        });
      }

      let fuel = 0;
      const fuelScope = await getManagerFuelApprovalContractScope(userId, isAdmin);
      if (fuelScope !== null) {
        fuel = await fuelRefuelRequestService.countPendingManager(
          mapManagerScopeToFuelWhere(fuelScope),
        );
      }

      let oc = 0;
      if (isAdmin || (await userHasOcComprasApprovePermission(userId))) {
        oc += await prisma.purchaseOrder.count({
          where: { status: { in: ['PENDING_COMPRAS', 'DRAFT'] } },
        });
      }
      if (isAdmin || (await userHasOcGestorApprovePermission(userId))) {
        const gestorScope = await getOcGestorApproverListScopeCostCenterIds(userId, isAdmin);
        const gestorWhere: Prisma.PurchaseOrderWhereInput = { status: 'PENDING' };
        if (gestorScope !== null) {
          gestorWhere.materialRequest = { costCenterId: { in: gestorScope } };
        }
        oc += await prisma.purchaseOrder.count({ where: gestorWhere });
      }
      if (isAdmin || (await userHasOcDiretoriaApprovePermission(userId))) {
        oc += await prisma.purchaseOrder.count({
          where: { status: 'PENDING_DIRETORIA' },
        });
      }

      let rm = 0;
      if (isAdmin || (await userHasRmApprovePermission(userId))) {
        const rmScope = await getContractGestorListScopeCostCenterIds(
          userId,
          isAdmin,
          pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais'),
        );
        const rmWhere: Prisma.MaterialRequestWhereInput = { status: 'PENDING' };
        if (rmScope !== null) {
          rmWhere.costCenterId = { in: rmScope };
        }
        rm = await prisma.materialRequest.count({ where: rmWhere });
      }

      let espelhoMirrors = 0;
      if (isAdmin || (await userHasEspelhoApprovePermission(userId))) {
        espelhoMirrors = await prisma.espelhoNfMirror.count();
      }

      const data = {
        dp,
        fd,
        fuel,
        oc,
        rm,
        espelhoMirrors,
        total: dp + fd + fuel + oc + rm,
      };

      return res.json({ success: true, data });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao buscar notificações de aprovações' });
    }
  }
}

export const approvalNotificationController = new ApprovalNotificationController();
