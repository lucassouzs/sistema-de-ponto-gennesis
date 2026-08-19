import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { gestaoOsController } from '../controllers/GestaoOsController';
import { gestaoOsCadastrosController } from '../controllers/GestaoOsCadastrosController';
import { gestaoOsPlansService } from '../services/GestaoOsPlansService';
import { gestaoOsReportsService } from '../services/GestaoOsReportsService';
import { gestaoOsDocumentsService } from '../services/GestaoOsDocumentsService';
import {
  assertCanViewAllWorkOrders,
  pickCompanyIdFromRequest,
  resolveGestaoOsAccess,
  resolveGestaoOsAccessAllowPersonal
} from '../lib/gestaoOsAccess';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

router.use(authenticate);

async function withAccess(req: AuthRequest) {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  return resolveGestaoOsAccess({
    userId: req.user.id,
    isAdmin: !!req.user.isAdmin,
    companyId: pickCompanyIdFromRequest(req)
  });
}

async function withPersonalAccess(req: AuthRequest) {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  return resolveGestaoOsAccessAllowPersonal({
    userId: req.user.id,
    isAdmin: !!req.user.isAdmin,
    companyId: pickCompanyIdFromRequest(req)
  });
}

/** Visão operacional (Central / planos / relatórios) — não basta Meus Chamados. */
async function withOpsAccess(req: AuthRequest) {
  const access = await withAccess(req);
  assertCanViewAllWorkOrders(access);
  return access;
}

function parseReportFilters(req: AuthRequest) {
  const fromRaw = typeof req.query.from === 'string' ? req.query.from : '';
  const toRaw = typeof req.query.to === 'string' ? req.query.to : '';
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00`) : undefined;
  const to = toRaw ? new Date(`${toRaw}T23:59:59`) : undefined;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null,
    buildingId: typeof req.query.buildingId === 'string' ? req.query.buildingId : null,
    origin: typeof req.query.origin === 'string' ? req.query.origin : null,
    assigneeId: typeof req.query.assigneeId === 'string' ? req.query.assigneeId : null,
    teamUserId: typeof req.query.teamUserId === 'string' ? req.query.teamUserId : null,
    unitPortal: req.query.unitPortal === '1' || req.query.unitPortal === 'true'
  };
}

router.get('/me', (req, res, next) => gestaoOsController.myAccess(req, res, next));
router.get('/summary', (req, res, next) => gestaoOsController.summary(req, res, next));
router.get('/locations', (req, res, next) => gestaoOsController.locationTree(req, res, next));
router.get('/technicians', (req, res, next) => gestaoOsController.technicians(req, res, next));

router.get('/stock-materials', async (req: AuthRequest, res, next) => {
  try {
    await withPersonalAccess(req);
    const { prisma } = await import('../lib/prisma');
    const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const data = await prisma.constructionMaterial.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: { id: true, name: true, code: true, unit: true },
      orderBy: { name: 'asc' },
      take: 80
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/inbox', async (req: AuthRequest, res, next) => {
  try {
    const access = await withPersonalAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const data = await gestaoOsOpsService.inbox(access);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/agenda', async (req: AuthRequest, res, next) => {
  try {
    const access = await withPersonalAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const fromRaw = typeof req.query.from === 'string' ? req.query.from : '';
    const toRaw = typeof req.query.to === 'string' ? req.query.to : '';
    const from = fromRaw ? new Date(fromRaw) : new Date();
    const to = toRaw ? new Date(toRaw) : new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const requestedOwner =
      typeof req.query.ownerId === 'string' && req.query.ownerId.trim()
        ? req.query.ownerId.trim()
        : access.userId;
    const canInspectOther = access.canViewAll || access.canMeusChamados || access.isAdmin;
    const ownerUserId =
      !canInspectOther && requestedOwner !== access.userId ? access.userId : requestedOwner;
    const data = await gestaoOsOpsService.agenda(access, { from, to, ownerUserId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/summary', async (req: AuthRequest, res, next) => {
  try {
    const unitPortal = req.query.unitPortal === '1' || req.query.unitPortal === 'true';
    const access = unitPortal ? await withPersonalAccess(req) : await withOpsAccess(req);
    if (unitPortal && access.canViewAll) {
      /* ops also can open unit view */
    }
    const data = await gestaoOsReportsService.summary(access, parseReportFilters(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/geo', async (req: AuthRequest, res, next) => {
  try {
    const unitPortal = req.query.unitPortal === '1' || req.query.unitPortal === 'true';
    const access = unitPortal ? await withPersonalAccess(req) : await withOpsAccess(req);
    const data = await gestaoOsReportsService.geo(access, parseReportFilters(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/export.csv', async (req: AuthRequest, res, next) => {
  try {
    const unitPortal = req.query.unitPortal === '1' || req.query.unitPortal === 'true';
    const access = unitPortal ? await withPersonalAccess(req) : await withOpsAccess(req);
    const csv = await gestaoOsReportsService.exportCsv(access, parseReportFilters(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-os.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get('/reports/workload', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const data = await gestaoOsOpsService.technicianWorkload(access);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/plan-compliance', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const data = await gestaoOsOpsService.planCompliance(access);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/assets/:assetId/history', async (req: AuthRequest, res, next) => {
  try {
    const access = await withAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const data = await gestaoOsOpsService.assetHistory(access, req.params.assetId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/suggest-assignee', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const data = await gestaoOsOpsService.suggestAssignee(access, {
      buildingId: typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/sla/check-warnings', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const { gestaoOsOpsService } = await import('../services/GestaoOsOpsService');
    const { notifyGestaoOsEvent } = await import('../lib/gestaoOsNotify');
    const { prisma } = await import('../lib/prisma');
    const scan = await gestaoOsOpsService.scanSlaAlerts(access);
    let notified = 0;
    for (const row of scan.pendingNotify) {
      const ex = scan.extras.get(row.id);
      const overdue = row.dueAt && row.dueAt.getTime() < Date.now();
      notifyGestaoOsEvent(
        overdue ? 'sla_overdue' : 'sla_warning',
        {
          displayNumber: row.displayNumber,
          osNumber: row.osNumber,
          statusLabel: String(row.status),
          locationLabel: row.locationLabel,
          category: row.category,
          dueAtLabel: row.dueAt ? row.dueAt.toLocaleString('pt-BR') : null
        },
        [row.requester, row.assignee].filter(
          (u): u is { email: string; name: string } => Boolean(u)
        )
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "gestao_os_work_orders" SET "slaWarnedAt" = CURRENT_TIMESTAMP WHERE "id" = '${row.id.replace(
          /'/g,
          "''"
        )}'`
      );
      notified += 1;
      void ex;
    }
    res.json({
      success: true,
      data: { warnings: scan.warnings.length, notified }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const planType = typeof req.query.planType === 'string' ? req.query.planType : undefined;
    const data = await gestaoOsPlansService.listPlans(access, { planType });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.post('/plans', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const data = await gestaoOsPlansService.createPlan(access, req.body ?? {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.patch('/plans/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const data = await gestaoOsPlansService.updatePlan(access, req.params.id, req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.delete('/plans/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const data = await gestaoOsPlansService.deletePlan(access, req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.post('/plans/generate-due', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const data = await gestaoOsPlansService.generateDuePlans(access);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.get('/checklists', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const planType = typeof req.query.planType === 'string' ? req.query.planType : undefined;
    const data = await gestaoOsPlansService.listTemplates(access, planType);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.post('/checklists', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const data = await gestaoOsPlansService.createTemplate(access, req.body ?? {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/documents', async (req: AuthRequest, res, next) => {
  try {
    const access = await withAccess(req);
    const data = await gestaoOsDocumentsService.list(access, {
      buildingId: typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined,
      assetId: typeof req.query.assetId === 'string' ? req.query.assetId : undefined,
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.post('/documents', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const access = await withOpsAccess(req);
    const data = await gestaoOsDocumentsService.create(access, req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.delete('/documents/:id', async (req: AuthRequest, res, next) => {
  try {
    const access = await withOpsAccess(req);
    const data = await gestaoOsDocumentsService.remove(access, req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Cadastros (antes de /:id) ───────────────────────────────────────
router.get('/cadastros/companies', (req, res, next) =>
  gestaoOsCadastrosController.listCompanies(req, res, next)
);
router.post('/cadastros/companies', (req, res, next) =>
  gestaoOsCadastrosController.createCompany(req, res, next)
);
router.patch('/cadastros/companies/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateCompany(req, res, next)
);
router.post('/cadastros/branches', (req, res, next) =>
  gestaoOsCadastrosController.createBranch(req, res, next)
);
router.patch('/cadastros/branches/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateBranch(req, res, next)
);

router.get('/cadastros/my-unit-buildings', (req, res, next) =>
  gestaoOsCadastrosController.myUnitBuildings(req, res, next)
);
router.get('/cadastros/locations', (req, res, next) =>
  gestaoOsCadastrosController.locationTreeAdmin(req, res, next)
);
router.post('/cadastros/buildings', (req, res, next) =>
  gestaoOsCadastrosController.createBuilding(req, res, next)
);
router.patch('/cadastros/buildings/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateBuilding(req, res, next)
);
router.delete('/cadastros/buildings/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteBuilding(req, res, next)
);
router.post('/cadastros/sectors', (req, res, next) =>
  gestaoOsCadastrosController.createSector(req, res, next)
);
router.patch('/cadastros/sectors/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateSector(req, res, next)
);
router.delete('/cadastros/sectors/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteSector(req, res, next)
);
router.post('/cadastros/places', (req, res, next) =>
  gestaoOsCadastrosController.createPlace(req, res, next)
);
router.patch('/cadastros/places/:id', (req, res, next) =>
  gestaoOsCadastrosController.updatePlace(req, res, next)
);
router.delete('/cadastros/places/:id', (req, res, next) =>
  gestaoOsCadastrosController.deletePlace(req, res, next)
);
router.post('/cadastros/assets', (req, res, next) =>
  gestaoOsCadastrosController.createAsset(req, res, next)
);
router.patch('/cadastros/assets/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateAsset(req, res, next)
);
router.delete('/cadastros/assets/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteAsset(req, res, next)
);
router.post('/cadastros/assets/qr-labels', (req, res, next) =>
  gestaoOsCadastrosController.assetQrLabels(req, res, next)
);
router.get('/cadastros/buildings/:id/close-qr', (req, res, next) =>
  gestaoOsCadastrosController.buildingCloseQr(req, res, next)
);
router.get('/cadastros/assets/:id/qr', (req, res, next) =>
  gestaoOsCadastrosController.assetQr(req, res, next)
);
router.get('/cadastros/qr/resolve', (req, res, next) =>
  gestaoOsCadastrosController.resolveQr(req, res, next)
);

router.get('/cadastros/equipments', (req, res, next) =>
  gestaoOsCadastrosController.equipmentCatalog(req, res, next)
);
router.post('/cadastros/equipment-groups', (req, res, next) =>
  gestaoOsCadastrosController.createEquipmentGroup(req, res, next)
);
router.patch('/cadastros/equipment-groups/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateEquipmentGroup(req, res, next)
);
router.delete('/cadastros/equipment-groups/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteEquipmentGroup(req, res, next)
);
router.post('/cadastros/equipment-subgroups', (req, res, next) =>
  gestaoOsCadastrosController.createEquipmentSubgroup(req, res, next)
);
router.patch('/cadastros/equipment-subgroups/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateEquipmentSubgroup(req, res, next)
);
router.delete('/cadastros/equipment-subgroups/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteEquipmentSubgroup(req, res, next)
);
router.post('/cadastros/equipments', (req, res, next) =>
  gestaoOsCadastrosController.createEquipment(req, res, next)
);
router.patch('/cadastros/equipments/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateEquipment(req, res, next)
);
router.delete('/cadastros/equipments/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteEquipment(req, res, next)
);

router.get('/cadastros/providers', (req, res, next) =>
  gestaoOsCadastrosController.listProviders(req, res, next)
);
router.post('/cadastros/providers', (req, res, next) =>
  gestaoOsCadastrosController.createProvider(req, res, next)
);
router.patch('/cadastros/providers/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateProvider(req, res, next)
);

router.get('/cadastros/categories', (req, res, next) =>
  gestaoOsCadastrosController.listCategories(req, res, next)
);
router.post('/cadastros/categories', (req, res, next) =>
  gestaoOsCadastrosController.createCategory(req, res, next)
);
router.patch('/cadastros/categories/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateCategory(req, res, next)
);
router.delete('/cadastros/categories/:id', (req, res, next) =>
  gestaoOsCadastrosController.deleteCategory(req, res, next)
);

router.get('/cadastros/memberships', (req, res, next) =>
  gestaoOsCadastrosController.listMemberships(req, res, next)
);
router.post('/cadastros/memberships', (req, res, next) =>
  gestaoOsCadastrosController.upsertMembership(req, res, next)
);
router.patch('/cadastros/memberships/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateMembership(req, res, next)
);
router.get('/cadastros/users', (req, res, next) =>
  gestaoOsCadastrosController.listUsers(req, res, next)
);
router.get('/cadastros/settings', (req, res, next) =>
  gestaoOsCadastrosController.getSettings(req, res, next)
);
router.patch('/cadastros/settings', (req, res, next) =>
  gestaoOsCadastrosController.updateSettings(req, res, next)
);

router.get('/', (req, res, next) => gestaoOsController.list(req, res, next));

router.post('/upload-attachment', (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
    const saved = await savePersistentUpload({
      folder: 'gestao-os',
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    res.json({
      success: true,
      data: {
        url: saved.url,
        name: req.file.originalname || saved.fileName,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', (req, res, next) => gestaoOsController.create(req, res, next));
router.get('/:id/comments', (req, res, next) => gestaoOsController.listComments(req, res, next));
router.post('/:id/comments', (req, res, next) => gestaoOsController.createComment(req, res, next));
router.delete('/comments/:commentId', (req, res, next) =>
  gestaoOsController.deleteComment(req, res, next)
);
router.get('/:id', (req, res, next) => gestaoOsController.getById(req, res, next));
router.patch('/:id', (req, res, next) => gestaoOsController.update(req, res, next));
router.post('/:id/transition', (req, res, next) => gestaoOsController.transition(req, res, next));
router.post('/:id/atteste', (req, res, next) => gestaoOsController.atteste(req, res, next));

export default router;
