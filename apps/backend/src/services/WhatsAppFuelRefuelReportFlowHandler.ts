import { FuelTankLevelAfter } from '@prisma/client';
import { hasStoredPhoto, isWhatsAppSavedMediaReady } from '../lib/flowMedia';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppFuelReportFlowStatus =
  | 'FUEL_REPORT_SELECT_REQUEST'
  | 'FUEL_REPORT_ASK_ODOMETER'
  | 'FUEL_REPORT_ASK_TANK'
  | 'FUEL_REPORT_ASK_LITERS'
  | 'FUEL_REPORT_ASK_PRICE'
  | 'FUEL_REPORT_ASK_RECEIPT'
  | 'FUEL_REPORT_ASK_OBSERVATIONS'
  | 'FUEL_REPORT_CONFIRM'
  | 'FUEL_REPORT_COMPLETE';

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;

const TANK_OPTIONS: Array<{ level: FuelTankLevelAfter; label: string }> = [
  { level: FuelTankLevelAfter.RESERVE, label: 'Reserva' },
  { level: FuelTankLevelAfter.QUARTER, label: '1/4 do tanque' },
  { level: FuelTankLevelAfter.HALF, label: '1/2 do tanque' },
  { level: FuelTankLevelAfter.THREE_QUARTERS, label: '3/4 do tanque' },
  { level: FuelTankLevelAfter.FULL, label: 'Tanque cheio' },
];

function waButtons(body: string, extra?: Array<{ id: string; title: string }>): SendAction {
  return {
    type: 'buttons',
    body,
    buttons: extra ?? [
      { id: 'MENU', title: 'Menu' },
      { id: 'END', title: 'Encerrar' },
    ],
  };
}

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

function formatRequestList(
  options: Array<{ id: string; displayNumber: number; label: string }>,
): string {
  if (options.length === 0) {
    return 'Não há solicitações aprovadas aguardando informe de abastecimento.';
  }
  const lines = options.map((o, i) => `${i + 1}. #${o.displayNumber} — ${o.label}`);
  return `Escolha a solicitação (digite o número da opção):\n${lines.join('\n')}`;
}

type RequestOption = {
  id: string;
  displayNumber: number;
  label: string;
  requesterId: string;
};

function resolveRequestChoice(input: string, options: RequestOption[]): RequestOption | null {
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

function buildSummary(payload: Record<string, unknown>): string {
  return [
    'Resumo do abastecimento:',
    `• Solicitação: #${payload.displayNumber ?? '—'}`,
    `• Veículo: ${payload.vehiclePlate ?? '—'}`,
    `• Hodômetro: ${payload.odometerKm != null ? Number(payload.odometerKm).toLocaleString('pt-BR') : '—'} km`,
    `• Tanque após abastecimento: ${tankLabel(payload.tankLevelAfter as FuelTankLevelAfter | undefined)}`,
    `• Litros: ${
      payload.litersRefueled != null
        ? Number(payload.litersRefueled).toLocaleString('pt-BR', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          })
        : '—'
    }`,
    `• Valor por litro: ${
      payload.pricePerLiter != null ? formatMoney(Number(payload.pricePerLiter)) : '—'
    }`,
    `• Cupom fiscal: ${hasStoredPhoto(payload.receiptPhotoUrl, payload.receiptPhotoKey) ? 'enviado' : '—'}`,
    `• Observações: ${String(payload.observations || '').trim() || '—'}`,
    '',
    'Confirma o envio? (sim / não)',
  ].join('\n');
}

export function isWhatsAppFuelReportFlowStatus(status: string): boolean {
  return status.startsWith('FUEL_REPORT_');
}

export function isWhatsAppFuelReportMenuSelection(content: string): boolean {
  return (
    content === 'informar_abastecimento' ||
    content.includes('informar abastecimento') ||
    (content.includes('informar') && content.includes('abastec'))
  );
}

export async function processWhatsAppFuelRefuelReportFlow(params: {
  phone: string;
  textRaw: string;
  content: string;
  flowStatus: string;
  payload: Record<string, unknown>;
  hasMedia: boolean;
  savedMedia: { fileUrl: string; fileName: string; fileKey?: string } | null;
  isMenuRequest: () => boolean;
  isEndRequest: () => boolean;
  resetToMenu: () => SendAction;
  endConversation: () => SendAction;
}): Promise<{
  sendAction: SendAction;
  newStatus: WhatsAppFuelReportFlowStatus | 'MENU';
  newPayload: Record<string, unknown>;
  newConversationStatus?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  clearPayload?: boolean;
} | null> {
  const {
    phone,
    textRaw,
    content,
    flowStatus,
    payload,
    hasMedia,
    savedMedia,
    isMenuRequest,
    isEndRequest,
    resetToMenu,
    endConversation,
  } = params;

  const startingFromMenu =
    flowStatus === 'MENU' && isWhatsAppFuelReportMenuSelection(content);
  if (!isWhatsAppFuelReportFlowStatus(flowStatus) && !startingFromMenu) {
    return null;
  }

  let newPayload: Record<string, unknown> = { ...payload, flow: 'FUEL_REPORT' };
  let newStatus: WhatsAppFuelReportFlowStatus | 'MENU' = startingFromMenu
    ? 'FUEL_REPORT_SELECT_REQUEST'
    : (flowStatus as WhatsAppFuelReportFlowStatus);

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  if (startingFromMenu) {
    const rows = await fuelRefuelRequestService.listAwaitingRefuelForWhatsAppPhone(phone);
    const requestOptions = rows.map((r) => ({
      id: r.id,
      displayNumber: r.displayNumber,
      label: `${r.vehiclePlate} — ${r.driverName}`,
      requesterId: r.requesterId,
    }));

    if (requestOptions.length === 0) {
      return {
        sendAction: waButtons(
          'Não encontrei solicitações aprovadas aguardando informe de abastecimento. Aguarde a aprovação do Suprimentos.',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    if (requestOptions.length === 1) {
      const only = requestOptions[0];
      newPayload = {
        flow: 'FUEL_REPORT',
        requestId: only.id,
        requesterId: only.requesterId,
        displayNumber: only.displayNumber,
        vehiclePlate: rows[0].vehiclePlate,
      };
      return {
        sendAction: waButtons(
          `Vamos registrar o abastecimento da solicitação #${only.displayNumber}.\n\nQual o hodômetro atual (km)?`,
        ),
        newStatus: 'FUEL_REPORT_ASK_ODOMETER',
        newPayload,
      };
    }

    newPayload.requestOptions = requestOptions;
    return {
      sendAction: waButtons(formatRequestList(requestOptions)),
      newStatus: 'FUEL_REPORT_SELECT_REQUEST',
      newPayload,
    };
  }

  switch (newStatus) {
    case 'FUEL_REPORT_SELECT_REQUEST': {
      const options = (newPayload.requestOptions as RequestOption[]) ?? [];
      const chosen = resolveRequestChoice(textRaw, options);
      if (!chosen) {
        return {
          sendAction: waButtons(`Opção inválida.\n${formatRequestList(options)}`),
          newStatus,
          newPayload,
        };
      }
      const plate = chosen.label.split(' — ')[0] ?? chosen.label;
      newPayload.requestId = chosen.id;
      newPayload.requesterId = chosen.requesterId;
      newPayload.displayNumber = chosen.displayNumber;
      newPayload.vehiclePlate = plate;
      return {
        sendAction: waButtons(
          `Solicitação #${chosen.displayNumber} selecionada.\n\nQual o hodômetro atual (km)?`,
        ),
        newStatus: 'FUEL_REPORT_ASK_ODOMETER',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_ODOMETER': {
      const km = parseInteger(textRaw);
      if (km == null || km <= 0) {
        return {
          sendAction: waButtons('Informe o hodômetro em km (somente números, ex.: 45230).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.odometerKm = km;
      const tankLines = TANK_OPTIONS.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
      return {
        sendAction: waButtons(`Tanque após o abastecimento — digite o número:\n${tankLines}`),
        newStatus: 'FUEL_REPORT_ASK_TANK',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_TANK': {
      const asIndex = parseInt(textRaw.trim(), 10);
      const chosen =
        Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= TANK_OPTIONS.length
          ? TANK_OPTIONS[asIndex - 1]
          : TANK_OPTIONS.find((o) => o.label.toLowerCase().includes(textRaw.toLowerCase()));
      if (!chosen) {
        const tankLines = TANK_OPTIONS.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
        return {
          sendAction: waButtons(`Opção inválida.\n${tankLines}`),
          newStatus,
          newPayload,
        };
      }
      newPayload.tankLevelAfter = chosen.level;
      return {
        sendAction: waButtons('Quantos litros foram abastecidos? (ex.: 45,500)'),
        newStatus: 'FUEL_REPORT_ASK_LITERS',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_LITERS': {
      const liters = parseBrDecimal(textRaw);
      if (liters == null || liters <= 0) {
        return {
          sendAction: waButtons('Informe os litros abastecidos (ex.: 45,5).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.litersRefueled = liters;
      return {
        sendAction: waButtons('Qual o valor por litro? (ex.: R$ 5,89)'),
        newStatus: 'FUEL_REPORT_ASK_PRICE',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_PRICE': {
      const price = parseBrDecimal(textRaw);
      if (price == null || price <= 0) {
        return {
          sendAction: waButtons('Informe o valor por litro (ex.: 5,89 ou R$ 5,89).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.pricePerLiter = price;
      return {
        sendAction: waButtons('Envie a foto do cupom fiscal como imagem nesta conversa.'),
        newStatus: 'FUEL_REPORT_ASK_RECEIPT',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_RECEIPT': {
      if (!isWhatsAppSavedMediaReady(hasMedia, savedMedia)) {
        return {
          sendAction: waButtons('Preciso da foto do cupom fiscal. Envie uma imagem (pode mandar só a foto).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.receiptPhotoUrl = savedMedia!.fileUrl || null;
      newPayload.receiptPhotoKey = savedMedia!.fileKey;
      newPayload.receiptPhotoName = savedMedia!.fileName;
      return {
        sendAction: waButtons(
          'Alguma observação sobre o abastecimento? (opcional — digite «não» para pular)',
        ),
        newStatus: 'FUEL_REPORT_ASK_OBSERVATIONS',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_OBSERVATIONS': {
      newPayload.observations = SKIP_WORDS.test(textRaw) ? '' : textRaw.trim();
      return {
        sendAction: waButtons(buildSummary(newPayload)),
        newStatus: 'FUEL_REPORT_CONFIRM',
        newPayload,
      };
    }

    case 'FUEL_REPORT_CONFIRM': {
      if (NO_WORDS.test(textRaw)) {
        return {
          sendAction: waButtons(
            'Informe descartado. Escolha «Informar abastecimento» no menu para tentar novamente.',
          ),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
      if (!YES_WORDS.test(textRaw)) {
        return {
          sendAction: {
            type: 'buttons',
            body: 'Responda «sim» para confirmar ou «não» para cancelar.',
            buttons: [
              { id: 'SIM', title: 'Sim' },
              { id: 'NAO', title: 'Não' },
              { id: 'MENU', title: 'Menu' },
            ],
          },
          newStatus,
          newPayload,
        };
      }

      const requestId = String(newPayload.requestId || '');
      const requesterId = String(newPayload.requesterId || '');
      if (
        !requestId ||
        !requesterId ||
        newPayload.odometerKm == null ||
        !newPayload.tankLevelAfter ||
        newPayload.litersRefueled == null ||
        newPayload.pricePerLiter == null ||
        !hasStoredPhoto(newPayload.receiptPhotoUrl, newPayload.receiptPhotoKey)
      ) {
        return {
          sendAction: waButtons('Faltam dados. Volte ao menu e tente novamente.'),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }

      const updated = await fuelRefuelRequestService.submitRefuelReport({
        requesterId,
        requestId,
        odometerKm: Number(newPayload.odometerKm),
        tankLevelAfter: newPayload.tankLevelAfter as FuelTankLevelAfter,
        litersRefueled: Number(newPayload.litersRefueled),
        pricePerLiter: Number(newPayload.pricePerLiter),
        receiptPhotoUrl: String(newPayload.receiptPhotoUrl || '').trim() || null,
        receiptPhotoKey: (newPayload.receiptPhotoKey as string | undefined) || null,
        receiptPhotoName: (newPayload.receiptPhotoName as string | undefined) || null,
        observations: (newPayload.observations as string | undefined) || null,
      });

      return {
        sendAction: {
          type: 'buttons',
          body: [
            `Abastecimento da solicitação #${updated.displayNumber} registrado com sucesso!`,
            'Obrigado por informar os dados.',
          ].join('\n'),
          buttons: [
            { id: 'INFORMAR_ABASTECIMENTO', title: 'Informar outro' },
            { id: 'MENU', title: 'Menu principal' },
            { id: 'END', title: 'Encerrar' },
          ],
        },
        newStatus: 'FUEL_REPORT_COMPLETE',
        newPayload: { flow: 'FUEL_REPORT', lastDisplayNumber: updated.displayNumber },
        newConversationStatus: 'COMPLETED',
      };
    }

    case 'FUEL_REPORT_COMPLETE': {
      if (isWhatsAppFuelReportMenuSelection(content)) {
        const rows = await fuelRefuelRequestService.listAwaitingRefuelForWhatsAppPhone(phone);
        if (rows.length === 0) {
          return {
            sendAction: waButtons('Não há mais solicitações aguardando informe de abastecimento.'),
            newStatus: 'MENU',
            newPayload: {},
            clearPayload: true,
          };
        }
        if (rows.length === 1) {
          const only = rows[0];
          return {
            sendAction: waButtons(
              `Vamos registrar o abastecimento da solicitação #${only.displayNumber}.\n\nQual o hodômetro atual (km)?`,
            ),
            newStatus: 'FUEL_REPORT_ASK_ODOMETER',
            newPayload: {
              flow: 'FUEL_REPORT',
              requestId: only.id,
              requesterId: only.requesterId,
              displayNumber: only.displayNumber,
              vehiclePlate: only.vehiclePlate,
            },
            newConversationStatus: 'PENDING',
          };
        }
        const requestOptions = rows.map((r) => ({
          id: r.id,
          displayNumber: r.displayNumber,
          label: `${r.vehiclePlate} — ${r.driverName}`,
          requesterId: r.requesterId,
        }));
        return {
          sendAction: waButtons(formatRequestList(requestOptions)),
          newStatus: 'FUEL_REPORT_SELECT_REQUEST',
          newPayload: { flow: 'FUEL_REPORT', requestOptions },
          newConversationStatus: 'PENDING',
        };
      }
      return {
        sendAction: resetToMenu(),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    default:
      return {
        sendAction: resetToMenu(),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
  }
}
