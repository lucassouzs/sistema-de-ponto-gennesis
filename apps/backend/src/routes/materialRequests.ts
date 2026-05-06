import { Router } from 'express';
import { Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { MaterialRequestService } from '../services/MaterialRequestService';
import { createError } from '../middleware/errorHandler';
import { backendUploadsRoot } from '../lib/uploads';

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
// Somente Materiais de Construção (cadastro em /ponto/materiais-construcao); cada um tem espelho em EngineeringMaterial (sinapiCode CM-*)
router.get('/materials', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await materialRequestService.listConstructionMaterialsForRmDropdown();
    res.json({ success: true, data });
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
    const uploadsDir = path.join(backendUploadsRoot, "material-request-items");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || "") || ".bin";
    const safeExt = ext.length <= 8 ? ext : ".bin";
    const fileName = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/material-request-items/${fileName}`,
        originalName: req.file.originalname || fileName
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
      costCenterId,
      projectId,
      requestedBy,
      priority,
      page = '1',
      limit = '500'
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 500, 1), 500);

    const result = await materialRequestService.listMaterialRequests({
      status: status as string,
      costCenterId: costCenterId as string,
      projectId: projectId as string,
      requestedBy: requestedBy as string,
      priority: priority as string,
      page: pageNum,
      limit: limitNum
    });

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

    const { costCenterId, projectId, serviceOrder, obra, description, priority, items } = req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    const request = await materialRequestService.createMaterialRequest({
      requestedBy: req.user.id,
      costCenterId,
      projectId,
      serviceOrder,
      obra,
      description,
      priority: priority || 'MEDIUM',
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
    next(error);
  }
});

// Atualizar status da requisição (antes de GET /:id para não capturar "status" como id)
router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const { status } = req.body;
    const request = await materialRequestService.updateMaterialRequestStatus(id, {
      status,
      approvedBy: status === 'APPROVED' ? req.user.id : undefined,
      rejectedBy: undefined,
      rejectionReason: undefined
    }, req.user.id);
    res.json({ success: true, data: request, message: 'Status atualizado' });
  } catch (error) {
    if (error instanceof Error && /Apenas |Aprove apenas|Não é possível cancelar/.test(error.message)) {
      res.status(400).json({ success: false, message: error.message });
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
    const { costCenterId, projectId, serviceOrder, obra, description, priority, items, submitForApproval } = req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    const request = await materialRequestService.updateMaterialRequestInCorrection(id, req.user.id, {
      costCenterId,
      projectId,
      serviceOrder,
      obra,
      description,
      priority:
        priority === undefined || priority === null
          ? undefined
          : normalizeRmPriority(priority),
      items: items.map((item: any) => normalizeRmItemBody(item)),
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

// Obter requisição por ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const request = await materialRequestService.getMaterialRequestById(id);

    if (!request) {
      throw createError('Requisição não encontrada', 404);
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
});

export default router;
