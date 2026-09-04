import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { PurchaseOrderService } from './PurchaseOrderService';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import PDFDocument from 'pdfkit';
import { backendUploadsRoot } from '../lib/uploads';
import { savePersistentBuffer } from '../lib/persistentUpload';
import { shouldUseUnbBranding, resolvePdfLogoPathFromPublic, resolvePdfCompanyHeader } from '../lib/unbBranding';
import { OC_STATUSES_COVERING_RM_ITEMS } from '../lib/rmProcurementCoverage';

export class QuoteMapService {
  private purchaseOrderService = new PurchaseOrderService();
  private db: any = prisma as any;

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    }).format(value);
  }

  private formatDateBr(value?: string | Date | null): string {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  }

  private formatDateTimeBr(value?: string | Date | null): string {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '';
    const date = d.toLocaleDateString('pt-BR');
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date}, ${time}`;
  }

  /** Número curto da RM no PDF (`REQ-2026-055` → `55`). */
  private formatRmDisplayId(requestNumber?: string | null): string {
    const trimmed = String(requestNumber ?? '').trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^REQ-\d{4}-(\d+)$/i);
    if (match) return String(parseInt(match[1], 10));
    const lastSegment = trimmed.split('-').pop();
    if (lastSegment && /^\d+$/.test(lastSegment)) {
      return String(parseInt(lastSegment, 10));
    }
    return trimmed;
  }

  /** Rótulo da OS no PDF do mapa — sem prefixo "OS" (ex.: "AD-725"). */
  private formatRmOsLabel(mr?: {
    serviceOrder?: string | null;
    service_orders?: { numero?: number | null; ano?: number | null } | null;
  } | null): string {
    const os = (mr?.serviceOrder || '').trim();
    if (os) {
      return os.replace(/^(OS|SE)\s+/i, '').trim();
    }
    const so = mr?.service_orders;
    if (so?.numero != null && so?.ano != null) {
      return `${so.numero}/${so.ano}`;
    }
    return '';
  }

  private formatOcDisplayNumber(orderNumber: string): string {
    const trimmed = (orderNumber || '').trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^OC-\d{4}-(\d+)$/i);
    if (match) return String(parseInt(match[1], 10));
    return trimmed;
  }

  private paymentTypeLabel(code?: string | null): string {
    if (!code) return '';
    if (code === 'AVISTA') return 'À vista';
    if (code === 'BOLETO') return 'Boleto';
    return code;
  }

  private paymentConditionLabel(code?: string | null): string {
    if (!code) return '';
    if (code === 'AVISTA') return 'À vista';
    if (code === 'BOLETO_30') return 'Boleto 30 dias';
    if (code === 'BOLETO_28') return 'Boleto 28 dias';
    return code;
  }

  private supplierAddressLine(s: {
    street?: string | null;
    streetNumber?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  }): string {
    const structured = [
      s.street ? `Rua: ${s.street}` : '',
      s.streetNumber ? `Nº: ${s.streetNumber}` : '',
      s.complement ? `Comp: ${s.complement}` : '',
      s.neighborhood ? `Bairro: ${s.neighborhood}` : '',
      s.city ? `Cidade: ${s.city}` : '',
      s.state ? `UF: ${s.state}` : '',
      s.zipCode ? `CEP: ${s.zipCode}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    if (structured) return structured;
    return [s.address, s.city, s.state, s.zipCode].filter(Boolean).join(' — ');
  }

  private toNumber(value: any): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (typeof value?.toNumber === 'function') return value.toNumber();
    return Number(value);
  }

  private constructionMaterialIdFromSinapi(code?: string | null): string | null {
    const s = (code || '').trim();
    if (!s.startsWith('CM-')) return null;
    const id = s.slice(3).trim();
    return id || null;
  }

  private async loadConstructionMaterialCodes(
    materials: Array<{ sinapiCode?: string | null } | null | undefined>
  ): Promise<Map<string, string>> {
    const cmIds = new Set<string>();
    for (const m of materials) {
      const cmId = this.constructionMaterialIdFromSinapi(m?.sinapiCode);
      if (cmId) cmIds.add(cmId);
    }
    if (cmIds.size === 0) return new Map();
    const rows = await prisma.constructionMaterial.findMany({
      where: { id: { in: Array.from(cmIds) } },
      select: { id: true, code: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      const code = (row.code || '').trim();
      if (code) map.set(row.id, code);
    }
    return map;
  }

  /** Nome do material/serviço em destaque (cadastro). */
  private materialCatalogLabel(m?: {
    name?: string | null;
    description?: string | null;
    sinapiCode?: string | null;
  } | null): string {
    if (!m) return '—';
    const name = (m.name || '').trim();
    if (name) return name;
    const desc = (m.description || '').trim();
    if (desc) return desc;
    const sinapi = (m.sinapiCode || '').trim();
    if (sinapi) return sinapi;
    return '—';
  }

  private materialCatalogCode(
    m?: { sinapiCode?: string | null; code?: string | null } | null,
    catalogCodeByCmId?: Map<string, string>
  ): string {
    if (!m) return '';
    const direct = (m.code || '').trim();
    if (direct) return direct;
    const cmId = this.constructionMaterialIdFromSinapi(m.sinapiCode);
    if (cmId && catalogCodeByCmId) return catalogCodeByCmId.get(cmId) || '';
    return '';
  }

  /** Descrição do cadastro quando difere do nome. */
  private materialCatalogSubtitle(m?: {
    name?: string | null;
    description?: string | null;
  } | null): string {
    if (!m) return '';
    const name = (m.name || '').trim();
    const desc = (m.description || '').trim();
    if (desc && name && desc !== name) return desc;
    return '';
  }

  /** Linha secundária: detalhamento (mapa/OC/RM) ou descrição do cadastro. */
  private purchaseOrderLineDetail(
    detailFromNotes: string,
    material?: { name?: string | null; description?: string | null } | null
  ): string | null {
    const detail = detailFromNotes.trim();
    if (detail) return detail;
    const subtitle = this.materialCatalogSubtitle(material);
    return subtitle || null;
  }

  private findCompanyLogoPath(...contextLabels: (string | null | undefined)[]): string | null {
    const useUnb = shouldUseUnbBranding(...contextLabels);
    return resolvePdfLogoPathFromPublic(useUnb);
  }

  private async saveQuoteMapSnapshotPdf(
    quoteMapId: string,
    options?: { purchaseOrderId?: string; kind?: 'snapshot' | 'comparison' }
  ): Promise<string> {
    const kind = options?.kind === 'comparison' ? 'comparison' : 'snapshot';
    const map = await this.db.quoteMap.findUnique({
      where: { id: quoteMapId },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        materialRequest: {
          select: {
            id: true,
            requestNumber: true,
            serviceOrder: true,
            description: true,
            demandSheet: true,
            costCenter: { select: { name: true, code: true } },
            service_orders: { select: { numero: true, ano: true } },
            items: {
              include: { material: true },
            },
          },
        },
        suppliers: {
          include: { supplier: true },
        },
        supplierItems: {
          include: {
            supplier: true,
            materialRequestItem: {
              include: { material: true },
            },
          },
        },
        winners: {
          include: {
            winnerSupplier: true,
            materialRequestItem: {
              include: { material: true },
            },
          },
        },
        purchaseOrders: {
          include: {
            supplier: true,
            creator: { select: { id: true, name: true, email: true } },
            items: {
              include: { material: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!map) throw new Error('Mapa de cotação não encontrado para gerar snapshot PDF');

    const materialsForCatalogCode: Array<{ sinapiCode?: string | null } | null | undefined> = [];
    for (const it of map.materialRequest?.items || []) {
      materialsForCatalogCode.push(it.material);
    }
    for (const si of map.supplierItems || []) {
      materialsForCatalogCode.push(si.materialRequestItem?.material);
    }
    for (const w of map.winners || []) {
      materialsForCatalogCode.push(w.materialRequestItem?.material);
    }
    for (const po of map.purchaseOrders || []) {
      for (const it of po.items || []) {
        materialsForCatalogCode.push(it.material);
      }
    }
    const catalogCodeByCmId = await this.loadConstructionMaterialCodes(materialsForCatalogCode);

    const purchaseOrderId = options?.purchaseOrderId?.trim() || '';
    const allPurchaseOrders = Array.isArray(map.purchaseOrders) ? map.purchaseOrders : [];
    const purchaseOrders = purchaseOrderId
      ? allPurchaseOrders.filter((po: { id: string }) => po.id === purchaseOrderId)
      : allPurchaseOrders;
    if (purchaseOrderId && purchaseOrders.length === 0 && kind !== 'comparison') {
      throw new Error('OC não encontrada neste mapa de cotação');
    }

    // Comparativo aberto a partir de uma OC: só os itens dessa OC, com todos os
    // fornecedores que cotaram esses itens (não mistura item da outra OC da RM).
    let comparisonFocusPo: (typeof allPurchaseOrders)[number] | null = null;
    let comparisonFocusItemIds: Set<string> | null = null;
    if (kind === 'comparison' && purchaseOrderId) {
      comparisonFocusPo =
        allPurchaseOrders.find((po: { id: string }) => po.id === purchaseOrderId) || null;
      if (!comparisonFocusPo) {
        throw new Error('OC não encontrada neste mapa de cotação');
      }
      comparisonFocusItemIds = new Set(
        (Array.isArray(comparisonFocusPo.items) ? comparisonFocusPo.items : [])
          .map((it: { materialRequestItemId?: string | null }) =>
            it.materialRequestItemId ? String(it.materialRequestItemId) : ''
          )
          .filter(Boolean)
      );
    }

    const snapshotFileName =
      kind === 'comparison'
        ? purchaseOrderId
          ? `comparison-${purchaseOrderId}.pdf`
          : 'comparison.pdf'
        : purchaseOrderId
          ? `snapshot-${purchaseOrderId}.pdf`
          : 'snapshot.pdf';
    const publicUrl = `/uploads/quote-maps/${map.id}/${snapshotFileName}`;
    const mr = map.materialRequest;
    const contextLabels = [mr?.costCenter?.name, mr?.costCenter?.code, mr?.serviceOrder];
    const useUnb = shouldUseUnbBranding(...contextLabels);
    const company = resolvePdfCompanyHeader(useUnb);
    const logoPath = this.findCompanyLogoPath(...contextLabels);

    type SnapshotSection = {
      orderNumber?: string;
      orderDate?: string | Date | null;
      expectedDelivery?: string | Date | null;
      deliveryAddress?: string | null;
      paymentType?: string | null;
      paymentCondition?: string | null;
      paymentDetails?: string | null;
      freightAmount?: number;
      amountToPay?: number | null;
      notes?: string | null;
      buyerName?: string | null;
      isQuoteComparison?: boolean;
      wonItemCount?: number;
      supplier: any;
      items: Array<{
        code?: string;
        label: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        totalPrice: number;
        notes?: string | null;
        isWinner?: boolean;
      }>;
    };

    const sections: SnapshotSection[] = [];
    const winnerByItemId = new Map<string, string>(
      (map.winners || [])
        .filter((w: any) => w?.materialRequestItemId && w?.winnerSupplierId)
        .map((w: any) => [String(w.materialRequestItemId), String(w.winnerSupplierId)])
    );

    if (kind === 'comparison') {
      // PDF separado: todas as cotações + ganhadora por item.
      // Se já existir OC do fornecedor neste mapa, usa pagamento/frete da OC (mais fiel).
      const poBySupplierId = new Map<string, (typeof allPurchaseOrders)[number]>();
      for (const po of allPurchaseOrders) {
        const sid = String((po as { supplierId?: string }).supplierId || '');
        if (!sid) continue;
        // Mantém a OC mais antiga do fornecedor neste mapa
        if (!poBySupplierId.has(sid)) poBySupplierId.set(sid, po);
      }

      for (const qs of Array.isArray(map.suppliers) ? map.suppliers : []) {
        const supplierId = String(qs.supplierId || '');
        const supplier = qs.supplier;
        if (!supplierId || !supplier) continue;

        let quoted = (map.supplierItems || []).filter(
          (si: any) => String(si.supplierId) === supplierId
        );
        if (comparisonFocusItemIds) {
          quoted = quoted.filter((si: any) =>
            comparisonFocusItemIds!.has(String(si.materialRequestItemId || ''))
          );
        }
        if (quoted.length === 0) continue;

        const linkedPo =
          comparisonFocusPo &&
          String((comparisonFocusPo as { supplierId?: string }).supplierId || '') === supplierId
            ? comparisonFocusPo
            : poBySupplierId.get(supplierId);
        const items = quoted.map((si: any) => {
          const mri = si.materialRequestItem;
          const qty = this.toNumber(mri?.quantity);
          const unitPrice = this.toNumber(si.unitPrice);
          const itemId = String(si.materialRequestItemId || mri?.id || '');
          const isWinner = itemId ? winnerByItemId.get(itemId) === supplierId : false;
          const rmNote =
            (typeof mri?.notes === 'string' && mri.notes.trim()) ||
            (typeof mri?.observation === 'string' && mri.observation.trim()) ||
            '';
          return {
            label: this.materialCatalogLabel(mri?.material),
            code: this.materialCatalogCode(mri?.material, catalogCodeByCmId),
            quantity: qty,
            unit: mri?.unit || '—',
            unitPrice,
            totalPrice: qty * unitPrice,
            notes: this.purchaseOrderLineDetail(rmNote, mri?.material),
            isWinner,
          };
        });

        sections.push({
          isQuoteComparison: true,
          wonItemCount: items.filter((it: { isWinner: boolean }) => it.isWinner).length,
          paymentType: linkedPo?.paymentType ?? qs.paymentType,
          paymentCondition: linkedPo?.paymentCondition ?? qs.paymentCondition,
          paymentDetails: linkedPo?.paymentDetails ?? qs.paymentDetails,
          freightAmount: linkedPo
            ? this.toNumber(linkedPo.freightAmount)
            : this.toNumber(qs.freight),
          amountToPay:
            linkedPo?.amountToPay != null
              ? this.toNumber(linkedPo.amountToPay)
              : qs.amountToPay != null
                ? this.toNumber(qs.amountToPay)
                : null,
          notes: linkedPo?.notes ?? qs.observations,
          buyerName:
            linkedPo?.creator?.name || map.creator?.name || null,
          supplier: linkedPo?.supplier || supplier,
          items,
        });
      }

      // Fallback: OCs do mapa cujo fornecedor sumiu do histórico de cotação
      // (ex.: wipe antigo ao gerar a 2ª OC) — ainda assim aparecem no comparativo.
      const sectionSupplierIds = new Set(
        sections
          .map((s) => String((s.supplier as { id?: string } | null)?.id || ''))
          .filter(Boolean)
      );
      const posForFallback = comparisonFocusPo ? [comparisonFocusPo] : allPurchaseOrders;
      for (const po of posForFallback) {
        const sid = String((po as { supplierId?: string }).supplierId || '');
        if (!sid || sectionSupplierIds.has(sid)) continue;
        const poItems = Array.isArray(po.items) ? po.items : [];
        if (poItems.length === 0) continue;
        sections.push({
          isQuoteComparison: true,
          wonItemCount: poItems.length,
          paymentType: po.paymentType,
          paymentCondition: po.paymentCondition,
          paymentDetails: po.paymentDetails,
          freightAmount: this.toNumber(po.freightAmount),
          amountToPay: po.amountToPay != null ? this.toNumber(po.amountToPay) : null,
          notes: po.notes,
          buyerName: po.creator?.name || map.creator?.name || null,
          supplier: po.supplier,
          items: poItems.map((it: any) => {
            const qty = this.toNumber(it.quantity);
            const unitPrice = this.toNumber(it.unitPrice);
            const total =
              it.totalPrice != null ? this.toNumber(it.totalPrice) : qty * unitPrice;
            return {
              label: this.materialCatalogLabel(it.material),
              code: this.materialCatalogCode(it.material, catalogCodeByCmId),
              quantity: qty,
              unit: it.unit || '—',
              unitPrice,
              totalPrice: total,
              notes: this.purchaseOrderLineDetail(
                typeof it.notes === 'string' ? it.notes : '',
                it.material
              ),
              isWinner: true,
            };
          }),
        });
        sectionSupplierIds.add(sid);
      }

      // Se abriu pela OC, prioriza o fornecedor ganhador dela no início do PDF.
      if (comparisonFocusPo) {
        const focusSid = String(
          (comparisonFocusPo as { supplierId?: string }).supplierId || ''
        );
        if (focusSid) {
          sections.sort((a, b) => {
            const aId = String((a.supplier as { id?: string } | null)?.id || '');
            const bId = String((b.supplier as { id?: string } | null)?.id || '');
            if (aId === focusSid && bId !== focusSid) return -1;
            if (bId === focusSid && aId !== focusSid) return 1;
            return 0;
          });
        }
      }
    } else if (purchaseOrders.length > 0) {
      for (const po of purchaseOrders) {
        sections.push({
          orderNumber: po.orderNumber,
          orderDate: po.orderDate,
          expectedDelivery: po.expectedDelivery,
          deliveryAddress: po.deliveryAddress,
          paymentType: po.paymentType,
          paymentCondition: po.paymentCondition,
          paymentDetails: po.paymentDetails,
          freightAmount: this.toNumber(po.freightAmount),
          amountToPay: po.amountToPay != null ? this.toNumber(po.amountToPay) : null,
          notes: po.notes,
          buyerName: po.creator?.name || map.creator?.name || null,
          supplier: po.supplier,
          items: (po.items || []).map((it: any) => {
            const qty = this.toNumber(it.quantity);
            const unitPrice = this.toNumber(it.unitPrice);
            const total =
              it.totalPrice != null ? this.toNumber(it.totalPrice) : qty * unitPrice;
            return {
              label: this.materialCatalogLabel(it.material),
              code: this.materialCatalogCode(it.material, catalogCodeByCmId),
              quantity: qty,
              unit: it.unit || '—',
              unitPrice,
              totalPrice: total,
              notes: this.purchaseOrderLineDetail(
                typeof it.notes === 'string' ? it.notes : '',
                it.material
              ),
            };
          }),
        });
      }
    } else {
      // Sem OC ainda: monta seções pelos fornecedores vencedores (só dados do mapa/cadastro).
      const winnerSupplierIds = Array.from(
        new Set((map.winners || []).map((w: any) => w.winnerSupplierId).filter(Boolean))
      ) as string[];
      for (const supplierId of winnerSupplierIds) {
        const qs = (map.suppliers || []).find((s: any) => s.supplierId === supplierId);
        const supplier = qs?.supplier || (map.winners || []).find((w: any) => w.winnerSupplierId === supplierId)?.winnerSupplier;
        if (!supplier) continue;
        const winnerItems = (map.winners || []).filter((w: any) => w.winnerSupplierId === supplierId);
        const items = winnerItems.map((w: any) => {
          const mri = w.materialRequestItem;
          const qty = this.toNumber(mri?.quantity);
          const quote = (map.supplierItems || []).find(
            (si: any) =>
              si.supplierId === supplierId && si.materialRequestItemId === w.materialRequestItemId
          );
          const unitPrice = this.toNumber(quote?.unitPrice);
          const rmNote =
            (typeof mri?.notes === 'string' && mri.notes.trim()) ||
            (typeof mri?.observation === 'string' && mri.observation.trim()) ||
            '';
          return {
            label: this.materialCatalogLabel(mri?.material),
            code: this.materialCatalogCode(mri?.material, catalogCodeByCmId),
            quantity: qty,
            unit: mri?.unit || '—',
            unitPrice,
            totalPrice: qty * unitPrice,
            notes: this.purchaseOrderLineDetail(rmNote, mri?.material),
          };
        });
        sections.push({
          paymentType: qs?.paymentType,
          paymentCondition: qs?.paymentCondition,
          paymentDetails: qs?.paymentDetails,
          freightAmount: this.toNumber(qs?.freight),
          amountToPay: qs?.amountToPay != null ? this.toNumber(qs.amountToPay) : null,
          notes: qs?.observations,
          buyerName: map.creator?.name || null,
          supplier,
          items,
        });
      }
    }

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      // bottom menor que a altura do rodapé → evita página em branco ao desenhar o footer
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, left: 40, right: 40, bottom: 28 },
        bufferPages: true,
      });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      doc.on('error', reject);
      stream.on('finish', () => resolve(Buffer.concat(chunks)));
      doc.pipe(stream);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const left = 40;
      const right = pageWidth - 40;
      const contentWidth = right - left;
      const footerReserve = 42;
      let y = 36;

      const ensureSpace = (needed: number) => {
        if (y + needed <= pageHeight - footerReserve) return;
        doc.addPage();
        y = 40;
      };

      const drawHr = () => {
        doc
          .moveTo(left, y)
          .lineTo(right, y)
          .strokeColor('#94A3B8')
          .lineWidth(0.7)
          .stroke();
        y += 12;
      };

      /** Label + valor com coluna fixa (espaço entre label e valor, como no modelo). */
      const FIELD_SIZE = 8;
      const LABEL_GAP = 8;
      const LEFT_LABEL_W = 92;
      const RIGHT_LABEL_W = 58;
      const ROW_GAP = 5;

      const measureField = (label: string, value: string, width: number, labelColW: number) => {
        const v = (value || '').trim();
        if (!v) return 0;
        const valueW = Math.max(20, width - labelColW - LABEL_GAP);
        doc.font('Helvetica').fontSize(FIELD_SIZE);
        return Math.max(10, doc.heightOfString(v, { width: valueW }));
      };

      const drawField = (
        label: string,
        value: string,
        x: number,
        width: number,
        atY: number,
        labelColW: number
      ) => {
        const v = (value || '').trim();
        if (!v) return 0;
        const valueW = Math.max(20, width - labelColW - LABEL_GAP);
        doc.font('Helvetica').fontSize(FIELD_SIZE);
        const h = Math.max(10, doc.heightOfString(v, { width: valueW }));
        doc.fillColor('#0F172A');
        doc.font('Helvetica-Bold').text(label, x, atY, { width: labelColW, lineBreak: false });
        doc.font('Helvetica').text(v, x + labelColW + LABEL_GAP, atY, { width: valueW });
        return h;
      };

      const drawLabeledLine = (label: string, value: string, x = left, width = contentWidth) => {
        const text = (value || '').trim();
        if (!text) return;
        const h = measureField(label, text, width, LEFT_LABEL_W) || 10;
        ensureSpace(h + 4);
        drawField(label, text, x, width, y, LEFT_LABEL_W);
        y += h + ROW_GAP;
      };

      /** Duas colunas; valores afastados do label (não colados). */
      const drawTwoColRow = (
        leftCell: { label: string; value?: string | null },
        rightCell?: { label: string; value?: string | null }
      ) => {
        const gap = 16;
        const colW = (contentWidth - gap) / 2;
        const lv = (leftCell.value || '').trim();
        const rv = (rightCell?.value || '').trim();
        if (!lv && !rv) return;
        const hL = lv ? measureField(leftCell.label, lv, colW, LEFT_LABEL_W) : 0;
        const hR = rv && rightCell ? measureField(rightCell.label, rv, colW, RIGHT_LABEL_W) : 0;
        const rowH = Math.max(hL, hR, 10);
        ensureSpace(rowH + 4);
        if (lv) drawField(leftCell.label, lv, left, colW, y, LEFT_LABEL_W);
        if (rv && rightCell) {
          drawField(rightCell.label, rv, left + colW + gap, colW, y, RIGHT_LABEL_W);
        }
        y += rowH + ROW_GAP;
      };

      // —— Cabeçalho empresa: 2 colunas (igual fornecedor) + logo encostada ——
      const HEADER_SIZE = 8;
      const HEADER_ROW = 4;
      const headerTop = y;
      const logoMaxW = 100;
      const logoGap = 6;
      const textX = logoPath ? left + logoMaxW + logoGap : left;
      const textW = logoPath ? contentWidth - logoMaxW - logoGap : contentWidth;
      const HL = 52;
      const HR = 42;
      const headerColGap = 12;
      const headerColW = (textW - headerColGap) / 2;
      const headerRightX = textX + headerColW + headerColGap;
      y = headerTop;

      const drawHeaderField = (
        label: string,
        value: string,
        x: number,
        width: number,
        atY: number,
        labelColW: number
      ) => {
        const v = (value || '').trim();
        if (!v) return 0;
        const valueW = Math.max(18, width - labelColW - LABEL_GAP);
        doc.fillColor('#0F172A').fontSize(HEADER_SIZE);
        doc.font('Helvetica-Bold').text(label, x, atY, { width: labelColW, lineBreak: false });
        doc.font('Helvetica').text(v, x + labelColW + LABEL_GAP, atY, {
          width: valueW,
          lineBreak: false,
          ellipsis: true,
        });
        return 10;
      };

      const headerFull = (label: string, value?: string | null) => {
        const v = (value || '').trim();
        if (!v) return;
        drawHeaderField(label, v, textX, textW, y, HL);
        y += 10 + HEADER_ROW;
      };

      const headerTwo = (
        a: { label: string; value?: string | null; lw?: number },
        b?: { label: string; value?: string | null; lw?: number }
      ) => {
        const av = (a.value || '').trim();
        const bv = (b?.value || '').trim();
        if (!av && !bv) return;
        const aLw = a.lw ?? HL;
        const bLw = b?.lw ?? HR;
        if (av) drawHeaderField(a.label, av, textX, headerColW, y, aLw);
        if (bv && b) drawHeaderField(b.label, bv, headerRightX, headerColW, y, bLw);
        y += 10 + HEADER_ROW;
      };

      headerFull('Empresa: ', company.name);
      headerFull('CNPJ: ', company.cnpj);

      if (useUnb) {
        headerTwo(
          { label: 'Rua: ', value: company.street },
          { label: 'Nº: ', value: company.streetNumber, lw: 28 }
        );
        headerTwo(
          { label: 'Bairro: ', value: company.neighborhood },
          { label: 'Comp: ', value: company.complement, lw: 36 }
        );
        headerTwo(
          { label: 'Cidade: ', value: company.city },
          { label: 'UF: ', value: company.state, lw: 28 }
        );
        headerTwo(
          { label: 'Telefone: ', value: company.phone },
          { label: 'E-mail: ', value: company.email, lw: 42 }
        );
      } else {
        if ((company.subtitle || '').trim()) {
          doc.font('Helvetica').fontSize(7).fillColor('#334155').text(company.subtitle!, textX, y, {
            width: textW,
          });
          y += 10;
        }
        if ((company.addressLine || '').trim()) {
          headerFull('Endereço: ', company.addressLine);
        }
        headerTwo(
          { label: 'Telefone: ', value: company.phone },
          { label: 'E-mail: ', value: company.email, lw: 42 }
        );
      }

      const textBottom = y;
      const textBlockH = textBottom - headerTop;
      if (logoPath) {
        try {
          const logoH = Math.min(Math.max(textBlockH, 58), 88);
          const logoY = headerTop + Math.max(0, (textBlockH - logoH) / 2);
          doc.image(logoPath, left, logoY, { fit: [logoMaxW, logoH] });
        } catch {
          // ignora logo inválida
        }
      }
      y = Math.max(textBottom, headerTop + (logoPath ? Math.min(Math.max(textBlockH, 58), 88) : 0)) + 8;

      if (sections.length === 0) {
        ensureSpace(40);
        doc
          .fillColor('#64748B')
          .font('Helvetica')
          .fontSize(10)
          .text(
            kind === 'comparison'
              ? 'Nenhuma cotação registrada neste mapa.'
              : 'Nenhuma cotação vencedora ou OC vinculada a este mapa.',
            left,
            y,
            {
              width: contentWidth,
            }
          );
        y += 20;
      }

      if (kind === 'comparison' && sections.length > 0) {
        const supplierCount = sections.length;
        const focusOcDisplay = comparisonFocusPo?.orderNumber
          ? this.formatOcDisplayNumber(String(comparisonFocusPo.orderNumber))
          : '';
        const comparisonTitle = focusOcDisplay
          ? `Comparativo — OC No. ${focusOcDisplay}`
          : 'Comparativo';
        ensureSpace(48);
        doc
          .fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(14)
          .text(comparisonTitle, left, y, {
            width: contentWidth,
            align: 'center',
          });
        y += 18;
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#475569')
          .text('Todas as cotações registradas; itens ganhadores marcados como VENCEDOR.', left, y, {
            width: contentWidth,
            align: 'center',
          });
        y += 12;
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#0F172A')
          .text(
            `${supplierCount} fornecedor${supplierCount === 1 ? '' : 'es'} cotado${supplierCount === 1 ? '' : 's'} neste mapa`,
            left,
            y,
            {
              width: contentWidth,
              align: 'center',
            }
          );
        y += 16;
      }

      sections.forEach((section, sectionIndex) => {
        if (sectionIndex > 0) {
          ensureSpace(60);
          y += 4;
          drawHr();
        }

        const ocDisplay = section.orderNumber
          ? this.formatOcDisplayNumber(section.orderNumber)
          : '';
        if (ocDisplay) {
          ensureSpace(64);
          y += 16;
          doc
            .fillColor('#0F172A')
            .font('Helvetica-Bold')
            .fontSize(18)
            .text(`Ordem de Compra No. ${ocDisplay}`, left, y, {
              width: contentWidth,
              align: 'center',
            });
          y += 26;
          const orderDateTime = this.formatDateTimeBr(section.orderDate);
          if (orderDateTime) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#475569')
              .text(orderDateTime, left, y, { width: contentWidth, align: 'center' });
            y += 18;
          }
          y += 10;
        } else if (section.isQuoteComparison) {
          const won = section.wonItemCount ?? 0;
          const supplierName = (
            section.supplier?.name ||
            section.supplier?.tradeName ||
            'Fornecedor'
          ).trim();
          ensureSpace(36);
          doc
            .fillColor('#0F172A')
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(supplierName, left, y, { width: contentWidth });
          y += 14;
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(won > 0 ? '#047857' : '#64748B')
            .text(
              won > 0
                ? `Vencedor em ${won} item${won === 1 ? '' : 's'} deste mapa.`
                : 'Sem itens vencedores neste mapa.',
              left,
              y,
              { width: contentWidth }
            );
          y += 12;
        }

        // Fornecedor — 2 colunas com label/valor afastados
        const s = section.supplier || {};
        const dash = (v?: string | null) => {
          const t = (v || '').trim();
          return t || '—';
        };
        ensureSpace(150);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text('Dados do fornecedor', left, y);
        y += 20;
        if (s.name) drawLabeledLine('Razão social: ', s.name);
        drawTwoColRow(
          { label: 'Nome fantasia: ', value: s.tradeName },
          { label: 'Código: ', value: s.code }
        );
        drawTwoColRow(
          { label: 'CNPJ: ', value: s.cnpj },
          { label: 'IE: ', value: s.stateRegistration }
        );
        drawTwoColRow(
          { label: 'Telefone: ', value: s.phone || s.mobile },
          { label: 'E-mail: ', value: s.email }
        );
        if (s.contactName) drawLabeledLine('Contato: ', s.contactName);
        drawTwoColRow(
          { label: 'Rua: ', value: s.street },
          { label: 'Nº: ', value: s.streetNumber }
        );
        drawTwoColRow(
          { label: 'Bairro: ', value: s.neighborhood },
          { label: 'Cidade: ', value: s.city }
        );
        drawTwoColRow(
          { label: 'CEP: ', value: s.zipCode },
          { label: 'UF: ', value: s.state }
        );
        if (s.complement) drawLabeledLine('Comp: ', s.complement);
        if (
          !s.street &&
          !s.neighborhood &&
          !s.city &&
          !s.zipCode &&
          (s.address || '').trim()
        ) {
          drawLabeledLine('Endereço: ', String(s.address).trim());
        }
        // Dados bancários — sempre exibir (mesmo vazios)
        drawTwoColRow(
          { label: 'Banco: ', value: dash(s.bank) },
          { label: 'Agência: ', value: dash(s.agency) }
        );
        drawTwoColRow(
          { label: 'Conta: ', value: dash(s.account) },
          { label: 'Dígito: ', value: dash(s.accountDigit) }
        );
        drawTwoColRow(
          { label: 'Tipo chave PIX: ', value: dash(s.pixKeyType) },
          { label: 'Chave PIX: ', value: dash(s.pixKey) }
        );
        y += 6;

        // Requisição de Material — ID + Ordem de serviço (ex.: AD-725)
        {
          const osLabel = this.formatRmOsLabel(mr);
          const rmId = this.formatRmDisplayId(mr?.requestNumber);
          const posto =
            (mr?.costCenter?.name || '').trim() || (mr?.costCenter?.code || '').trim();
          const scDesc = (mr?.description || '').trim();
          const hasScBlock = Boolean(osLabel || rmId || posto || scDesc);
          if (hasScBlock) {
            ensureSpace(scDesc ? 70 : 48);
            doc
              .fillColor('#0F172A')
              .font('Helvetica-Bold')
              .fontSize(11)
              .text('Requisição de Material', left, y);
            y += 20;
            drawTwoColRow(
              { label: 'ID: ', value: rmId || '—' },
              { label: 'Ordem de serviço: ', value: osLabel || '—' }
            );
            if (posto) {
              drawLabeledLine('Posto: ', posto);
            }
            if (scDesc) {
              drawLabeledLine('Solicitação: ', scDesc);
            }
            y += 6;
          }
        }

        // Pagamento e entrega — só campos preenchidos
        const payCond = [
          this.paymentConditionLabel(section.paymentCondition),
          this.paymentTypeLabel(section.paymentType),
        ]
          .filter(Boolean)
          .join(' — ');
        const deliveryDate = this.formatDateBr(section.expectedDelivery);
        const hasPaymentBlock =
          Boolean(payCond) ||
          Boolean(deliveryDate) ||
          Boolean((section.deliveryAddress || '').trim()) ||
          Boolean((section.paymentDetails || '').trim()) ||
          Boolean((section.buyerName || '').trim()) ||
          (section.freightAmount != null && section.freightAmount > 0);

        if (hasPaymentBlock) {
          ensureSpace(50);
          doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text('Pagamento e entrega', left, y);
          y += 20;
          drawTwoColRow(
            { label: 'Cond. pagto.: ', value: payCond },
            { label: 'Data entrega: ', value: deliveryDate }
          );
          if ((section.deliveryAddress || '').trim()) {
            drawLabeledLine('Local de entrega: ', String(section.deliveryAddress).trim());
          }
          if ((section.paymentDetails || '').trim()) {
            drawLabeledLine('Dados do pagamento: ', String(section.paymentDetails).trim());
          }
          drawTwoColRow(
            {
              label: 'Frete: ',
              value:
                section.freightAmount != null && section.freightAmount > 0
                  ? this.formatCurrency(section.freightAmount)
                  : '',
            },
            { label: 'Comprador: ', value: section.buyerName }
          );
          y += 6;
        }

        // Itens — colunas dentro da margem; texts separados (PDFKit chain quebra alinhamento)
        ensureSpace(50);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text('Itens', left, y);
        y += 12;

        const wItem = 26;
        const wCode = 48;
        const wQty = 40;
        const wUnit = 34;
        const wUnitPrice = 66;
        const wTotal = 68;
        const wResult = section.isQuoteComparison ? 54 : 0;
        const wDesc =
          contentWidth - (wItem + wCode + wQty + wUnit + wUnitPrice + wTotal + wResult);
        const col = {
          item: left,
          code: left + wItem,
          desc: left + wItem + wCode,
          qty: left + wItem + wCode + wDesc,
          unit: left + wItem + wCode + wDesc + wQty,
          unitPrice: left + wItem + wCode + wDesc + wQty + wUnit,
          total: left + wItem + wCode + wDesc + wQty + wUnit + wUnitPrice,
          result: left + wItem + wCode + wDesc + wQty + wUnit + wUnitPrice + wTotal,
        };

        const drawItemsHeader = () => {
          doc.rect(left, y, contentWidth, 18).fill('#111827');
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
          doc.text('ITEM', col.item + 2, y + 5, { width: wItem - 3, lineBreak: false });
          doc.text('CÓDIGO', col.code, y + 5, { width: wCode - 3, lineBreak: false });
          doc.text('DESCRIÇÃO', col.desc, y + 5, { width: wDesc - 4, lineBreak: false });
          doc.text('QTD.', col.qty, y + 5, { width: wQty - 2, align: 'center', lineBreak: false });
          doc.text('UND', col.unit, y + 5, { width: wUnit, align: 'center', lineBreak: false });
          doc.text('V. UNIT.', col.unitPrice, y + 5, {
            width: wUnitPrice - 2,
            align: 'right',
            lineBreak: false,
          });
          doc.text('TOTAL', col.total, y + 5, {
            width: wTotal - 2,
            align: 'right',
            lineBreak: false,
          });
          if (section.isQuoteComparison) {
            doc.text('RESULTADO', col.result, y + 5, {
              width: wResult - 2,
              align: 'center',
              lineBreak: false,
            });
          }
          y += 20;
        };
        drawItemsHeader();

        let productsTotal = 0;
        section.items.forEach((item, idx) => {
          productsTotal += item.totalPrice;
          const detail = (item.notes || '').trim();
          const codeText = (item.code || '').trim() || '—';
          doc.font('Helvetica').fontSize(8);
          const descHeight = doc.heightOfString(item.label || '—', { width: wDesc - 4 });
          let detailHeight = 0;
          if (detail) {
            doc.fontSize(7);
            detailHeight = doc.heightOfString(detail, { width: wDesc - 4 });
            doc.fontSize(8);
          }
          const rowH = Math.max(18, descHeight + (detail ? 2 + detailHeight : 0) + 8);
          if (y + rowH > pageHeight - footerReserve - 8) {
            doc.addPage();
            y = 40;
            drawItemsHeader();
            doc.font('Helvetica').fontSize(8);
          }
          const rowY = y + 4;
          if (item.isWinner) {
            doc.rect(left, y, contentWidth, rowH).fill('#ECFDF5');
          }
          doc.fillColor('#0F172A').font('Helvetica').fontSize(8);
          doc.text(String(idx + 1), col.item + 2, rowY, { width: wItem - 3, lineBreak: false });
          doc.text(codeText, col.code, rowY, { width: wCode - 3, lineBreak: false });
          doc.text(item.label || '—', col.desc, rowY, { width: wDesc - 4 });
          if (detail) {
            doc
              .fillColor('#64748B')
              .fontSize(7)
              .text(detail, col.desc, rowY + descHeight + 1, { width: wDesc - 4 });
            doc.fillColor('#0F172A').fontSize(8);
          }
          doc.text(String(item.quantity), col.qty, rowY, {
            width: wQty - 2,
            align: 'center',
            lineBreak: false,
          });
          doc.text(item.unit || '—', col.unit, rowY, {
            width: wUnit,
            align: 'center',
            lineBreak: false,
          });
          doc.text(this.formatCurrency(item.unitPrice), col.unitPrice, rowY, {
            width: wUnitPrice - 2,
            align: 'right',
            lineBreak: false,
          });
          doc.text(this.formatCurrency(item.totalPrice), col.total, rowY, {
            width: wTotal - 2,
            align: 'right',
            lineBreak: false,
          });
          if (section.isQuoteComparison) {
            if (item.isWinner) {
              doc
                .fillColor('#047857')
                .font('Helvetica-Bold')
                .fontSize(7)
                .text('VENCEDOR', col.result, rowY, {
                  width: wResult - 2,
                  align: 'center',
                  lineBreak: false,
                });
              doc.fillColor('#0F172A').font('Helvetica').fontSize(8);
            } else {
              doc
                .fillColor('#94A3B8')
                .font('Helvetica')
                .fontSize(7)
                .text('—', col.result, rowY, {
                  width: wResult - 2,
                  align: 'center',
                  lineBreak: false,
                });
              doc.fillColor('#0F172A').font('Helvetica').fontSize(8);
            }
          }
          doc
            .moveTo(left, y + rowH)
            .lineTo(right, y + rowH)
            .strokeColor('#E5E7EB')
            .lineWidth(0.6)
            .stroke();
          y += rowH;
        });

        if (section.items.length === 0) {
          ensureSpace(20);
          doc
            .fillColor('#64748B')
            .font('Helvetica')
            .fontSize(9)
            .text('Nenhum item neste bloco.', left, y);
          y += 16;
        }

        // Totais
        const freight = section.freightAmount || 0;
        const totalCompra =
          section.amountToPay != null && Number.isFinite(section.amountToPay)
            ? section.amountToPay
            : productsTotal + freight;
        ensureSpace(48);
        y += 8;
        const labelW = 118;
        const valueW = 78;
        const totalsX = right - labelW - valueW;
        doc.font('Helvetica').fontSize(9).fillColor('#0F172A');
        doc.text('TOTAL PRODUTOS:', totalsX, y, { width: labelW, align: 'right', lineBreak: false });
        doc.text(this.formatCurrency(productsTotal), totalsX + labelW, y, {
          width: valueW,
          align: 'right',
          lineBreak: false,
        });
        y += 13;
        if (freight > 0) {
          doc.text('FRETE:', totalsX, y, { width: labelW, align: 'right', lineBreak: false });
          doc.text(this.formatCurrency(freight), totalsX + labelW, y, {
            width: valueW,
            align: 'right',
            lineBreak: false,
          });
          y += 13;
        }
        doc.font('Helvetica-Bold');
        doc.text('TOTAL COMPRA:', totalsX, y, { width: labelW, align: 'right', lineBreak: false });
        doc.text(this.formatCurrency(totalCompra), totalsX + labelW, y, {
          width: valueW,
          align: 'right',
          lineBreak: false,
        });
        y += 16;

        if ((section.notes || '').trim()) {
          drawLabeledLine('Observações: ', String(section.notes).trim());
        }
      });

      // Rodapé em cada página real (bufferPages). Baixa a margem inferior só no
      // desenho do footer — senão o PDFKit cria uma página em branco.
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.page.margins.bottom = 10;
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#64748B')
          .text('Documento gerado automaticamente pelo Sistema Gennesis.', left, pageHeight - 22, {
            width: contentWidth,
            align: 'center',
            lineBreak: false,
          });
      }

      doc.end();
    });

    await savePersistentBuffer({
      folder: `quote-maps/${map.id}`,
      fileName: snapshotFileName,
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      keepLocalCopy: true,
    });

    return publicUrl;
  }

  private snapshotPdfAbsolutePath(
    quoteMapId: string,
    purchaseOrderId?: string,
    kind: 'snapshot' | 'comparison' = 'snapshot'
  ): string {
    const fileName =
      kind === 'comparison'
        ? purchaseOrderId?.trim()
          ? `comparison-${purchaseOrderId.trim()}.pdf`
          : 'comparison.pdf'
        : purchaseOrderId?.trim()
          ? `snapshot-${purchaseOrderId.trim()}.pdf`
          : 'snapshot.pdf';
    return path.join(backendUploadsRoot, 'quote-maps', quoteMapId, fileName);
  }

  async getOrCreateSnapshotPdfPath(quoteMapId: string, purchaseOrderId?: string): Promise<string> {
    const map = await this.db.quoteMap.findUnique({
      where: { id: quoteMapId },
      select: { id: true }
    });
    if (!map) throw new Error('Mapa de cotação não encontrado');

    const absPath = this.snapshotPdfAbsolutePath(quoteMapId, purchaseOrderId);
    // Regera para garantir layout mais atual do snapshot.
    await this.saveQuoteMapSnapshotPdf(quoteMapId, { purchaseOrderId });
    return absPath;
  }

  async getOrCreateComparisonPdfPath(
    quoteMapId: string,
    purchaseOrderId?: string
  ): Promise<string> {
    let mapId = quoteMapId;
    const poId = purchaseOrderId?.trim() || '';

    if (poId) {
      const po = await this.db.purchaseOrder.findUnique({
        where: { id: poId },
        select: { id: true, quoteMapId: true },
      });
      if (!po) throw new Error('OC não encontrada');
      // Sempre usa o mapa vinculado à OC (evita misturar outra cotação da mesma RM).
      if (po.quoteMapId) mapId = po.quoteMapId;
    }

    const map = await this.db.quoteMap.findUnique({
      where: { id: mapId },
      select: { id: true },
    });
    if (!map) throw new Error('Mapa de cotação não encontrado');

    const absPath = this.snapshotPdfAbsolutePath(mapId, poId || undefined, 'comparison');
    await this.saveQuoteMapSnapshotPdf(mapId, {
      kind: 'comparison',
      purchaseOrderId: poId || undefined,
    });
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

    const coveredRows = await this.db.purchaseOrderItem.findMany({
      where: {
        materialRequestItemId: { not: null },
        purchaseOrder: {
          materialRequestId: rm.id,
          status: { in: [...OC_STATUSES_COVERING_RM_ITEMS] },
        },
      },
      select: { materialRequestItemId: true },
    });
    const coveredItemIds = new Set<string>(
      coveredRows
        .map((r: { materialRequestItemId: string | null }) => r.materialRequestItemId)
        .filter(Boolean)
    );
    const openItems = rm.items.filter((item: { id: string }) => !coveredItemIds.has(item.id));
    if (openItems.length === 0) {
      throw new Error('Todos os itens desta SC já estão em ordem de compra ativa');
    }

    const supplierIds = Array.from(new Set(data.supplierIds));
    if (supplierIds.length === 0) throw new Error('Selecione ao menos um fornecedor no mapa');

    const openItemIds = openItems.map((item: { id: string }) => item.id);

    // Preserva cotações/vencedores de itens já cobertos por OC.
    // Wipe total apagava o histórico e o PDF comparativo ficava só com o último lote.
    await this.db.$transaction([
      this.db.quoteMapSupplierItem.deleteMany({
        where: {
          quoteMapId,
          ...(openItemIds.length > 0
            ? { materialRequestItemId: { in: openItemIds } }
            : { materialRequestItemId: { in: [] } }),
        },
      }),
      this.db.quoteMapWinnerItem.deleteMany({
        where: {
          quoteMapId,
          ...(openItemIds.length > 0
            ? { materialRequestItemId: { in: openItemIds } }
            : { materialRequestItemId: { in: [] } }),
        },
      }),
    ]);

    // Upsert frete dos fornecedores selecionados (mantém fornecedores só do histórico coberto)
    for (const supplierId of supplierIds) {
      await this.db.quoteMapSupplier.upsert({
        where: { quoteMapId_supplierId: { quoteMapId, supplierId } },
        create: {
          quoteMapId,
          supplierId,
          freight: new Decimal(data.freightBySupplier[supplierId] ?? 0),
        },
        update: {
          freight: new Decimal(data.freightBySupplier[supplierId] ?? 0),
        },
      });
    }

    const unitPriceMap = new Map<string, Decimal>(); // key: supplierId:itemId
    for (const q of data.unitPrices) {
      if (!supplierIds.includes(q.supplierId)) continue;
      if (coveredItemIds.has(q.materialRequestItemId)) continue;
      unitPriceMap.set(`${q.supplierId}:${q.materialRequestItemId}`, new Decimal(q.unitPrice));
    }

    const openUnitPrices = data.unitPrices.filter(
      (q) =>
        supplierIds.includes(q.supplierId) && !coveredItemIds.has(q.materialRequestItemId)
    );
    if (openUnitPrices.length > 0) {
      await this.db.$transaction(
        openUnitPrices.map((q) =>
          this.db.quoteMapSupplierItem.create({
            data: {
              quoteMapId,
              supplierId: q.supplierId,
              materialRequestItemId: q.materialRequestItemId,
              unitPrice: new Decimal(q.unitPrice),
            },
          })
        )
      );
    }

    // Calcular vencedor por item (somente itens ainda abertos):
    // score = unitPrice * quantidade + frete
    const winnersToCreate: any[] = [];

    const qtyOverrides = data.itemQuantities ?? {};

    for (const item of openItems) {
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
        freight: bestFreight,
      });
    }

    if (winnersToCreate.length > 0) {
      await this.db.quoteMapWinnerItem.createMany({ data: winnersToCreate });
    }

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

    const winnersRaw = await this.db.quoteMapWinnerItem.findMany({
      where: { quoteMapId, winnerSupplierId: { in: supplierIds } },
      include: { materialRequestItem: true }
    });

    const coveredRows = await this.db.purchaseOrderItem.findMany({
      where: {
        materialRequestItemId: { not: null },
        purchaseOrder: {
          materialRequestId: rm.id,
          status: { in: [...OC_STATUSES_COVERING_RM_ITEMS] },
        },
      },
      select: { materialRequestItemId: true },
    });
    const coveredItemIds = new Set<string>(
      coveredRows
        .map((r: { materialRequestItemId: string | null }) => r.materialRequestItemId)
        .filter(Boolean)
    );
    const winners = (winnersRaw as any[]).filter(
      (w) => !coveredItemIds.has(w.materialRequestItemId)
    );

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
    const comparisonPdfUrl = `/uploads/quote-maps/${quoteMapId}/comparison.pdf`;
    // PDF fora do caminho crítico — o download regenera sob demanda se ainda não existir.
    void this.saveQuoteMapSnapshotPdf(quoteMapId).catch((err) => {
      console.error('[QuoteMap] snapshot PDF em background falhou', quoteMapId, err);
    });
    void this.saveQuoteMapSnapshotPdf(quoteMapId, { kind: 'comparison' }).catch((err) => {
      console.error('[QuoteMap] comparison PDF em background falhou', quoteMapId, err);
    });
    return { orders: createdOrders, snapshotPdfUrl, comparisonPdfUrl };
  }
}
