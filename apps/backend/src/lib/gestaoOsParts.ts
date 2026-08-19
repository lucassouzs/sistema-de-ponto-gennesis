import { randomUUID } from 'crypto';
import { createError } from '../middleware/errorHandler';

export type GestaoOsPartLine = {
  id: string;
  name: string;
  supplier: string | null;
  quantity: number;
  unitCost: number | null;
  expectedAt: string | null;
  notes: string | null;
  materialId: string | null;
  stockDeductedAt: string | null;
};

export function parseParts(value: unknown): GestaoOsPartLine[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw createError('Lista de peças inválida', 400);
  const out: GestaoOsPartLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) continue;
    const quantity = Number(row.quantity ?? 1);
    const unitCost =
      row.unitCost == null || row.unitCost === ''
        ? null
        : Number(row.unitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw createError('Quantidade de peça inválida', 400);
    }
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      throw createError('Custo unitário inválido', 400);
    }
    let expectedAt: string | null = null;
    if (row.expectedAt) {
      const d = new Date(String(row.expectedAt));
      if (Number.isNaN(d.getTime())) throw createError('Data prevista da peça inválida', 400);
      expectedAt = d.toISOString();
    }
    out.push({
      id: String(row.id ?? randomUUID()),
      name,
      supplier: row.supplier ? String(row.supplier).trim() || null : null,
      quantity,
      unitCost,
      expectedAt,
      notes: row.notes ? String(row.notes).trim() || null : null,
      materialId: row.materialId ? String(row.materialId).trim() || null : null,
      stockDeductedAt: row.stockDeductedAt ? String(row.stockDeductedAt) : null
    });
  }
  return out;
}

export function parsePartsLoose(value: unknown): GestaoOsPartLine[] {
  try {
    return parseParts(value);
  } catch {
    return [];
  }
}

export function partsTotalCost(parts: GestaoOsPartLine[]): number {
  return parts.reduce((sum, p) => sum + (p.unitCost ?? 0) * p.quantity, 0);
}
