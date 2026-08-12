import { Router } from 'express';
import { Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, requireAdministrator } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { MaterialRequestService } from '../services/MaterialRequestService';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { savePersistentUpload } from '../lib/persistentUpload';
import {
  assertUserCanApproveMaterialRequests,
  assertUserCanApproveMaterialRequestForCostCenter,
  getRmApproverListScopeCostCenterIds,
  isRmApproverStatusChange,
} from '../lib/rmApprovalAccess';
import {
  applyUnbCostCenterScopeToIdFilter,
  assertCostCenterAllowedForUnbUser,
  getUserUnbCostCenterScope,
} from '../lib/unbCostCenterScope';

const router = Router();
const materialRequestService = new MaterialRequestService();

const ALLOWED_RM_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

function normalizeRmPriority(p: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  const s = typeof p === 'string' ? p.trim().toUpperCase() : '';
  if (ALLOWED_RM_PRIORITY.has(s)) return s as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  return 'MEDIUM';
}

/** Garante tipos aceitos pelo Prisma (evita PrismaClientValidationError por string/objeto indevido no anexo) */
function normalizeRmItemBody(item: any) {
  const url = item?.attachmentUrl;
  const name = item?.attachmentName;
  return {
    materialId: item?.materialId,
    quantity: item?.quantity,
    notes: item?.observation ?? item?.notes,
    attachmentUrl:
      typeof url === 'string' && url.trim().length > 0 ? url.trim().slice(0, 2000) : null,
    attachmentName:
      typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, 500) : null
  };
}

const itemAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp|doc|docx|xls|xlsx)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF, imagem ou documento Office (PDF, PNG, JPG, DOC, XLS…)'));
  }
});

// Todas as rotas requerem autenticação
router.use(authenticate);

// Endpoint auxiliar para listar materiais da RM (deve vir antes de /:id)
// Somente Materiais e Serviços (cadastro em /ponto/materiais-construcao); cada um tem espelho em EngineeringMaterial (sinapiCode CM-*)
router.get('/materials', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);

    if (search.length >= 2) {
      const data = await materialRequestService.searchConstructionMaterialsForRmDropdown(search, limit);
      res.json({ success: true, data });
      return;
    }

    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

// Upload de anexo por item (antes de criar/atualizar a RM o front envia o arquivo e usa url/data no body)
router.post("/upload-item-attachment", (req: AuthRequest, res: Response, next: NextFunction) => {
  itemAttachmentUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Erro no upload";
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError("Selecione um arquivo", 400);
    }
    const saved = await savePersistentUpload({
      folder: "material-request-items",
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: req.file.originalname || saved.fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// Listar requisições
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      status,
      approvedBy,
      costCenterId,
      projectId,
      requestedBy,
      priority,
      page = '1',
      limit = '100',
      summary,
      includeItems
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 500);
    const wantItems =
      summary === '1' ||
      summary === 'true' ||
      includeItems === '0' ||
      includeItems === 'false'
        ? false
        : true;

    // Escopo do aprovador (quando não filtra "minhas RMs"); escopo UNB sempre.
    let scopeCostCenterIds: string[] | null = null;
    if (req.user?.id && !requestedBy) {
      scopeCostCenterIds = await getRmApproverListScopeCostCenterIds(
        req.user.id,
        !!req.user.isAdmin,
      );
    }
    if (req.user?.id) {
      const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
      if (unbScope !== null) {
        if (scopeCostCenterIds === null) {
          scopeCostCenterIds = unbScope;
        } else {
          const allowed = new Set(unbScope);
          scopeCostCenterIds = scopeCostCenterIds.filter((id) => allowed.has(id));
        }
      }
    }

    const listFilters: Parameters<MaterialRequestService['listMaterialRequests']>[0] = {
      status: status as string,
      approvedBy: typeof approvedBy === 'string' && approvedBy.trim() ? approvedBy.trim() : undefined,
      costCenterId: costCenterId as string,
      projectId: projectId as string,
      requestedBy: requestedBy as string,
      priority: priority as string,
      page: pageNum,
      limit: limitNum,
      includeItems: wantItems,
    };

    if (scopeCostCenterIds !== null) {
      const scoped = applyUnbCostCenterScopeToIdFilter(
        scopeCostCenterIds,
        typeof costCenterId === 'string' ? costCenterId : undefined,
      );
      if (scoped.denyAll) {
        res.json({
          success: true,
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 },
        });
        return;
      }
      if (scoped.costCenterId) {
        listFilters.costCenterId = scoped.costCenterId;
        delete listFilters.costCenterIds;
      } else if (scoped.costCenterIds?.length) {
        listFilters.costCenterIds = scoped.costCenterIds;
        delete listFilters.costCenterId;
      }
    }

    const result = await materialRequestService.listMaterialRequests(listFilters);

    res.json({
      success: true,
      data: result.requests,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

// Criar requisição de material
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      throw createError('Usuário não autenticado', 401);
    }

    const { costCenterId, projectId, serviceOrderId, serviceOrder, obra, description, priority, demandSheet, demandSheetAttachmentUrl, demandSheetAttachmentName, demandSheetAttachments, items } =
      req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    await assertCostCenterAllowedForUnbUser(req.user.id, !!req.user.isAdmin, costCenterId);

    const request = await materialRequestService.createMaterialRequest({
      requestedBy: req.user.id,
      costCenterId,
      projectId,
      serviceOrderId,
      serviceOrder,
      obra,
      description,
      priority: priority || 'MEDIUM',
      demandSheet,
      demandSheetAttachmentUrl,
      demandSheetAttachmentName,
      demandSheetAttachments,
      items: items.map((item: any) => ({
        materialId: item.materialId,
        quantity: item.quantity,
        notes: item.observation || item.notes,
        attachmentUrl: item.attachmentUrl || null,
        attachmentName: item.attachmentName || null
      }))
    });

    res.status(201).json({
      success: true,
      data: request,
      message: 'Requisição de material criada com sucesso'
    });
  } catch (error) {
    // Não engolir erros Prisma (ex.: P2002 Unique) — o errorHandler mapeia P2002 → 409.
    // O regex antigo batia em "materialRequest" na mensagem do Prisma e devolvia 400 + stack.
    const isPrisma =
      error instanceof Error &&
      (error.name === 'PrismaClientKnownRequestError' ||
        error.name === 'PrismaClientValidationError');
    if (
      !isPrisma &&
      error instanceof Error &&
      /obrigat|necessário|material|Quantidade|centro de custo|ordem de serviço|projeto|anexo|ficha de demanda|observação/i.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Atualizar status da requisição (antes de GET /:id para não capturar "status" como id)
router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const { status } = req.body;

    const existing = await prisma.materialRequest.findUnique({ where: { id } });
    if (!existing) throw createError('Requisição não encontrada', 404);

    await assertCostCenterAllowedForUnbUser(
      req.user.id,
      !!req.user.isAdmin,
      existing.costCenterId,
    );

    if (isRmApproverStatusChange(status, existing.requestedBy, req.user.id)) {
      await assertUserCanApproveMaterialRequests(req.user.id, req.user.isAdmin);
      await assertUserCanApproveMaterialRequestForCostCenter(
        req.user.id,
        !!req.user.isAdmin,
        existing.costCenterId,
      );
    }

    const request = await materialRequestService.updateMaterialRequestStatus(id, {
      status,
      approvedBy: status === 'APPROVED' ? req.user.id : undefined,
      rejectedBy: undefined,
      rejectionReason: undefined
    }, req.user.id);
    res.json({ success: true, data: request, message: 'Status atualizado' });
  } catch (error) {
    if (error instanceof Error && /Apenas |Aprove apenas|Não é possível cancelar|Sem permissão/.test(error.message)) {
      const status = /Sem permissão/.test(error.message) ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Editar RM em Correção RM (solicitante) — body igual ao POST, + submitForApproval opcional
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const {
      costCenterId,
      projectId,
      serviceOrderId,
      serviceOrder,
      obra,
      description,
      priority,
      demandSheet,
      demandSheetAttachmentUrl,
      demandSheetAttachmentName,
      demandSheetAttachments,
      items,
      submitForApproval,
    } = req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    await assertCostCenterAllowedForUnbUser(req.user.id, !!req.user.isAdmin, costCenterId);

    const request = await materialRequestService.updateMaterialRequestInCorrection(id, req.user.id, {
      costCenterId,
      projectId,
      serviceOrderId,
      serviceOrder,
      obra,
      description,
      priority:
        priority === undefined || priority === null
          ? undefined
          : normalizeRmPriority(priority),
      items: items.map((item: any) => normalizeRmItemBody(item)),
      demandSheet,
      demandSheetAttachmentUrl,
      demandSheetAttachmentName,
      demandSheetAttachments,
      submitForApproval: Boolean(submitForApproval)
    });

    res.json({
      success: true,
      data: request,
      message: submitForApproval
        ? 'Requisição atualizada e reenviada para análise'
        : 'Requisição atualizada'
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /Apenas o solicitante|Só é possível editar|Centro de custo|É necessário|material|Quantidade|projeto/i.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Comentários da RM (antes de GET /:id)
router.get('/:id/comments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const request = await materialRequestService.getMaterialRequestById(id);
    if (!request) throw createError('Requisição não encontrada', 404);
    await assertCostCenterAllowedForUnbUser(req.user.id, !!req.user.isAdmin, request.costCenterId);
    const comments = await materialRequestService.listComments(id);
    res.json({ success: true, data: comments });
  } catch (error) {
    if (error instanceof Error && /não encontrada/i.test(error.message)) {
      res.status(404).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.post('/:id/comments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const request = await materialRequestService.getMaterialRequestById(id);
    if (!request) throw createError('Requisição não encontrada', 404);
    await assertCostCenterAllowedForUnbUser(req.user.id, !!req.user.isAdmin, request.costCenterId);
    const comment = await materialRequestService.createComment(id, req.user.id, content);
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    if (
      error instanceof Error &&
      /não encontrada|Escreva um comentário|muito longo/i.test(error.message)
    ) {
      const status = /não encontrada/i.test(error.message) ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.delete('/comments/:commentId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await materialRequestService.deleteComment(
      req.params.commentId,
      req.user.id,
      !!req.user.isAdmin
    );
    res.json({ success: true, message: 'Comentário excluído' });
  } catch (error) {
    if (error instanceof Error && /não encontrado|Sem permissão/i.test(error.message)) {
      const status = /Sem permissão/i.test(error.message) ? 403 : 404;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Obter requisição por ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const request = await materialRequestService.getMaterialRequestById(id);

    if (!request) {
      throw createError('Requisição não encontrada', 404);
    }

    if (req.user?.id) {
      await assertCostCenterAllowedForUnbUser(
        req.user.id,
        !!req.user.isAdmin,
        request.costCenterId,
      );
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
});

/** Administrador: troca anexos da ficha de demanda (lista completa). */
router.patch(
  '/:id/admin/demand-sheet-attachments',
  requireAdministrator,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const raw = req.body?.attachments;
      if (!Array.isArray(raw)) {
        throw createError('Informe a lista de anexos', 400);
      }
      const attachments = raw.map((file: { url?: unknown; name?: unknown }) => ({
        url: String(file?.url || '').trim(),
        name: String(file?.name || '').trim() || 'Arquivo anexado',
      }));
      const request = await materialRequestService.adminReplaceDemandSheetAttachments(
        id,
        attachments
      );
      res.json({ success: true, data: request, message: 'Anexos atualizados' });
    } catch (error) {
      if (error instanceof Error && /não encontrada/i.test(error.message)) {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
);

/** Administrador: troca o anexo de um item da RM. */
router.patch(
  '/:id/items/:itemId/admin/attachment',
  requireAdministrator,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id, itemId } = req.params;
      const urlRaw = req.body?.url;
      const nameRaw = req.body?.name;
      const url =
        urlRaw === null || urlRaw === undefined || String(urlRaw).trim() === ''
          ? null
          : String(urlRaw).trim();
      const request = await materialRequestService.adminReplaceItemAttachment(id, itemId, {
        url,
        name: nameRaw === null || nameRaw === undefined ? null : String(nameRaw),
      });
      res.json({ success: true, data: request, message: 'Anexo do item atualizado' });
    } catch (error) {
      if (error instanceof Error && /não encontrado/i.test(error.message)) {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
);

export default router;
