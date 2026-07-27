import { getPrisma } from '../lib/prisma';
import { getPncpEnviadoAnaliseByNumero } from './pncpEnviadoAnaliseStore';
import {
  createPncpRejeitado,
  deletePncpRejeitadoByNumero,
  getPncpRejeitadoByNumero,
} from './pncpRejeitadoStore';

export type RejeitarPncpResult = {
  alreadyRejected: boolean;
  numeroControlePNCP: string;
  rejeitadoAt: string;
};

export async function rejeitarPncpContratacao(input: {
  numeroControlePNCP: string;
  userId: string;
}): Promise<RejeitarPncpResult> {
  const numero = String(input.numeroControlePNCP || '').trim();
  if (!numero) {
    throw new Error('Informe o número de controle PNCP.');
  }

  const enviado = await getPncpEnviadoAnaliseByNumero(numero);
  if (enviado) {
    throw new Error('Esta licitação já foi enviada para análise e não pode ser rejeitada.');
  }

  const existing = await getPncpRejeitadoByNumero(numero);
  if (existing) {
    return {
      alreadyRejected: true,
      numeroControlePNCP: existing.numeroControlePNCP,
      rejeitadoAt: existing.rejeitadoAt.toISOString(),
    };
  }

  const pncp = await getPrisma().pncpContratacao.findUnique({
    where: { numeroControlePNCP: numero },
    select: { numeroControlePNCP: true },
  });
  if (!pncp) {
    throw new Error('Licitação PNCP não encontrada no espelho local.');
  }

  const created = await createPncpRejeitado({
    numeroControlePNCP: numero,
    rejeitadoBy: input.userId,
  });

  return {
    alreadyRejected: false,
    numeroControlePNCP: created.numeroControlePNCP,
    rejeitadoAt: created.rejeitadoAt.toISOString(),
  };
}

/** Se o usuário enviar depois de rejeitar, remove a rejeição. */
export async function clearPncpRejeicaoIfAny(numeroControlePNCP: string): Promise<void> {
  await deletePncpRejeitadoByNumero(numeroControlePNCP);
}
