import { FuelTankLevelAfter } from '@prisma/client';
import { getPhotoAttachmentFromMessage, hasStoredPhoto } from '../lib/flowMedia';
import { prisma } from '../lib/prisma';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';

const FLOW_TYPE = 'FUEL_REFUEL_REPORT';

type ReportFlowStep =
  | 'MENU'
  | 'SELECT_REQUEST'
  | 'ASK_ODOMETER'
  | 'ASK_TANK'
  | 'ASK_LITERS'
  | 'ASK_PRICE'
  | 'ASK_RECEIPT'
  | 'ASK_OBSERVATIONS'
  | 'CONFIRM';

type ReportFlowPayload = {
  requestId?: string;
  displayNumber?: number;
  vehiclePlate?: string;
  odometerKm?: number;
  tankLevelAfter?: FuelTankLevelAfter;
  litersRefueled?: number;
  pricePerLiter?: number;
  receiptPhotoUrl?: string;
  receiptPhotoKey?: string;
  receiptPhotoName?: string;
  observations?: string;
  requestOptions?: Array<{
    id: string;
    displayNumber: number;
    label: string;
  }>;
};

const REPORT_INTENT =
  /^4$|\b(informar|registrar|lançar|lancar)\s+(o\s+)?abastecimento\b/i;

const CANCEL_WORDS = /^(cancelar|cancela|sair|parar|desistir)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;
const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;

const TANK_OPTIONS: Array<{ level: FuelTankLevelAfter; label: string }> = [
  { level: FuelTankLevelAfter.RESERVE, label: 'Reserva' },
  { level: FuelTankLevelAfter.QUARTER, label: '1/4 do tanque' },
  { level: FuelTankLevelAfter.HALF, label: '1/2 do tanque' },
  { level: FuelTankLevelAfter.THREE_QUARTERS, label: '3/4 do tanque' },
  { level: FuelTankLevelAfter.FULL, label: 'Tanque cheio' },
];

function tankLabel(level?: FuelTankLevelAfter): string {
  return TANK_OPTIONS.find((o) => o.level === level)?.label ?? '—';
}

function parseBrDecimal(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/r\$\s*/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseInteger(input: string): number | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function getActiveSession(chatId: string, userId: string) {
  return prisma.gennecyChatFlowSession.findUnique({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
  });
}

async function upsertSession(
  chatId: string,
  userId: string,
  step: ReportFlowStep,
  payload: ReportFlowPayload,
) {
  return prisma.gennecyChatFlowSession.upsert({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
    create: {
      chatId,
      userId,
      flowType: FLOW_TYPE,
      step,
      payload,
      status: 'ACTIVE',
    },
    update: { step, payload, status: 'ACTIVE' },
  });
}

async function completeSession(chatId: string, userId: string) {
  await prisma.gennecyChatFlowSession.updateMany({
    where: { chatId, userId, flowType: FLOW_TYPE, status: 'ACTIVE' },
    data: { status: 'COMPLETED' },
  });
}

async function cancelSession(chatId: string, userId: string) {
  await prisma.gennecyChatFlowSession.updateMany({
    where: { chatId, userId, flowType: FLOW_TYPE, status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  });
}

function formatRequestList(
  options: Array<{ id: string; displayNumber: number; label: string }>,
): string {
  if (options.length === 0) {
    return 'Não há solicitações aprovadas aguardando informe de abastecimento.';
  }
  const lines = options.map((o, i) => `${i + 1}. #${o.displayNumber} — ${o.label}`);
  return `Escolha a solicitação (digite o número da opção):\n${lines.join('\n')}`;
}

function resolveRequestChoice(
  input: string,
  options: Array<{ id: string; displayNumber: number; label: string }>,
): { id: string; displayNumber: number; label: string } | null {
  const trimmed = input.trim();
  const asIndex = parseInt(trimmed, 10);
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1];
  }
  const asNumber = parseInt(trimmed.replace(/^#/, ''), 10);
  if (Number.isFinite(asNumber)) {
    return options.find((o) => o.displayNumber === asNumber) ?? null;
  }
  return null;
}

function buildSummary(payload: ReportFlowPayload): string {
  return [
    '📋 Resumo do abastecimento:',
    `• Solicitação: #${payload.displayNumber ?? '—'}`,
    `• Veículo: ${payload.vehiclePlate ?? '—'}`,
    `• Hodômetro: ${payload.odometerKm?.toLocaleString('pt-BR') ?? '—'} km`,
    `• Tanque após abastecimento: ${tankLabel(payload.tankLevelAfter)}`,
    `• Litros: ${payload.litersRefueled?.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) ?? '—'}`,
    `• Valor por litro: ${payload.pricePerLiter != null ? formatMoney(payload.pricePerLiter) : '—'}`,
    `• Cupom fiscal: ${hasStoredPhoto(payload.receiptPhotoUrl, payload.receiptPhotoKey) ? '✅ enviado' : '—'}`,
    `• Observações: ${payload.observations?.trim() || '—'}`,
    '',
    'Confirma o envio? (sim / não)',
  ].join('\n');
}

export function messageHasFuelRefuelReportIntent(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  return REPORT_INTENT.test(text);
}

export class GennecyFuelRefuelReportFlowService {
  async hasActiveFlow(chatId: string, userId: string): Promise<boolean> {
    const session = await getActiveSession(chatId, userId);
    return Boolean(session && session.status === 'ACTIVE' && session.step !== 'MENU');
  }

  async processMessage(params: {
    chatId: string;
    userId: string;
    content: string;
    messageId?: string;
  }): Promise<{ handled: boolean; reply: string }> {
    const body = params.content.trim();
    const session = await getActiveSession(params.chatId, params.userId);
    const payload = (session?.payload ?? {}) as ReportFlowPayload;
    const step = (session?.step ?? 'MENU') as ReportFlowStep;

    if (CANCEL_WORDS.test(body)) {
      if (session?.status === 'ACTIVE' && step !== 'MENU') {
        await cancelSession(params.chatId, params.userId);
        return {
          handled: true,
          reply:
            'Informe de abastecimento cancelado. Digite **4** quando quiser informar novamente.',
        };
      }
    }

    const inActiveFlow = session?.status === 'ACTIVE' && step !== 'MENU';
    const wantsReport = messageHasFuelRefuelReportIntent(body);

    if (!inActiveFlow && !wantsReport) {
      return { handled: false, reply: '' };
    }

    if (!inActiveFlow && wantsReport) {
      const rows = await fuelRefuelRequestService.listAwaitingRefuelForRequester(params.userId);
      const requestOptions = rows.map((r) => ({
        id: r.id,
        displayNumber: r.displayNumber,
        label: `${r.vehiclePlate} — ${r.driverName}`,
      }));

      if (requestOptions.length === 0) {
        return {
          handled: true,
          reply:
            'Não encontrei solicitações aprovadas aguardando informe de abastecimento. Aguarde a aprovação do Suprimentos.',
        };
      }

      if (requestOptions.length === 1) {
        const only = requestOptions[0];
        await upsertSession(params.chatId, params.userId, 'ASK_ODOMETER', {
          requestId: only.id,
          displayNumber: only.displayNumber,
          vehiclePlate: rows[0].vehiclePlate,
        });
        return {
          handled: true,
          reply: `Vamos registrar o abastecimento da solicitação #${only.displayNumber}.\n\nQual o hodômetro atual (km)?`,
        };
      }

      await upsertSession(params.chatId, params.userId, 'SELECT_REQUEST', { requestOptions });
      return { handled: true, reply: formatRequestList(requestOptions) };
    }

    switch (step) {
      case 'SELECT_REQUEST': {
        const options = payload.requestOptions ?? [];
        const chosen = resolveRequestChoice(body, options);
        if (!chosen) {
          return { handled: true, reply: `Opção inválida.\n${formatRequestList(options)}` };
        }
        const plate = chosen.label.split(' — ')[0] ?? chosen.label;
        await upsertSession(params.chatId, params.userId, 'ASK_ODOMETER', {
          ...payload,
          requestId: chosen.id,
          displayNumber: chosen.displayNumber,
          vehiclePlate: plate,
        });
        return {
          handled: true,
          reply: `Solicitação #${chosen.displayNumber} selecionada.\n\nQual o hodômetro atual (km)?`,
        };
      }

      case 'ASK_ODOMETER': {
        const km = parseInteger(body);
        if (km == null || km <= 0) {
          return { handled: true, reply: 'Informe o hodômetro em km (somente números, ex.: 45230).' };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_TANK', {
          ...payload,
          odometerKm: km,
        });
        const tankLines = TANK_OPTIONS.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
        return {
          handled: true,
          reply: `Tanque após o abastecimento — digite o número:\n${tankLines}`,
        };
      }

      case 'ASK_TANK': {
        const asIndex = parseInt(body.trim(), 10);
        const chosen =
          Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= TANK_OPTIONS.length
            ? TANK_OPTIONS[asIndex - 1]
            : TANK_OPTIONS.find((o) => o.label.toLowerCase().includes(body.toLowerCase()));
        if (!chosen) {
          const tankLines = TANK_OPTIONS.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
          return { handled: true, reply: `Opção inválida.\n${tankLines}` };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_LITERS', {
          ...payload,
          tankLevelAfter: chosen.level,
        });
        return { handled: true, reply: 'Quantos litros foram abastecidos? (ex.: 45,500)' };
      }

      case 'ASK_LITERS': {
        const liters = parseBrDecimal(body);
        if (liters == null || liters <= 0) {
          return { handled: true, reply: 'Informe os litros abastecidos (ex.: 45,5).' };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_PRICE', {
          ...payload,
          litersRefueled: liters,
        });
        return { handled: true, reply: 'Qual o valor por litro? (ex.: R$ 5,89)' };
      }

      case 'ASK_PRICE': {
        const price = parseBrDecimal(body);
        if (price == null || price <= 0) {
          return { handled: true, reply: 'Informe o valor por litro (ex.: 5,89 ou R$ 5,89).' };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_RECEIPT', {
          ...payload,
          pricePerLiter: price,
        });
        return {
          handled: true,
          reply: 'Envie a foto do **cupom fiscal** como anexo nesta conversa.',
        };
      }

      case 'ASK_RECEIPT': {
        let photoUrl: string | null = null;
        let photoKey: string | null = null;
        let photoName: string | null = null;

        if (params.messageId) {
          const att = await getPhotoAttachmentFromMessage(params.messageId);
          if (att) {
            photoUrl = att.fileUrl;
            photoKey = att.fileKey;
            photoName = att.fileName;
          }
        }

        if (!hasStoredPhoto(photoUrl, photoKey)) {
          return {
            handled: true,
            reply: 'Preciso da foto do cupom fiscal. Envie uma imagem como anexo.',
          };
        }

        await upsertSession(params.chatId, params.userId, 'ASK_OBSERVATIONS', {
          ...payload,
          receiptPhotoUrl: photoUrl ?? undefined,
          receiptPhotoKey: photoKey ?? undefined,
          receiptPhotoName: photoName ?? undefined,
        });
        return {
          handled: true,
          reply: 'Alguma observação sobre o abastecimento? (opcional — digite «não» para pular)',
        };
      }

      case 'ASK_OBSERVATIONS': {
        const observations = SKIP_WORDS.test(body) ? '' : body;
        const nextPayload: ReportFlowPayload = { ...payload, observations };
        await upsertSession(params.chatId, params.userId, 'CONFIRM', nextPayload);
        return { handled: true, reply: buildSummary(nextPayload) };
      }

      case 'CONFIRM': {
        if (NO_WORDS.test(body)) {
          await cancelSession(params.chatId, params.userId);
          return {
            handled: true,
            reply: 'Informe descartado. Digite **4** para tentar novamente.',
          };
        }
        if (!YES_WORDS.test(body)) {
          return { handled: true, reply: 'Responda «sim» para confirmar ou «não» para cancelar.' };
        }

        if (
          !payload.requestId ||
          payload.odometerKm == null ||
          !payload.tankLevelAfter ||
          payload.litersRefueled == null ||
          payload.pricePerLiter == null ||
          !hasStoredPhoto(payload.receiptPhotoUrl, payload.receiptPhotoKey)
        ) {
          await cancelSession(params.chatId, params.userId);
          return {
            handled: true,
            reply: 'Faltam dados. Digite **4** para recomeçar.',
          };
        }

        const updated = await fuelRefuelRequestService.submitRefuelReport({
          requesterId: params.userId,
          requestId: payload.requestId,
          odometerKm: payload.odometerKm,
          tankLevelAfter: payload.tankLevelAfter,
          litersRefueled: payload.litersRefueled,
          pricePerLiter: payload.pricePerLiter,
          receiptPhotoUrl: payload.receiptPhotoUrl,
          receiptPhotoKey: payload.receiptPhotoKey,
          receiptPhotoName: payload.receiptPhotoName,
          observations: payload.observations,
        });

        await completeSession(params.chatId, params.userId);

        return {
          handled: true,
          reply: [
            `✅ Abastecimento da solicitação #${updated.displayNumber} registrado com sucesso!`,
            'Obrigado por informar os dados.',
          ].join('\n'),
        };
      }

      default:
        return { handled: false, reply: '' };
    }
  }
}

export const gennecyFuelRefuelReportFlowService = new GennecyFuelRefuelReportFlowService();
