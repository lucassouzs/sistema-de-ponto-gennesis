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

export class QuoteMapService {
  private purchaseOrderService = new PurchaseOrderService();
  private db: any = prisma as any;

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

  private findCompanyLogoPath(...contextLabels: (string | null | undefined)[]): string | null {
    const useUnb = shouldUseUnbBranding(...contextLabels);
    return resolvePdfLogoPathFromPublic(useUnb);
  }

  private async saveQuoteMapSnapshotPdf(quoteMapId: string): Promise<string> {
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

    const publicUrl = `/uploads/quote-maps/${map.id}/snapshot.pdf`;
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
      supplier: any;
      items: Array<{
        label: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        totalPrice: number;
        notes?: string | null;
      }>;
    };

    const sections: SnapshotSection[] = [];

    if (Array.isArray(map.purchaseOrders) && map.purchaseOrders.length > 0) {
      for (const po of map.purchaseOrders) {
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
              label:
                it.material?.description?.trim() ||
                it.material?.name?.trim() ||
                it.materialId ||
                '—',
              quantity: qty,
              unit: it.unit || '—',
              unitPrice,
              totalPrice: total,
              notes: typeof it.notes === 'string' ? it.notes.trim() || null : null,
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
            label:
              mri?.material?.description?.trim() ||
              mri?.material?.name?.trim() ||
              w.materialRequestItemId ||
              '—',
            quantity: qty,
            unit: mri?.unit || '—',
            unitPrice,
            totalPrice: qty * unitPrice,
            notes: rmNote || null,
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
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
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
      let y = 36;

      const ensureSpace = (needed: number) => {
        if (y + needed <= pageHeight - 48) return;
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
          .text('Nenhuma cotação vencedora ou OC vinculada a este mapa.', left, y, {
            width: contentWidth,
          });
        y += 20;
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
        }

        // Fornecedor — 2 colunas com label/valor afastados
        const s = section.supplier || {};
        ensureSpace(90);
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
        y += 6;

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

        const wItem = 28;
        const wQty = 42;
        const wUnit = 36;
        const wUnitPrice = 70;
        const wTotal = 72;
        const wDesc = contentWidth - (wItem + wQty + wUnit + wUnitPrice + wTotal);
        const col = {
          item: left,
          desc: left + wItem,
          qty: left + wItem + wDesc,
          unit: left + wItem + wDesc + wQty,
          unitPrice: left + wItem + wDesc + wQty + wUnit,
          total: left + wItem + wDesc + wQty + wUnit + wUnitPrice,
        };

        const drawItemsHeader = () => {
          doc.rect(left, y, contentWidth, 18).fill('#111827');
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
          doc.text('ITEM', col.item + 3, y + 5, { width: wItem - 4, lineBreak: false });
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
          y += 20;
        };
        drawItemsHeader();

        let productsTotal = 0;
        section.items.forEach((item, idx) => {
          productsTotal += item.totalPrice;
          const detail = (item.notes || '').trim();
          doc.font('Helvetica').fontSize(8);
          const descHeight = doc.heightOfString(item.label || '—', { width: wDesc - 4 });
          let detailHeight = 0;
          if (detail) {
            doc.fontSize(7);
            detailHeight = doc.heightOfString(detail, { width: wDesc - 4 });
            doc.fontSize(8);
          }
          const rowH = Math.max(18, descHeight + (detail ? 2 + detailHeight : 0) + 8);
          if (y + rowH > pageHeight - 70) {
            doc.addPage();
            y = 40;
            drawItemsHeader();
            doc.font('Helvetica').fontSize(8);
          }
          const rowY = y + 4;
          doc.fillColor('#0F172A').font('Helvetica').fontSize(8);
          doc.text(String(idx + 1), col.item + 3, rowY, { width: wItem - 4, lineBreak: false });
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

      // Rodapé na margem inferior — lineBreak:false evita o PDFKit criar página em branco
      // (texto em y > pageHeight - margin dispara addPage automático).
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text('Documento gerado automaticamente pelo Sistema Gennesis.', left, pageHeight - 36, {
          width: contentWidth,
          align: 'center',
          lineBreak: false,
        });

      doc.end();
    });

    await savePersistentBuffer({
      folder: `quote-maps/${map.id}`,
      fileName: 'snapshot.pdf',
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      keepLocalCopy: true,
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
