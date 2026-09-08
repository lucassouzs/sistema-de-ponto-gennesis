import { prisma } from '../lib/prisma';
import { buildServiceOrderDisplayLabel } from './serviceOrderLabel';

export type ResolvedRmServiceOrder = {
  serviceOrderId: string | null;
  serviceOrder: string | null;
};

export async function resolveRmServiceOrderFields(input: {
  costCenterId: string;
  serviceOrderId?: string | null;
  serviceOrder?: string | null;
  projectId?: string | null;
}): Promise<ResolvedRmServiceOrder> {
  const explicitId =
    typeof input.serviceOrderId === 'string' ? input.serviceOrderId.trim() : '';

  if (explicitId) {
    const so = await prisma.service_orders.findUnique({
      where: { id: explicitId },
      include: {
        pleitos: {
          where: { updatedContractId: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { divSe: true, folderNumber: true, reportsBilling: true }
        }
      }
    });
    if (!so) {
      throw new Error('Ordem de serviço não encontrada');
    }
    if (so.costCenterId !== input.costCenterId) {
      throw new Error('A ordem de serviço não pertence ao centro de custo informado');
    }
    const label = buildServiceOrderDisplayLabel(so.numero, so.ano, so.pleitos);
    return { serviceOrderId: so.id, serviceOrder: label };
  }

  const text =
    (input.serviceOrder || '').trim() ||
    (input.projectId && !(input.projectId.length === 25 && input.projectId.startsWith('c'))
      ? input.projectId.trim()
      : '');

  return {
    serviceOrderId: null,
    serviceOrder: text || null
  };
}
