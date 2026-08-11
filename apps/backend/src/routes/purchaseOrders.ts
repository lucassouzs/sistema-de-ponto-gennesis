import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { PurchaseOrderService } from '../services/PurchaseOrderService';
import { createError } from '../middleware/errorHandler';
import { backendUploadsRoot } from '../lib/uploads';
import {
  assertOcFlowStatusChange,
  assertUserHasOcModule,
  getOcGestorApproverListScopeCostCenterIds,
  OC_TAB_ATTACH_BOLETO_KEY,
  OC_TAB_ATTACH_NF_KEY,
  OC_TAB_PAYMENT_KEY,
  OC_TAB_PROOF_CORRECTION_KEY,
} from '../lib/ocApprovalAccess';
import {
  applyUnbCostCenterScopeToIdFilter,
  getUserUnbCostCenterScope,
} from '../lib/unbCostCenterScope';

const router = Router();
const service = new PurchaseOrderService();

const boletoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF ou imagem (PNG, JPG, WEBP)'));
  }
});

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const {
      status,
      supplierId,
      materialRequestId,
      costCenterId,
      serviceOrderId,
      serviceOrderText,
      page,
      limit,
      orderDateFrom,
      orderDateTo,
      q,
      includeItems,
      summary
    } = req.query;
    const wantItems =
      summary === '1' ||
      summary === 'true' ||
      includeItems === '0' ||
      includeItems === 'false'
        ? false
        : true;

    const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
    let scopeCostCenterIds: string[] | null = await getOcGestorApproverListScopeCostCenterIds(
      req.user.id,
      !!req.user.isAdmin,
    );
    if (unbScope !== null) {
      if (scopeCostCenterIds === null) {
        scopeCostCenterIds = unbScope;
      } else {
        const allowed = new Set(unbScope);
        scopeCostCenterIds = scopeCostCenterIds.filter((id) => allowed.has(id));
      }
    }

    const scoped = applyUnbCostCenterScopeToIdFilter(
      scopeCostCenterIds,
      typeof costCenterId === 'string' ? costCenterId : undefined,
    );
    if (scoped.denyAll) {
      res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      return;
    }

    const result = await service.list({
      status: status as string,
      supplierId: supplierId as string,
      materialRequestId: materialRequestId as string,
      costCenterId: scoped.costCenterId,
      costCenterIds: scoped.costCenterIds,
      serviceOrderId: typeof serviceOrderId === 'string' ? serviceOrderId : undefined,
      serviceOrderText: typeof serviceOrderText === 'string' ? serviceOrderText : undefined,
      orderDateFrom: typeof orderDateFrom === 'string' ? orderDateFrom : undefined,
      orderDateTo: typeof orderDateTo === 'string' ? orderDateTo : undefined,
      q: typeof q === 'string' ? q : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
      includeItems: wantItems
    });
    res.json({ success: true, data: result.orders, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

router.get('/export-finalized-csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { supplierId, costCenterId, orderDateFrom, orderDateTo, q } = req.query;
    const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
    let scopeCostCenterIds: string[] | null = await getOcGestorApproverListScopeCostCenterIds(
      req.user.id,
      !!req.user.isAdmin,
    );
    if (unbScope !== null) {
      if (scopeCostCenterIds === null) {
        scopeCostCenterIds = unbScope;
      } else {
        const allowed = new Set(unbScope);
        scopeCostCenterIds = scopeCostCenterIds.filter((id) => allowed.has(id));
      }
    }
    const scoped = applyUnbCostCenterScopeToIdFilter(
      scopeCostCenterIds,
      typeof costCenterId === 'string' ? costCenterId : undefined,
    );
    if (scoped.denyAll) {
      const name = `ocs-finalizadas-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send('');
      return;
    }
    const csv = await service.exportFinalizedOrdersCsv({
      supplierId: typeof supplierId === 'string' ? supplierId : undefined,
      costCenterId: scoped.costCenterId,
      costCenterIds: scoped.costCenterIds,
      orderDateFrom: typeof orderDateFrom === 'string' ? orderDateFrom : undefined,
      orderDateTo: typeof orderDateTo === 'string' ? orderDateTo : undefined,
      q: typeof q === 'string' ? q : undefined
    });
    const name = `ocs-finalizadas-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

const attachmentUpload = multer({
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
  },
});

router.post('/upload-attachment', (req: AuthRequest, res: Response, next: NextFunction) => {
  attachmentUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError('Selecione um arquivo', 400);
    }
    const uploadsDir = path.join(backendUploadsRoot, 'purchase-orders');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.bin';
    const safeExt = ext.length <= 8 ? ext : '.bin';
    const fileName = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/purchase-orders/${fileName}`,
        originalName: req.file.originalname || fileName,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload-boleto', (req: AuthRequest, res: Response, next: NextFunction) => {
  boletoUpload.single('boleto')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError('Selecione um arquivo (PDF ou imagem)', 400);
    }
    const uploadsDir = path.join(backendUploadsRoot, 'purchase-orders');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.pdf';
    const safeExt = ext.length <= 8 ? ext : '.pdf';
    const fileName = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/purchase-orders/${fileName}`,
        originalName: req.file.originalname || fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload-nf', (req: AuthRequest, res: Response, next: NextFunction) => {
  boletoUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError('Selecione um arquivo (PDF ou imagem)', 400);
    }
    const uploadsDir = path.join(backendUploadsRoot, 'purchase-orders');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.pdf';
    const safeExt = ext.length <= 8 ? ext : '.pdf';
    const fileName = `nf-${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/purchase-orders/${fileName}`,
        originalName: req.file.originalname || fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload-payment-proof', (req: AuthRequest, res: Response, next: NextFunction) => {
  boletoUpload.single('proof')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError('Selecione um arquivo (PDF ou imagem)', 400);
    }
    const uploadsDir = path.join(backendUploadsRoot, 'purchase-orders');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.pdf';
    const safeExt = ext.length <= 8 ? ext : '.pdf';
    const fileName = `proof-${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/purchase-orders/${fileName}`,
        originalName: req.file.originalname || fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const order = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data: order, message: 'Ordem de compra criada com sucesso' });
  } catch (error) {
    next(error);
  }
});

/** Remessa CNAB400 (layout igual ao financeiro) para OCs aprovadas selecionadas */
router.post('/cnab400', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_PAYMENT_KEY,
      'Sem permissão na aba Pagamento da OC'
    );
    const { orderIds } = req.body as { orderIds?: string[] };
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw createError('Envie orderIds (array de ids das OCs)', 400);
    }
    const { content, skippedOrderNumbers } = await service.generateCnab400Remessa(orderIds);
    if (skippedOrderNumbers.length > 0) {
      res.setHeader('X-Skipped-Order-Numbers', encodeURIComponent(JSON.stringify(skippedOrderNumbers)));
    }
    res.setHeader('Content-Type', 'text/plain; charset=ISO-8859-1');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="CNAB400-OC-${new Date().toISOString().slice(0, 10)}.REM"`
    );
    res.send(content);
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.get('/:id/stock-receipt', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stockReceipt = await service.getStockReceiptSummary(req.params.id);
    if (!stockReceipt) throw createError('Ordem de compra não encontrada', 404);
    res.json({ success: true, data: stockReceipt });
  } catch (error) {
    next(error);
  }
});

router.get('/check-nf-number', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const nfNumber = typeof req.query.nfNumber === 'string' ? req.query.nfNumber : '';
    const excludeId =
      typeof req.query.excludeId === 'string' && req.query.excludeId.trim()
        ? req.query.excludeId.trim()
        : undefined;
    const data = await service.checkInvoiceNumberAvailability(nfNumber, excludeId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pdf-data', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await service.getForPdf(req.params.id);
    if (!order) throw createError('Ordem de compra não encontrada', 404);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await service.getById(req.params.id);
    if (!order) throw createError('Ordem de compra não encontrada', 404);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/nf-attachments/remove', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_ATTACH_NF_KEY,
      'Sem permissão na aba Anexar NF da OC'
    );
    const index = Number((req.body as { index?: unknown })?.index);
    const order = await service.removeNfAttachment(req.params.id, index, req.user?.id);
    res.json({ success: true, data: order, message: 'Nota fiscal removida' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|Apenas quem criou|Índice|Usuário não autenticado/.test(error.message)
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/nf-attachments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_ATTACH_NF_KEY,
      'Sem permissão na aba Anexar NF da OC'
    );
    const { nfUrl, nfName, nfNumber } = req.body as {
      nfUrl?: string;
      nfName?: string;
      nfNumber?: string;
    };
    const order = await service.appendNfAttachment(
      req.params.id,
      { nfUrl: nfUrl || '', nfName, nfNumber },
      req.user?.id
    );
    res.json({ success: true, data: order, message: 'Nota fiscal anexada' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|Apenas quem criou|obrigatório|já existe|Usuário não autenticado/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!status) throw createError('Status é obrigatório', 400);
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const existing = await service.getStatusChangeContext(req.params.id);
    if (!existing) throw createError('Ordem de compra não encontrada', 404);
    await assertOcFlowStatusChange(
      req.user.id,
      !!req.user.isAdmin,
      String(existing?.status ?? ''),
      String(status),
      existing?.materialRequest?.costCenter?.id ?? null,
    );
    const order = await service.updateStatus(req.params.id, status, req.user?.id, {
      rejectionReason: typeof rejectionReason === 'string' ? rejectionReason : undefined
    });
    res.json({ success: true, data: order, message: 'Status atualizado com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Apenas |Status atual não permite|Anexe o comprovante|Envie a OC para a fase Pagamento|Aguarde o pagamento de todas as parcelas|Registre o comprovante|validação de comprovante|validação do comprovante|Pagamento ou em correção|ao menos uma nota|marcada como enviada|marcar como enviada|Usuário não autenticado|financeiro pode reenviar|financeiro pode anexar|OC de centro de custo UNB|A OC UNB só pode|A OC só pode ser aprovada/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/details', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await service.updateDetails(req.params.id, req.body, req.user?.id);
    res.json({ success: true, data: order, message: 'Ordem de compra atualizada com sucesso' });
  } catch (error) {
    if (
      error instanceof Error &&
      /Apenas |Ordem de compra não encontrada|OC só pode|obrigatórios para pagamento|chave PIX|Frete não pode/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/payment-boleto', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_ATTACH_BOLETO_KEY,
      'Sem permissão na aba Anexar Boleto da OC'
    );
    const { paymentBoletoUrl, paymentBoletoName } = req.body as {
      paymentBoletoUrl?: string;
      paymentBoletoName?: string;
    };
    const order = await service.attachPaymentBoleto(
      req.params.id,
      { paymentBoletoUrl: paymentBoletoUrl || '', paymentBoletoName },
      req.user?.id
    );
    res.json({ success: true, data: order, message: 'Boleto de pagamento anexado com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|apenas a OC|obrigatória|várias parcelas|Usuário não autenticado/.test(error.message)
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/payment-boleto-installments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_ATTACH_BOLETO_KEY,
      'Sem permissão na aba Anexar Boleto da OC'
    );
    const body = req.body as { installments?: unknown };
    const order = await service.savePaymentBoletoInstallments(
      req.params.id,
      { installments: Array.isArray(body?.installments) ? body.installments : [] },
      req.user?.id
    );
    res.json({ success: true, data: order, message: 'Parcelas de boleto atualizadas com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|apenas|Envie exatamente|inválid|parcela|Usuário não autenticado/.test(error.message)
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/payment-proof', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const existing = await service.getStatusChangeContext(req.params.id);
    if (!existing) throw createError('Ordem de compra não encontrada', 404);
    const moduleKey =
      existing.status === 'PENDING_PROOF_CORRECTION'
        ? OC_TAB_PROOF_CORRECTION_KEY
        : OC_TAB_PAYMENT_KEY;
    const moduleMsg =
      existing.status === 'PENDING_PROOF_CORRECTION'
        ? 'Sem permissão na aba Correção Comprovante da OC'
        : 'Sem permissão na aba Pagamento da OC';
    await assertUserHasOcModule(req.user.id, !!req.user.isAdmin, moduleKey, moduleMsg);
    const { paymentProofUrl, paymentProofName } = req.body as {
      paymentProofUrl?: string;
      paymentProofName?: string;
    };
    const order = await service.attachPaymentProof(
      req.params.id,
      { paymentProofUrl: paymentProofUrl || '', paymentProofName },
      req.user?.id
    );
    res.json({ success: true, data: order, message: 'Comprovante de pagamento anexado com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|obrigatório|Confirme o envio|Aguarde o pagamento de todas as parcelas|Apenas o financeiro|Usuário não autenticado/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/release-payment-boleto-phase', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_ATTACH_BOLETO_KEY,
      'Sem permissão na aba Anexar Boleto da OC'
    );
    const order = await service.releasePaymentBoletoPhase(req.params.id, req.user?.id);
    res.json({ success: true, data: order, message: 'OC enviada para a fase Pagamento.' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|apenas a OC|Anexe|Registre|Aguarde o financeiro|Não há parcela|já está com o financeiro|Usuário não autenticado/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/payment-boleto-installment-proof', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_PAYMENT_KEY,
      'Sem permissão na aba Pagamento da OC'
    );
    const { paymentProofUrl, paymentProofName, installmentIndex } = req.body as {
      paymentProofUrl?: string;
      paymentProofName?: string;
      installmentIndex?: number;
    };
    const order = await service.attachBoletoInstallmentPaymentProof(
      req.params.id,
      {
        paymentProofUrl: paymentProofUrl || '',
        paymentProofName,
        installmentIndex:
          installmentIndex != null && Number.isFinite(Number(installmentIndex))
            ? Number(installmentIndex)
            : undefined
      },
      req.user?.id
    );
    res.json({ success: true, data: order, message: 'Comprovante da parcela anexado com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|aplica-se apenas|Não há parcela|obrigatório|parcela única|fase Pagamento|Usuário não autenticado/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/return-after-boleto-installment-paid', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_PAYMENT_KEY,
      'Sem permissão na aba Pagamento da OC'
    );
    const order = await service.returnAfterBoletoInstallmentPaid(req.params.id, req.user?.id);
    res.json({
      success: true,
      data: order,
      message: 'Parcela marcada como paga. O comprador pode anexar o boleto da próxima parcela, se houver.'
    });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      /Ordem de compra não encontrada|Só é possível|aplica-se apenas a OC|não está na fase Pagamento|mais de uma parcela|Não há parcela aguardando|Anexe o comprovante desta parcela|Usuário não autenticado/.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/reopen-payment-boleto', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserHasOcModule(
      req.user.id,
      !!req.user.isAdmin,
      OC_TAB_ATTACH_BOLETO_KEY,
      'Sem permissão na aba Anexar Boleto da OC'
    );
    const order = await service.reopenAttachPaymentBoleto(req.params.id, req.user?.id);
    res.json({
      success: true,
      data: order,
      message: 'Boleto removido. A OC voltou para a fase Anexar Boleto.'
    });
  } catch (error) {
    if (error instanceof Error && /Sem permissão/.test(error.message)) {
      res.status(403).json({ success: false, message: error.message });
      return;
    }
    if (error instanceof Error && /Ordem de compra não encontrada|Só é possível|apenas|Não há|Usuário não autenticado/.test(error.message)) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

export default router;
