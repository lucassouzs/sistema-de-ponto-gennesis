import express from 'express';
import { Prisma } from '@prisma/client';
import { PERMISSION_ACCESS_ACTION, PERMISSION_MODULES } from '@sistema-ponto/permission-modules';
import {
  authenticate,
  requireAdministrator,
  requirePermissionManagerOrAdministrator,
  AuthRequest,
} from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { filterValidPermissionPayload, removeOrphanUserPermissions } from '../lib/permissionRegistrySync';
import { CONTRACTS_MODULE_KEY } from '../lib/contractAccess';

const router = express.Router();

const MODULES = PERMISSION_MODULES.map((m) => ({ key: m.key, name: m.name, href: m.href }));

type PositionTemplateDelegate = {
  findMany: (args: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  upsert: (args: any) => Promise<any>;
};

function getPositionTemplateDelegate(): PositionTemplateDelegate | null {
  const delegate = (prisma as any).positionPermissionTemplate as PositionTemplateDelegate | undefined;
  return delegate ?? null;
}

router.use(authenticate);

router.get('/contracts', requirePermissionManagerOrAdministrator, async (_req, res, next) => {
  try {
    const contracts = await prisma.contract.findMany({
      select: { id: true, name: true, number: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: contracts });
  } catch (e) {
    return next(e);
  }
});

router.get('/modules', async (_req, res, next) => {
  try {
    await removeOrphanUserPermissions();
    return res.json({
      success: true,
      data: {
        modules: MODULES,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.get('/me', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw createError('Usuário não autenticado', 401);
    }

    if (req.user.isAdmin) {
      return res.json({
        success: true,
        data: {
          isAdmin: true,
          permissions: [],
          allowedContractIds: [],
          dpApprovalContractIds: [],
          contractModuleFlags: {},
        },
      });
    }

    const permissions = await prisma.userPermission.findMany({
      where: { userId: req.user.id, allowed: true },
      select: {
        module: true,
        action: true,
      },
    });

    const allowedContractIds = await prisma.userContractPermission.findMany({
      where: { userId: req.user.id },
      select: {
        contractId: true,
        accessOrcamento: true,
        accessRelatorios: true,
        accessOrdemServico: true,
        accessProducaoSemanal: true,
      },
    });

    const dpApprovalContractIds = await prisma.userDpApprovalContract.findMany({
      where: { userId: req.user.id },
      select: { contractId: true },
    });

    const contractModuleFlags: Record<
      string,
      {
        orcamento: boolean;
        relatorios: boolean;
        ordemServico: boolean;
        producaoSemanal: boolean;
      }
    > = {};
    for (const r of allowedContractIds) {
      contractModuleFlags[r.contractId] = {
        orcamento: r.accessOrcamento,
        relatorios: r.accessRelatorios,
        ordemServico: r.accessOrdemServico,
        producaoSemanal: r.accessProducaoSemanal,
      };
    }

    return res.json({
      success: true,
      data: {
        isAdmin: false,
        permissions,
        allowedContractIds: allowedContractIds.map((r) => r.contractId),
        dpApprovalContractIds: dpApprovalContractIds.map((r) => r.contractId),
        contractModuleFlags,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', requirePermissionManagerOrAdministrator, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            position: true,
            department: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/contract-users', requirePermissionManagerOrAdministrator, async (req, res, next) => {
  try {
    const contractId = String(req.query?.contractId || '').trim();
    if (!contractId) {
      throw createError('Parâmetro contractId é obrigatório', 400);
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) {
      throw createError('Contrato não encontrado', 404);
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        employee: { is: { position: { not: 'Administrador' } } },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        employee: {
          select: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (users.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const userIds = users.map((u) => u.id);
    const contractsModuleRows = await prisma.userPermission.findMany({
      where: {
        userId: { in: userIds },
        module: CONTRACTS_MODULE_KEY,
        allowed: true,
      },
      select: { userId: true, action: true },
    });
    const contractAccessRows = await prisma.userContractPermission.findMany({
      where: {
        userId: { in: userIds },
        contractId,
      },
      select: { userId: true },
    });

    const hasContractsModuleByUser = new Set<string>(
      contractsModuleRows.filter((r) => r.action === PERMISSION_ACCESS_ACTION).map((r) => r.userId)
    );
    const hasContractAccessByUser = new Set<string>(contractAccessRows.map((r) => r.userId));

    return res.json({
      success: true,
      data: users.map((u) => ({
        ...u,
        hasContractsModule: hasContractsModuleByUser.has(u.id),
        hasContractAccess: hasContractAccessByUser.has(u.id),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users/:userId', requirePermissionManagerOrAdministrator, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            position: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw createError('Usuário não encontrado', 404);
    }

    const isAdmin = (targetUser.employee?.position || '').toLowerCase() === 'administrador';

    const permissions = isAdmin
      ? []
      : await prisma.userPermission.findMany({
          where: { userId, allowed: true },
          select: { module: true, action: true },
        });

    const contractPermRows = isAdmin
      ? []
      : await prisma.userContractPermission.findMany({
          where: { userId },
          select: {
            contractId: true,
            accessOrcamento: true,
            accessRelatorios: true,
            accessOrdemServico: true,
            accessProducaoSemanal: true,
          },
        });

    const dpApprovalContractIds = isAdmin
      ? []
      : await prisma.userDpApprovalContract.findMany({
          where: { userId },
          select: { contractId: true },
        });

    const contractModuleFlags: Record<string, {
      orcamento: boolean; relatorios: boolean; ordemServico: boolean; producaoSemanal: boolean;
    }> = {};
    for (const r of contractPermRows) {
      contractModuleFlags[r.contractId] = {
        orcamento: r.accessOrcamento,
        relatorios: r.accessRelatorios,
        ordemServico: r.accessOrdemServico,
        producaoSemanal: r.accessProducaoSemanal,
      };
    }

    return res.json({
      success: true,
      data: {
        user: targetUser,
        isAdmin,
        permissions,
        allowedContractIds: contractPermRows.map((r) => r.contractId),
        dpApprovalContractIds: dpApprovalContractIds.map((r) => r.contractId),
        contractModuleFlags,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/users/:userId', requirePermissionManagerOrAdministrator, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const receivedPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const rawContractIds = req.body?.allowedContractIds;
    const shouldSyncContracts = Array.isArray(rawContractIds);
    const rawDpApproval = req.body?.dpApprovalContractIds;
    const shouldSyncDpApproval = Array.isArray(rawDpApproval);
    type ContractFlags = { orcamento?: boolean; relatorios?: boolean; ordemServico?: boolean; producaoSemanal?: boolean };
    const rawModuleFlags: Record<string, ContractFlags> =
      req.body?.contractModuleFlags && typeof req.body.contractModuleFlags === 'object'
        ? (req.body.contractModuleFlags as Record<string, ContractFlags>)
        : {};

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employee: {
          select: {
            position: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw createError('Usuário não encontrado', 404);
    }

    const isAdmin = (targetUser.employee?.position || '').toLowerCase() === 'administrador';
    if (isAdmin) {
      throw createError('Administrador possui acesso total automático e não pode ser editado', 400);
    }

    const rawPayload = filterValidPermissionPayload(
      receivedPermissions
        .map((p: any) => {
          if (typeof p === 'string') return { module: p };
          if (typeof p?.module === 'string') return { module: p.module, action: p.action };
          return null;
        })
        .filter(Boolean) as Array<{ module: string; action?: string }>
    );
    const normalized = Array.from(
      new Map(rawPayload.map((p) => [`${p.module}:${p.action}`, p])).values()
    );

    let contractIdsToSave: string[] = [];
    if (shouldSyncContracts) {
      contractIdsToSave = rawContractIds.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      const hasContractsModule = normalized.some((p) => p.module === CONTRACTS_MODULE_KEY);
      if (contractIdsToSave.length > 0 && !hasContractsModule) {
        throw createError(
          'Marque a permissão do módulo Contratos antes de autorizar contratos específicos',
          400
        );
      }
      if (contractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: contractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        contractIdsToSave = contractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let dpApprovalIdsToSave: string[] = [];
    if (shouldSyncDpApproval) {
      dpApprovalIdsToSave = rawDpApproval.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      if (dpApprovalIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: dpApprovalIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => ok.has(id));
      }
      let allowedContractSet: Set<string>;
      if (shouldSyncContracts) {
        allowedContractSet = new Set(contractIdsToSave);
      } else {
        const cur = await prisma.userContractPermission.findMany({
          where: { userId },
          select: { contractId: true },
        });
        allowedContractSet = new Set(cur.map((r) => r.contractId));
      }
      dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => allowedContractSet.has(id));
    }

    await prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({
        where: { userId },
      });

      if (normalized.length > 0) {
        await tx.userPermission.createMany({
          data: normalized.map((p) => ({
            userId,
            module: p.module,
            action: p.action,
            allowed: true,
            updatedBy: req.user!.id,
          })),
        });
      }

      if (shouldSyncContracts) {
        await tx.userContractPermission.deleteMany({ where: { userId } });
        if (contractIdsToSave.length > 0) {
          await tx.userContractPermission.createMany({
            data: contractIdsToSave.map((contractId) => {
              const flags = rawModuleFlags[contractId] ?? {};
              return {
                userId,
                contractId,
                updatedBy: req.user!.id,
                accessOrcamento: flags.orcamento !== false,
                accessRelatorios: flags.relatorios !== false,
                accessOrdemServico: flags.ordemServico !== false,
                accessProducaoSemanal: flags.producaoSemanal !== false,
              };
            }),
          });
        }
      }

      if (shouldSyncDpApproval) {
        await tx.userDpApprovalContract.deleteMany({ where: { userId } });
        if (dpApprovalIdsToSave.length > 0) {
          await tx.userDpApprovalContract.createMany({
            data: dpApprovalIdsToSave.map((contractId) => ({
              userId,
              contractId,
              updatedBy: req.user!.id,
            })),
          });
        }
      }
    });

    return res.json({
      success: true,
      message: 'Permissões atualizadas com sucesso',
    });
  } catch (error) {
    return next(error);
  }
});

function slugifyPositionLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Cargos distintos cadastrados (exceto Administrador), para templates por cargo. */
router.get('/positions', requireAdministrator, async (_req, res, next) => {
  try {
    const rows = await prisma.employee.findMany({
      select: { position: true },
      where: { position: { not: 'Administrador' } },
    });
    const uniq = [...new Set(rows.map((r) => r.position).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    return res.json({ success: true, data: uniq });
  } catch (e) {
    return next(e);
  }
});

/** Lista de cargos com contagem de permissões no template (para tabela na UI). */
router.get('/position-summaries', requireAdministrator, async (_req, res, next) => {
  try {
    const rows = await prisma.employee.findMany({
      select: { position: true },
      where: { position: { not: 'Administrador' } },
    });
    const positions = [...new Set(rows.map((r) => r.position).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    const positionTemplates = getPositionTemplateDelegate();
    if (!positionTemplates) {
      return res.json({ success: true, data: positions.map((position) => ({
        position,
        slug: slugifyPositionLabel(position) || 'cargo',
        permissionCount: 0,
        contractsAllowed: 0,
      })) });
    }
    const templates = await positionTemplates.findMany({
      select: { position: true, permissions: true, allowedContractIds: true },
    });
    const byPos = new Map(templates.map((t) => [t.position, t]));
    const data = positions.map((position) => {
      const t = byPos.get(position);
      const perms = t?.permissions;
      const permissionCount = Array.isArray(perms) ? perms.length : 0;
      const idsRaw = t?.allowedContractIds;
      const contractsAllowed = Array.isArray(idsRaw) ? idsRaw.filter((x): x is string => typeof x === 'string').length : 0;
      return {
        position,
        slug: slugifyPositionLabel(position) || 'cargo',
        permissionCount,
        contractsAllowed,
      };
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
});

router.get('/position-template', requireAdministrator, async (req, res, next) => {
  try {
    const position = String(req.query.position ?? '').trim();
    if (!position) {
      throw createError('Parâmetro position é obrigatório', 400);
    }
    const positionTemplates = getPositionTemplateDelegate();
    if (!positionTemplates) {
      return res.json({
        success: true,
        data: {
          position,
          permissions: [],
          allowedContractIds: [],
          dpApprovalContractIds: [],
          contractModuleFlags: {},
        },
      });
    }
    const row = await positionTemplates.findUnique({
      where: { position },
    });
    if (!row) {
      return res.json({
        success: true,
        data: {
          position,
          permissions: [],
          allowedContractIds: [],
          dpApprovalContractIds: [],
          contractModuleFlags: {},
        },
      });
    }
    const perms = row.permissions;
    const permissions = Array.isArray(perms) ? perms : [];
    const idsRaw = row.allowedContractIds;
    const allowedContractIds = Array.isArray(idsRaw)
      ? idsRaw.filter((x): x is string => typeof x === 'string')
      : [];
    const idsRawDp = (row as { dpApprovalContractIds?: unknown }).dpApprovalContractIds;
    const dpApprovalContractIds = Array.isArray(idsRawDp)
      ? idsRawDp.filter((x): x is string => typeof x === 'string')
      : [];
    const rawFlags = (row as { contractModuleFlags?: unknown }).contractModuleFlags;
    const contractModuleFlags =
      rawFlags && typeof rawFlags === 'object' && !Array.isArray(rawFlags)
        ? (rawFlags as Record<string, unknown>)
        : {};
    return res.json({
      success: true,
      data: {
        position,
        permissions,
        allowedContractIds,
        dpApprovalContractIds,
        contractModuleFlags,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.put('/position-template', requireAdministrator, async (req: AuthRequest, res, next) => {
  try {
    const positionTemplates = getPositionTemplateDelegate();
    if (!positionTemplates) {
      throw createError(
        'Modelo de template por cargo indisponível. Rode as migrações e gere o Prisma Client.',
        500
      );
    }
    const position = String(req.body?.position ?? '').trim();
    if (!position) {
      throw createError('Cargo (position) é obrigatório', 400);
    }
    if (position.toLowerCase() === 'administrador') {
      throw createError('Não é possível definir template para o cargo Administrador', 400);
    }
    const receivedPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const rawContractIds = req.body?.allowedContractIds;
    const shouldSyncContracts = Array.isArray(rawContractIds);
    const rawDpApproval = req.body?.dpApprovalContractIds;
    const shouldSyncDpApproval = Array.isArray(rawDpApproval);
    type PosContractFlags = { orcamento?: boolean; relatorios?: boolean; ordemServico?: boolean; producaoSemanal?: boolean };
    const rawModuleFlagsPos: Record<string, PosContractFlags> =
      req.body?.contractModuleFlags && typeof req.body.contractModuleFlags === 'object'
        ? (req.body.contractModuleFlags as Record<string, PosContractFlags>)
        : {};

    const rawPayload = filterValidPermissionPayload(
      receivedPermissions
        .map((p: any) => {
          if (typeof p === 'string') return { module: p };
          if (typeof p?.module === 'string') return { module: p.module, action: p.action };
          return null;
        })
        .filter(Boolean) as Array<{ module: string; action?: string }>
    );
    const normalized = Array.from(
      new Map(rawPayload.map((p) => [`${p.module}:${p.action}`, p])).values()
    );

    let contractIdsToSave: string[] = [];
    if (shouldSyncContracts) {
      contractIdsToSave = rawContractIds.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      const hasContractsModule = normalized.some((p) => p.module === CONTRACTS_MODULE_KEY);
      if (contractIdsToSave.length > 0 && !hasContractsModule) {
        throw createError(
          'Marque a permissão do módulo Contratos antes de autorizar contratos específicos',
          400
        );
      }
      if (contractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: contractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        contractIdsToSave = contractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let dpApprovalIdsToSave: string[] = [];
    if (shouldSyncDpApproval) {
      dpApprovalIdsToSave = rawDpApproval.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      if (dpApprovalIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: dpApprovalIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => ok.has(id));
      }
      let allowedTemplateContracts: Set<string>;
      if (shouldSyncContracts) {
        allowedTemplateContracts = new Set(contractIdsToSave);
      } else {
        const row = await positionTemplates.findUnique({
          where: { position },
          select: { allowedContractIds: true },
        });
        const raw = row?.allowedContractIds;
        allowedTemplateContracts = new Set(
          Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
        );
      }
      dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => allowedTemplateContracts.has(id));
    }

    // Monta flags de módulo por contrato para salvar no JSON
    const builtModuleFlags: Record<string, { orcamento: boolean; relatorios: boolean; ordemServico: boolean; producaoSemanal: boolean }> = {};
    for (const contractId of contractIdsToSave) {
      const f = rawModuleFlagsPos[contractId] ?? {};
      builtModuleFlags[contractId] = {
        orcamento: f.orcamento !== false,
        relatorios: f.relatorios !== false,
        ordemServico: f.ordemServico !== false,
        producaoSemanal: f.producaoSemanal !== false,
      };
    }

    const permissionsJson = normalized as unknown as Prisma.InputJsonValue;
    const contractIdsJson = (shouldSyncContracts ? contractIdsToSave : []) as unknown as Prisma.InputJsonValue;
    const dpApprovalJson = (shouldSyncDpApproval ? dpApprovalIdsToSave : []) as unknown as Prisma.InputJsonValue;
    const moduleFlagsJson = builtModuleFlags as unknown as Prisma.InputJsonValue;

    await positionTemplates.upsert({
      where: { position },
      create: {
        position,
        permissions: permissionsJson,
        allowedContractIds: contractIdsJson,
        dpApprovalContractIds: dpApprovalJson,
        contractModuleFlags: moduleFlagsJson,
      },
      update: {
        permissions: permissionsJson,
        allowedContractIds: contractIdsJson,
        ...(shouldSyncDpApproval ? { dpApprovalContractIds: dpApprovalJson } : {}),
        ...(shouldSyncContracts ? { contractModuleFlags: moduleFlagsJson } : {}),
      },
    });

    return res.json({
      success: true,
      message: 'Template de cargo atualizado',
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
