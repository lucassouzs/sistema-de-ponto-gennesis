import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { QuoteMapService } from '../services/QuoteMapService';
import { createError } from '../middleware/errorHandler';

const router = Router();
const service = new QuoteMapService();

router.use(authenticate);

// Criar mapa de cotação a partir de SC aprovada
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { materialRequestId } = req.body as { materialRequestId?: string };
    if (!materialRequestId) throw createError('materialRequestId é obrigatório', 400);
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);

    const map = await service.create(materialRequestId, req.user.id);
    res.status(201).json({ success: true, data: map });
  } catch (error) {
    next(error);
  }
});

// Salvar cotações (frete por fornecedor + preço unitário por item/fornecedor)
router.put('/:id/quotes', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { supplierIds, freightBySupplier, unitPrices, itemQuantities } = req.body as {
      supplierIds?: string[];
      freightBySupplier?: Record<string, number>;
      unitPrices?: Array<{ supplierId: string; materialRequestItemId: string; unitPrice: number }>;
      itemQuantities?: Record<string, number>;
    };

    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    if (!supplierIds || !Array.isArray(supplierIds) || supplierIds.length === 0) {
      throw createError('supplierIds é obrigatório', 400);
    }
    if (!freightBySupplier || typeof freightBySupplier !== 'object') {
      throw createError('freightBySupplier é obrigatório', 400);
    }
    if (!unitPrices || !Array.isArray(unitPrices)) {
      throw createError('unitPrices é obrigatório', 400);
    }

    const result = await service.saveQuotes(id, req.user.id, {
      supplierIds,
      freightBySupplier,
      unitPrices,
      itemQuantities
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Gerar OCs a partir do vencedor por item (com pagamento por fornecedor)
router.post('/:id/generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { generateSupplierIds, paymentBySupplier, itemQuantities } = req.body as {
      generateSupplierIds?: string[];
      itemQuantities?: Record<string, number>;
      paymentBySupplier?: Array<{
        supplierId: string;
        paymentType: string;
        paymentCondition: string;
        paymentDetails?: string;
        observations?: string;
        amountToPay?: number;
        boletoAttachmentUrl?: string;
        boletoAttachmentName?: string;
      }>;
    };

    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    if (!generateSupplierIds || !Array.isArray(generateSupplierIds) || generateSupplierIds.length === 0) {
      throw createError('generateSupplierIds é obrigatório', 400);
    }
    if (!paymentBySupplier || !Array.isArray(paymentBySupplier) || paymentBySupplier.length === 0) {
      throw createError('paymentBySupplier é obrigatório', 400);
    }

    const result = await service.generatePurchaseOrders(id, req.user.id, {
      generateSupplierIds,
      paymentBySupplier,
      itemQuantities
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Baixar snapshot PDF do mapa (gera sob demanda se não existir)
router.get('/:id/snapshot-pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);

    const absPath = await service.getOrCreateSnapshotPdfPath(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="mapa-cotacao-${id}.pdf"`);
    res.sendFile(absPath);
  } catch (error) {
    next(error);
  }
});

export default router;

