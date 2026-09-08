import { prisma } from './prisma';
import type { GestaoOsPartLine } from './gestaoOsParts';

async function availableBalance(materialId: string, costCenterId: string | null): Promise<number> {
  const grouped = await prisma.stockMovement.groupBy({
    by: ['type'],
    where: { materialId, costCenterId },
    _sum: { quantity: true }
  });
  const totalIn = grouped.find((item) => item.type === 'IN')?._sum.quantity || 0;
  const totalOut = grouped.find((item) => item.type === 'OUT')?._sum.quantity || 0;
  return totalIn - totalOut;
}

/** Baixa no estoque as peças da OS que tiverem materialId e saldo. */
export async function deductGestaoOsPartsFromStock(input: {
  parts: GestaoOsPartLine[];
  actorId: string;
  osLabel: string;
}): Promise<GestaoOsPartLine[]> {
  const next: GestaoOsPartLine[] = [];
  for (const part of input.parts) {
    if (!part.materialId || part.stockDeductedAt) {
      next.push(part);
      continue;
    }
    const material = await prisma.constructionMaterial.findUnique({
      where: { id: part.materialId },
      select: { id: true, name: true }
    });
    if (!material) {
      next.push({
        ...part,
        notes: [part.notes, 'Material do estoque não encontrado'].filter(Boolean).join(' · ')
      });
      continue;
    }
    const lastOut = await prisma.stockMovement.findFirst({
      where: { materialId: material.id, type: 'OUT' },
      orderBy: { createdAt: 'desc' },
      select: { costCenterId: true }
    });
    const lastIn = await prisma.stockMovement.findFirst({
      where: { materialId: material.id, type: 'IN' },
      orderBy: { createdAt: 'desc' },
      select: { costCenterId: true }
    });
    const costCenterId = lastOut?.costCenterId ?? lastIn?.costCenterId ?? null;
    const balance = await availableBalance(material.id, costCenterId);
    if (balance < part.quantity) {
      next.push({
        ...part,
        notes: [part.notes, `Sem saldo no estoque (disp. ${balance}). Abra uma RM.`]
          .filter(Boolean)
          .join(' · ')
      });
      continue;
    }
    await prisma.stockMovement.create({
      data: {
        materialId: material.id,
        costCenterId,
        type: 'OUT',
        quantity: part.quantity,
        notes: `${input.osLabel} · ${part.name}`,
        userId: input.actorId
      }
    });
    next.push({
      ...part,
      name: part.name || material.name,
      stockDeductedAt: new Date().toISOString()
    });
  }
  return next;
}
