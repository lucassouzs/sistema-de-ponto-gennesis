import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { PurchaseOrderService } from './PurchaseOrderService';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { backendUploadsRoot } from '../lib/uploads';
import { shouldUseUnbBranding, resolvePdfLogoPathFromPublic } from '../lib/unbBranding';

export class QuoteMapService {
  private purchaseOrderService = new PurchaseOrderService();
  private db: any = prisma as any;

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  private toNumber(value: any): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (typeof value?.toNumber === 'function') return value.toNumber();
    return Number(value);
  }

  private findCompanyLogoPath(...contextLabels: (string | null | undefined)[]): string | null {
    const useUnb = shouldUseUnbBranding(...contextLabels);
    return resolvePdfLogoPathFromPublic(useUnb);
  }

  private async saveQuoteMapSnapshotPdf(quoteMapId: string): Promise<string> {
    const map = await this.db.quoteMap.findUnique({
      where: { id: quoteMapId },
      include: {
        materialRequest: {
          select: {
            id: true,
            requestNumber: true,
            serviceOrder: true,
            costCenter: { select: { name: true, code: true } },
            items: {
              include: { material: true }
            },
          },
        },
        suppliers: {
          include: { supplier: true }
        },
        supplierItems: {
          include: {
            supplier: true,
            materialRequestItem: {
              include: { material: true }
            }
          }
        },
        winners: {
          include: {
            winnerSupplier: true,
            materialRequestItem: {
              include: { material: true }
            }
          }
        }
      }
    });
    if (!map) throw new Error('Mapa de cotação não encontrado para gerar snapshot PDF');

    const outputDir = path.join(backendUploadsRoot, 'quote-maps', map.id);
    fs.mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, 'snapshot.pdf');
    const publicUrl = `/uploads/quote-maps/${map.id}/snapshot.pdf`;

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const pageWidth = doc.page.width;
      const left = 40;
      const right = pageWidth - 40;
      const contentWidth = right - left;

      // Header card
      doc.roundedRect(left, 30, contentWidth, 96, 8).fill('#F5F7FB');
      const logoContext = [
        map.materialRequest?.costCenter?.name,
        map.materialRequest?.costCenter?.code,
        map.materialRequest?.serviceOrder,
      ];
      const logoPath = this.findCompanyLogoPath(...logoContext);
      if (logoPath) {
        doc.image(logoPath, left + 12, 44, { fit: [120, 56], valign: 'center' });
      }
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(16).text('Snapshot do Mapa de Cotação', left + 150, 46);
      doc.font('Helvetica').fontSize(10);
      doc.text(`Mapa: ${map.id}`, left + 150, 69);
      doc.text(`SC: ${map.materialRequest?.requestNumber || map.materialRequestId}`, left + 150, 84);
      doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, left + 150, 99);

      let y = 140;

      // Suppliers section
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text('Fornecedores', left, y);
      y += 16;
      doc.roundedRect(left, y, contentWidth, Math.max(36, (map.suppliers?.length || 1) * 16 + 12), 6).fill('#F8FAFC');
      y += 8;
      for (const s of map.suppliers || []) {
        const freight = this.toNumber(s.freight);
        doc
          .fillColor('#334155')
          .font('Helvetica')
          .fontSize(10)
          .text(`${s.supplier?.name || s.supplierId}`, left + 10, y, { width: contentWidth - 160, ellipsis: true })
          .text(`Frete: ${this.formatCurrency(freight)}`, right - 140, y, { width: 130, align: 'right' });
        y += 16;
      }
      y += 8;

      // Items title
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text('Itens e cotações completas', left, y);
      y += 18;

      const tableCols = {
        material: left + 8,
        qty: left + 268,
        unit: left + 318,
        quotes: left + 360
      };

      const drawTableHeader = () => {
        doc.roundedRect(left, y, contentWidth, 20, 4).fill('#E2E8F0');
        doc
          .fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Material', tableCols.material, y + 6, { width: 250 })
          .text('Qtd', tableCols.qty, y + 6, { width: 40, align: 'right' })
          .text('Un.', tableCols.unit, y + 6, { width: 35, align: 'center' })
          .text('Fornecedores / Valores', tableCols.quotes, y + 6, { width: 148 });
        y += 22;
      };

      drawTableHeader();

      const ensureSpace = (minHeight: number) => {
        if (y + minHeight <= doc.page.height - 45) return;
        doc.addPage();
        y = 40;
        drawTableHeader();
      };

      const items = map.materialRequest?.items || [];
      for (const item of items) {
        const winner = (map.winners || []).find((w: any) => w.materialRequestItemId === item.id);
        const winnerSupplierId = winner?.winnerSupplierId;
        const qty = this.toNumber(item.quantity);
        const itemLabel = item.material?.name || item.material?.description || item.id;
        const itemQuotes = (map.supplierItems || [])
          .filter((si: any) => si.materialRequestItemId === item.id)
          .map((si: any) => {
            const supplierName = si?.supplier?.name || si?.supplierId || 'Fornecedor';
            const unitValue = this.formatCurrency(this.toNumber(si?.unitPrice));
            const isWinner = winnerSupplierId && si?.supplierId === winnerSupplierId;
            return `${isWinner ? 'VENCEDOR - ' : ''}${supplierName}\nUnit.: ${unitValue}`;
          });

        const quotesBlock = itemQuotes.length > 0 ? itemQuotes.join('\n') : 'Sem cotações registradas';

        const materialHeight = doc.heightOfString(itemLabel, { width: 250, align: 'left' });
        const quotesHeight = doc.heightOfString(quotesBlock, { width: 148, align: 'left' });
        const rowHeight = Math.max(22, Math.ceil(Math.max(materialHeight, quotesHeight) + 10));
        ensureSpace(rowHeight + 4);

        doc
          .fillColor('#0F172A')
          .font('Helvetica')
          .fontSize(9)
          .text(itemLabel, tableCols.material, y + 5, { width: 250 })
          .text(String(qty), tableCols.qty, y + 5, { width: 40, align: 'right' })
          .text(item.unit || '-', tableCols.unit, y + 5, { width: 35, align: 'center' })
          .text(quotesBlock, tableCols.quotes, y + 5, { width: 148 });

        doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).strokeColor('#E2E8F0').lineWidth(1).stroke();
        y += rowHeight + 2;
      }

      // Footer
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text('Documento gerado automaticamente pelo Sistema Gennesis.', left, doc.page.height - 28, {
          width: contentWidth,
          align: 'center'
        });

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      doc.on('error', reject);
    });

    return publicUrl;
  }

  private snapshotPdfAbsolutePath(quoteMapId: string): string {
    return path.join(backendUploadsRoot, 'quote-maps', quoteMapId, 'snapshot.pdf');
  }

  async getOrCreateSnapshotPdfPath(quoteMapId: string): Promise<string> {
    const map = await this.db.quoteMap.findUnique({
      where: { id: quoteMapId },
      select: { id: true }
    });
    if (!map) throw new Error('Mapa de cotação não encontrado');

    const absPath = this.snapshotPdfAbsolutePath(quoteMapId);
    // Regera para garantir layout mais atual do snapshot.
    await this.saveQuoteMapSnapshotPdf(quoteMapId);
    return absPath;
  }

  async create(materialRequestId: string, userId: string) {
    const rm = await this.db.materialRequest.findUnique({
      where: { id: materialRequestId },
      select: { id: true, status: true }
    });
    if (!rm) throw new Error('SC (requisição) não encontrada');
    if (rm.status !== 'APPROVED') throw new Error('Somente SC aprovada pode virar mapa de cotação');

    return this.db.quoteMap.create({
      data: {
        materialRequestId,
        createdBy: userId
      }
    });
  }

  async saveQuotes(
    quoteMapId: string,
    userId: string,
    data: {
      supplierIds: string[];
      freightBySupplier: Record<string, number>;
      unitPrices: Array<{
        supplierId: string;
        materialRequestItemId: string;
        unitPrice: number;
      }>;
      /** Quantidade a considerar no cálculo do vencedor (≤ SC). Se omitido, usa a quantidade solicitada. */
      itemQuantities?: Record<string, number>;
    }
  ) {
    const map = await this.db.quoteMap.findUnique({ where: { id: quoteMapId }, select: { id: true, createdBy: true } });
    if (!map) throw new Error('Mapa de cotação não encontrado');
    if (map.createdBy !== userId) throw new Error('Você não tem permissão para editar este mapa');

    const quoteMap = await this.db.quoteMap.findUnique({ where: { id: quoteMapId }, select: { materialRequestId: true } });
    const rm = await this.db.materialRequest.findUnique({
      where: { id: quoteMap.materialRequestId },
      select: { id: true, status: true, items: { select: { id: true, quantity: true, unit: true, materialId: true } } }
    });
    if (!rm) throw new Error('SC não encontrada');
    if (rm.status !== 'APPROVED') throw new Error('A SC precisa estar aprovada');

    const supplierIds = Array.from(new Set(data.supplierIds));
    if (supplierIds.length === 0) throw new Error('Selecione ao menos um fornecedor no mapa');

    // wipe total para não misturar valores antigos
    await this.db.$transaction([
      this.db.quoteMapSupplierItem.deleteMany({ where: { quoteMapId } }),
      this.db.quoteMapWinnerItem.deleteMany({ where: { quoteMapId } }),
      this.db.quoteMapSupplier.deleteMany({ where: { quoteMapId } })
    ]);

    // Persistir frete e preços unitários
    await this.db.$transaction(
      supplierIds.map((supplierId) =>
        this.db.quoteMapSupplier.create({
          data: {
            quoteMapId,
            supplierId,
            freight: new Decimal(data.freightBySupplier[supplierId] ?? 0)
          }
        })
      )
    );

    const unitPriceMap = new Map<string, Decimal>(); // key: supplierId:itemId
    for (const q of data.unitPrices) {
      if (!supplierIds.includes(q.supplierId)) continue;
      unitPriceMap.set(`${q.supplierId}:${q.materialRequestItemId}`, new Decimal(q.unitPrice));
    }

    await this.db.$transaction(
      data.unitPrices
        .filter((q) => supplierIds.includes(q.supplierId))
        .map((q) =>
          this.db.quoteMapSupplierItem.create({
            data: {
              quoteMapId,
              supplierId: q.supplierId,
              materialRequestItemId: q.materialRequestItemId,
              unitPrice: new Decimal(q.unitPrice)
            }
          })
        )
    );

    // Calcular vencedor por item:
    // score = unitPrice * quantidade + frete
    const winnersToCreate: any[] = [];

    const qtyOverrides = data.itemQuantities ?? {};

    for (const item of rm.items) {
      let bestSupplierId: string | null = null;
      let bestScore: Decimal | null = null;
      let bestUnitPrice: Decimal | null = null;
      let bestFreight: Decimal | null = null;

      const requestedQty = new Decimal(item.quantity);
      const rawQ = qtyOverrides[item.id];
      const lineQty =
        rawQ != null && Number.isFinite(Number(rawQ)) ? new Decimal(Number(rawQ)) : requestedQty;
      if (lineQty.lte(0)) throw new Error('Quantidade inválida no mapa de cotação');
      if (lineQty.gt(requestedQty)) {
        throw new Error('Quantidade não pode exceder a solicitada na SC');
      }

      for (const supplierId of supplierIds) {
        const unit = unitPriceMap.get(`${supplierId}:${item.id}`);
        if (!unit) continue;

        const freight = new Decimal(data.freightBySupplier[supplierId] ?? 0);
        const score = unit.mul(lineQty).add(freight);

        if (!bestScore || score.lt(bestScore)) {
          bestSupplierId = supplierId;
          bestScore = score;
          bestUnitPrice = unit;
          bestFreight = freight;
          continue;
        }

        if (bestScore && score.eq(bestScore) && bestUnitPrice) {
          // desempate: menor unitPrice
          if (unit.lt(bestUnitPrice)) {
            bestSupplierId = supplierId;
            bestScore = score;
            bestUnitPrice = unit;
            bestFreight = freight;
          }
        }
      }

      if (!bestSupplierId || !bestScore || !bestUnitPrice || !bestFreight) {
        throw new Error(`Faltam preços cotados para o item ${item.id}`);
      }

      winnersToCreate.push({
        quoteMapId,
        materialRequestItemId: item.id,
        winnerSupplierId: bestSupplierId,
        winnerScore: bestScore,
        winnerUnitPrice: bestUnitPrice,
        freight: bestFreight
      });
    }

    await this.db.quoteMapWinnerItem.createMany({ data: winnersToCreate });

    return { ok: true };
  }

  async generatePurchaseOrders(
    quoteMapId: string,
    userId: string,
    data: {
      generateSupplierIds: string[];
      /** Quantidade a comprar por item da SC (materialRequestItemId). Se omitido, usa a quantidade solicitada. */
      itemQuantities?: Record<string, number>;
      /** Chave `supplierId:materialRequestItemId` → detalhe/nome do item no fornecedor. */
      itemNotesBySupplierItem?: Record<string, string>;
      paymentBySupplier: Array<{
        supplierId: string;
        paymentType: string;
        paymentCondition: string;
        paymentDetails?: string;
        pixKeyType?: string;
        pixKey?: string;
        observations?: string;
        amountToPay?: number;
        boletoAttachmentUrl?: string;
        boletoAttachmentName?: string;
        creationBoletoInstallments?: Array<{ boletoUrl: string; boletoName?: string | null }>;
        attachments?: Array<{ url: string; name: string }>;
      }>;
    }
  ) {
    const map = await this.db.quoteMap.findUnique({
      where: { id: quoteMapId },
      select: { id: true, createdBy: true, materialRequestId: true }
    });
    if (!map) throw new Error('Mapa de cotação não encontrado');
    if (map.createdBy !== userId) throw new Error('Você não tem permissão para gerar a OC deste mapa');

    const supplierIds = Array.from(new Set(data.generateSupplierIds));
    if (supplierIds.length === 0) throw new Error('Selecione ao menos um fornecedor para gerar OC');

    const rm = await this.db.materialRequest.findUnique({
      where: { id: map.materialRequestId },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unit: true,
            materialId: true
          }
        }
      }
    });
    if (!rm) throw new Error('SC não encontrada');

    const suppliers = await this.db.quoteMapSupplier.findMany({
      where: { quoteMapId, supplierId: { in: supplierIds } },
      select: { supplierId: true, freight: true }
    });
    const freightBySupplier: Record<string, Decimal> = Object.fromEntries(
      suppliers.map((s: any) => [s.supplierId, s.freight ? new Decimal(s.freight) : new Decimal(0)])
    );

    const paymentMap = new Map(
      data.paymentBySupplier.map((p) => [p.supplierId, p])
    );

    const qtyOverrides = data.itemQuantities ?? {};
    const notesBySupplierItem = data.itemNotesBySupplierItem ?? {};

    const winners = await this.db.quoteMapWinnerItem.findMany({
      where: { quoteMapId, winnerSupplierId: { in: supplierIds } },
      include: { materialRequestItem: true }
    });

    if (winners.length === 0) {
      throw new Error('Nenhum item foi vencido pelos fornecedores selecionados');
    }

    const supplierItemUnitPrices = await this.db.quoteMapSupplierItem.findMany({
      where: {
        quoteMapId,
        supplierId: { in: supplierIds },
        materialRequestItemId: { in: (winners as any[]).map((w: any) => w.materialRequestItemId) }
      },
      select: { supplierId: true, materialRequestItemId: true, unitPrice: true }
    });

    const unitPriceBySupplierItem = new Map<string, Decimal>(
      supplierItemUnitPrices.map((x: any) => [`${x.supplierId}:${x.materialRequestItemId}`, new Decimal(x.unitPrice)])
    );

    const itemsBySupplier: Record<string, any[]> = {};
    for (const w of winners as any[]) {
      itemsBySupplier[w.winnerSupplierId] = itemsBySupplier[w.winnerSupplierId] || [];
      itemsBySupplier[w.winnerSupplierId].push(w);
    }

    const supplierIdsToGenerate = supplierIds.filter((id) => (itemsBySupplier[id] ?? []).length > 0);
    if (supplierIdsToGenerate.length === 0) {
      throw new Error('Nenhum dos fornecedores marcados venceu itens neste mapa');
    }

    const maxQtyByRmItem = new Map<string, Decimal>(
      (rm.items as Array<{ id: string; quantity: unknown }>).map((it) => [
        it.id,
        new Decimal(it.quantity as any),
      ]),
    );

    const boletoConditionCodes = Array.from(
      new Set(
        [...paymentMap.values()]
          .filter((p) => p.paymentType === 'BOLETO' && p.paymentCondition)
          .map((p) => p.paymentCondition as string),
      ),
    );
    const paymentConditionByCode = new Map<
      string,
      { parcelCount: number | null; parcelDueDays: unknown }
    >();
    if (boletoConditionCodes.length > 0) {
      const condRows = await this.db.paymentCondition.findMany({
        where: { code: { in: boletoConditionCodes } },
        select: { code: true, parcelCount: true, parcelDueDays: true },
      });
      for (const row of condRows) {
        paymentConditionByCode.set(row.code, {
          parcelCount: row.parcelCount,
          parcelDueDays: row.parcelDueDays,
        });
      }
    }

    const createPayloads: any[] = [];

    for (const supplierId of supplierIdsToGenerate) {
      const pay = paymentMap.get(supplierId);
      if (!pay) throw new Error(`Informe o pagamento para o fornecedor selecionado`);

      const freight = freightBySupplier[supplierId] ?? new Decimal(0);
      const winnerItems = itemsBySupplier[supplierId] ?? [];

      const items = (winnerItems as any[]).map((w: any) => {
        const unit = unitPriceBySupplierItem.get(`${supplierId}:${w.materialRequestItemId}`);
        if (!unit) throw new Error('Preço unitário cotado não encontrado para um vencedor');
        const requestedQty = new Decimal(w.materialRequestItem.quantity);
        const raw = qtyOverrides[w.materialRequestItemId];
        const quantity =
          raw != null && Number.isFinite(Number(raw))
            ? new Decimal(Number(raw))
            : requestedQty;
        if (quantity.lte(0)) throw new Error('Quantidade inválida na OC');
        if (quantity.gt(requestedQty)) {
          throw new Error('Quantidade da OC não pode exceder a solicitada na SC');
        }
        const detailKey = `${supplierId}:${w.materialRequestItemId}`;
        const itemNote = String(notesBySupplierItem[detailKey] ?? '').trim();
        return {
          materialRequestItemId: w.materialRequestItemId,
          materialId: w.materialRequestItem.materialId,
          quantity: Number(quantity),
          unit: w.materialRequestItem.unit,
          unitPrice: Number(unit),
          notes: itemNote || null
        };
      });

      createPayloads.push({
        materialRequestId: map.materialRequestId,
        quoteMapId: map.id,
        supplierId,
        items,
        paymentType: pay.paymentType,
        paymentCondition: pay.paymentCondition,
        paymentDetails: pay.paymentDetails ?? null,
        pixKeyType: pay.pixKeyType ?? null,
        pixKey: pay.pixKey ?? null,
        boletoAttachmentUrl: pay.boletoAttachmentUrl,
        boletoAttachmentName: pay.boletoAttachmentName,
        creationBoletoInstallments: pay.creationBoletoInstallments,
        freightAmount: Number(freight),
        notes: pay.observations ?? null,
        attachments: pay.attachments,
      });
    }

    const createdOrders = await this.purchaseOrderService.createMany(createPayloads, userId, {
      maxQtyByRmItem,
      paymentConditionByCode,
    });

    const snapshotPdfUrl = `/uploads/quote-maps/${quoteMapId}/snapshot.pdf`;
    // PDF fora do caminho crítico — o download regenera sob demanda se ainda não existir.
    void this.saveQuoteMapSnapshotPdf(quoteMapId).catch((err) => {
      console.error('[QuoteMap] snapshot PDF em background falhou', quoteMapId, err);
    });
    return { orders: createdOrders, snapshotPdfUrl };
  }
}
