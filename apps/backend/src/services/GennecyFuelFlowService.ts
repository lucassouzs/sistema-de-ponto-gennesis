import { FuelRefuelRequestStatus, FuelVehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  findEmployeeByCpf,
  isValidCpf,
  onlyDigits,
} from '../lib/employeeCpfLookup';
import {
  notifyFuelRequesterWaitingManager,
  notifyFuelRequesterWaitingSupplies,
} from '../lib/fuelRefuelChatNotify';
import {
  buildFuelFlowStartMessage,
  formatFuelAttendanceHoursShort,
  formatFuelOutsideHoursWarning,
} from '../lib/fuelAttendanceHours';
import { getPhotoAttachmentFromMessage, hasStoredPhoto } from '../lib/flowMedia';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';
import { messageHasSupportIntent } from './GennecySupportFlowService';

const FLOW_TYPE = 'FUEL_REFUEL';

type FuelFlowStep =
  | 'MENU'
  | 'ASK_REFUEL_DATE'
  | 'ASK_ROUTE'
  | 'ASK_DRIVER_CPF'
  | 'ASK_CONTRACT'
  | 'ASK_VEHICLE'
  | 'ASK_VEHICLE_TYPE'
  | 'ASK_DASHBOARD_PHOTO'
  | 'ASK_OBSERVATIONS'
  | 'CONFIRM';

type FuelFlowPayload = {
  refuelDate?: string;
  route?: string;
  contractId?: string;
  costCenter?: string | null;
  costCenterLabel?: string;
  contractOptions?: Array<{ id: string; name: string; number: string }>;
  driverName?: string;
  driverCpfMasked?: string;
  driverEmployeeId?: string;
  vehiclePlate?: string;
  vehicleDescription?: string;
  vehicleType?: FuelVehicleType;
  dashboardPhotoUrl?: string;
  dashboardPhotoKey?: string;
  dashboardPhotoName?: string;
  observations?: string;
};

const FUEL_INTENT =
  /\b(combust[ií]vel|abastecer|abastecimento|gasolina|diesel|posto)\b/i;

const CANCEL_WORDS = /^(cancelar|cancela|sair|parar|desistir)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;
const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;

function brDateToIso(input: string): string | null {
  const trimmed = input.trim();
  const m1 = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let y = parseInt(m1[3], 10);
    if (y < 100) y += 2000;
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const m2 = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return trimmed;
  return null;
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function listRegisteredContracts() {
  const rows = await prisma.contract.findMany({
    orderBy: [{ name: 'asc' }, { number: 'asc' }],
    select: { id: true, name: true, number: true },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name.trim() || row.number,
    number: row.number,
  }));
}

function formatContractChoiceList(
  options: Array<{ id: string; name: string; number: string }>,
): string {
  return options
    .map((c, idx) => `${idx + 1}. ${c.name}${c.number ? ` (${c.number})` : ''}`)
    .join('\n');
}

async function getActiveSession(chatId: string, userId: string) {
  return prisma.gennecyChatFlowSession.findUnique({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
  });
}

async function upsertSession(
  chatId: string,
  userId: string,
  step: FuelFlowStep,
  payload: FuelFlowPayload,
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

function vehicleTypeLabel(type?: FuelVehicleType): string {
  if (type === FuelVehicleType.PRIVATE) return 'Particular (passa pelo gestor)';
  if (type === FuelVehicleType.COMPANY) return 'Frota / empresa (direto ao Suprimentos)';
  return '—';
}

function buildSummary(payload: FuelFlowPayload): string {
  const routing =
    payload.vehicleType === FuelVehicleType.PRIVATE
      ? 'Após confirmar, seguirá para aprovação do gestor e depois Suprimentos.'
      : 'Após confirmar, seguirá direto para a fila do Suprimentos.';
  const vehicleDescription = payload.vehicleDescription?.trim();

  return [
    '📋 Resumo da solicitação de abastecimento:',
    `• Data para abastecer: ${payload.refuelDate ? formatBrDate(payload.refuelDate) : '—'}`,
    `• Rota: ${payload.route || '—'}`,
    `• Contrato: ${payload.costCenterLabel || payload.costCenter || '—'}`,
    `• Condutor: ${payload.driverName || '—'}${payload.driverCpfMasked ? ` (CPF ${payload.driverCpfMasked})` : ''}`,
    `• Veículo: ${payload.vehiclePlate || '—'}`,
    ...(vehicleDescription ? [`• Modelo: ${vehicleDescription}`] : []),
    `• Tipo: ${vehicleTypeLabel(payload.vehicleType)}`,
    `• Foto do painel: ${hasStoredPhoto(payload.dashboardPhotoUrl, payload.dashboardPhotoKey) ? '✅ enviada' : '—'}`,
    `• Observações: ${payload.observations?.trim() || '—'}`,
    '',
    routing,
    '',
    'Confirma o envio? (sim / não)',
  ].join('\n');
}

export function messageHasFuelIntent(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  if (/^1$/.test(text)) return true;
  return FUEL_INTENT.test(text);
}

export function messageStartsFuelMenu(body: string): boolean {
  const text = body.trim().toLowerCase();
  return (
    text === 'menu' ||
    text === 'opções' ||
    text === 'opcoes' ||
    text === 'ajuda' ||
    text === 'help' ||
    text === 'início' ||
    text === 'inicio' ||
    text === 'começar' ||
    text === 'comecar' ||
    text === 'oi' ||
    text === 'olá' ||
    text === 'ola' ||
    text === 'hey' ||
    text === 'e aí' ||
    text === 'eai' ||
    text === 'bom dia' ||
    text === 'boa tarde' ||
    text === 'boa noite'
  );
}

export function isGennecyFuelMenuMessage(content: string): boolean {
  return content.includes('Solicitar abastecimento de combustível');
}

/** No DM com a Gennecy, exibe o menu numerado em vez de cair no chat genérico com IA. */
export function shouldShowGennecyFuelMenu(body: string): boolean {
  const text = body.trim();
  if (!text) return true;
  if (messageStartsFuelMenu(text)) return true;
  if (messageHasFuelIntent(text)) return false;
  if (/^4$|\b(informar|registrar|lançar|lancar)\s+(o\s+)?abastecimento\b/i.test(text)) {
    return false;
  }
  if (/^2$/.test(text)) return false;
  if (/^3$/.test(text)) return false;
  if (/\b(criar|crie|cria|gerar|nova|adicionar|abrir|registrar)\b[\s\S]{0,80}?\b(task|tarefa|card|cart[aã]o)\b/i.test(text)) {
    return false;
  }
  if (/^5$/.test(text)) return false;
  if (/\b(suporte|senha|esqueci|permiss[aã]o)\b/i.test(text) && !messageHasFuelIntent(text)) {
    return false;
  }
  if (text.length <= 24 && !text.includes('?')) return true;
  return false;
}

export const GENNECY_FUEL_MENU_MESSAGE = [
  'Olá! Sou a Gennecy. Como posso ajudar?',
  '',
  'Digite o número da opção:',
  '1 — Solicitar abastecimento de combustível',
  '2 — Criar task no Tasks (ex.: «criar task sobre …»)',
  '3 — Outra pergunta',
  '4 — Informar abastecimento (após aprovação do Suprimentos)',
  '5 — Suporte do sistema (senha, erro, permissão)',
  '',
  '⏰ Atendimento das solicitações: 7h–8h30 e 13h–14h30.',
  'Após 14h30 → dia seguinte. Urgências: contate o setor responsável.',
  '',
  'A qualquer momento, digite «cancelar» para sair de um fluxo.',
].join('\n');

export class GennecyFuelFlowService {
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
    const payload = (session?.payload ?? {}) as FuelFlowPayload;
    const step = (session?.step ?? 'MENU') as FuelFlowStep;

    if (CANCEL_WORDS.test(body)) {
      if (session?.status === 'ACTIVE' && step !== 'MENU') {
        await cancelSession(params.chatId, params.userId);
        return { handled: true, reply: 'Solicitação cancelada. Se precisar, digite «1» para abastecimento ou faça outra pergunta.' };
      }
    }

    if (messageStartsFuelMenu(body)) {
      await upsertSession(params.chatId, params.userId, 'MENU', {});
      return { handled: true, reply: GENNECY_FUEL_MENU_MESSAGE };
    }

    const inActiveFlow = session?.status === 'ACTIVE' && step !== 'MENU';
    const wantsFuel = messageHasFuelIntent(body);

    if (!inActiveFlow && !wantsFuel) {
      if (body === '2') {
        return {
          handled: true,
          reply:
            'Para criar um card no Tasks, digite por exemplo:\n«criar task sobre integração com calendário, urgente, prazo até 30/06/2026»',
        };
      }
      if (body === '3') {
        return { handled: false, reply: '' };
      }
      if (body === '4') {
        return { handled: false, reply: '' };
      }
      return { handled: false, reply: '' };
    }

    if (!inActiveFlow && wantsFuel) {
      await upsertSession(params.chatId, params.userId, 'ASK_REFUEL_DATE', {});
      return {
        handled: true,
        reply: buildFuelFlowStartMessage(
          `Qual a data para abastecer? (ex.: ${formatBrDate(todayIso())})`
        ),
      };
    }

    switch (step) {
      case 'ASK_REFUEL_DATE': {
        const iso = brDateToIso(body);
        if (!iso) {
          return {
            handled: true,
            reply: 'Data inválida. Informe no formato DD/MM/AAAA (ex.: 08/06/2026).',
          };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_ROUTE', {
          ...payload,
          refuelDate: iso,
        });
        return { handled: true, reply: 'Qual a rota?' };
      }

      case 'ASK_ROUTE': {
        if (body.length < 2) {
          return { handled: true, reply: 'Informe a rota (mínimo 2 caracteres).' };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_DRIVER_CPF', {
          ...payload,
          route: body,
        });
        return {
          handled: true,
          reply:
            'Qual o **CPF do condutor**? (somente números — precisa estar cadastrado no sistema)',
        };
      }

      case 'ASK_DRIVER_CPF': {
        const cpfDigits = onlyDigits(body);
        if (!cpfDigits) {
          return {
            handled: true,
            reply: 'Não recebi o CPF. Envie os 11 dígitos (somente números).',
          };
        }
        if (!isValidCpf(cpfDigits)) {
          return {
            handled: true,
            reply: 'CPF inválido. Confira e envie novamente os 11 dígitos.',
          };
        }

        const employee = await findEmployeeByCpf(cpfDigits);
        if (!employee) {
          return {
            handled: true,
            reply:
              'Não encontrei colaborador cadastrado com esse CPF. Verifique o número ou fale com o RH/Suprimentos.',
          };
        }

        const contracts = await listRegisteredContracts();
        if (!contracts.length) {
          return {
            handled: true,
            reply:
              'Não há contratos cadastrados no sistema. Fale com o Suprimentos/Administração.',
          };
        }

        await upsertSession(params.chatId, params.userId, 'ASK_CONTRACT', {
          ...payload,
          driverName: employee.name,
          driverCpfMasked: employee.cpfMasked,
          driverEmployeeId: employee.employeeId,
          costCenter: employee.costCenter,
          contractOptions: contracts,
          contractId: undefined,
          costCenterLabel: undefined,
        });
        return {
          handled: true,
          reply: [
            `✅ Identifiquei **${employee.name}** (CPF ${employee.cpfMasked}).`,
            '',
            'Para qual contrato é esta solicitação? Digite o **número** da lista:',
            '',
            formatContractChoiceList(contracts),
          ].join('\n'),
        };
      }

      case 'ASK_CONTRACT': {
        const options = payload.contractOptions || [];
        if (!options.length) {
          await upsertSession(params.chatId, params.userId, 'ASK_DRIVER_CPF', payload);
          return {
            handled: true,
            reply: 'Envie novamente o CPF do condutor.',
          };
        }

        const asIndex = Number.parseInt(body, 10);
        let selected =
          Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= options.length
            ? options[asIndex - 1]
            : null;
        if (!selected) {
          const lower = body.toLowerCase();
          selected =
            options.find((c) => c.name.toLowerCase() === lower) ||
            options.find((c) => c.number.toLowerCase() === lower) ||
            null;
        }
        if (!selected) {
          return {
            handled: true,
            reply: [
              'Contrato não encontrado. Digite o **número** da lista:',
              '',
              formatContractChoiceList(options),
            ].join('\n'),
          };
        }

        await upsertSession(params.chatId, params.userId, 'ASK_VEHICLE', {
          ...payload,
          contractId: selected.id,
          costCenterLabel: selected.name,
        });
        return {
          handled: true,
          reply: [
            `Contrato selecionado: **${selected.name}**.`,
            '',
            'Qual o veículo? Informe a placa (ex.: ABC1D23) ou placa — modelo (ex.: ABC1D23 — Strada).',
          ].join('\n'),
        };
      }

      case 'ASK_VEHICLE': {
        if (body.length < 2) {
          return { handled: true, reply: 'Informe a placa ou identificação do veículo.' };
        }
        const parts = body.split(/[—\-–]/).map((s) => s.trim());
        const plate = parts[0] || body;
        const description = parts.slice(1).join(' — ') || undefined;
        await upsertSession(params.chatId, params.userId, 'ASK_VEHICLE_TYPE', {
          ...payload,
          vehiclePlate: plate,
          vehicleDescription: description,
        });
        return {
          handled: true,
          reply:
            'É veículo particular (carro próprio do colaborador)?\nDigite «sim» ou «não».\n\n• Sim → a solicitação passa pelo gestor antes do Suprimentos.\n• Não → vai direto para o Suprimentos.',
        };
      }

      case 'ASK_VEHICLE_TYPE': {
        if (YES_WORDS.test(body)) {
          await upsertSession(params.chatId, params.userId, 'ASK_DASHBOARD_PHOTO', {
            ...payload,
            vehicleType: FuelVehicleType.PRIVATE,
          });
        } else if (NO_WORDS.test(body)) {
          await upsertSession(params.chatId, params.userId, 'ASK_DASHBOARD_PHOTO', {
            ...payload,
            vehicleType: FuelVehicleType.COMPANY,
          });
        } else {
          return {
            handled: true,
            reply: 'Responda «sim» se for veículo particular ou «não» se for frota/veículo da empresa.',
          };
        }
        return {
          handled: true,
          reply: 'Envie a foto do painel atual (odômetro) como anexo nesta conversa.',
        };
      }

      case 'ASK_DASHBOARD_PHOTO': {
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
            reply: 'Preciso da foto do painel. Envie uma imagem como anexo (pode enviar só a foto, sem texto).',
          };
        }

        await upsertSession(params.chatId, params.userId, 'ASK_OBSERVATIONS', {
          ...payload,
          dashboardPhotoUrl: photoUrl ?? undefined,
          dashboardPhotoKey: photoKey ?? undefined,
          dashboardPhotoName: photoName ?? undefined,
        });
        return {
          handled: true,
          reply: 'Alguma observação sobre a solicitação? (opcional — digite «não» para pular)',
        };
      }

      case 'ASK_OBSERVATIONS': {
        const observations = SKIP_WORDS.test(body) ? '' : body;
        const nextPayload: FuelFlowPayload = { ...payload, observations };
        await upsertSession(params.chatId, params.userId, 'CONFIRM', nextPayload);
        return { handled: true, reply: buildSummary(nextPayload) };
      }

      case 'CONFIRM': {
        if (NO_WORDS.test(body)) {
          await cancelSession(params.chatId, params.userId);
          return {
            handled: true,
            reply: 'Solicitação descartada. Digite «1» se quiser começar de novo.',
          };
        }
        if (!YES_WORDS.test(body)) {
          return { handled: true, reply: 'Responda «sim» para confirmar ou «não» para cancelar.' };
        }

        if (
          !payload.refuelDate ||
          !payload.route ||
          !payload.contractId ||
          !payload.driverName ||
          !payload.vehiclePlate ||
          !payload.vehicleType ||
          !hasStoredPhoto(payload.dashboardPhotoUrl, payload.dashboardPhotoKey)
        ) {
          await cancelSession(params.chatId, params.userId);
          return {
            handled: true,
            reply: 'Faltam dados na solicitação. Digite «1» para recomeçar.',
          };
        }

        const created = await fuelRefuelRequestService.create({
          requesterId: params.userId,
          refuelDate: new Date(`${payload.refuelDate}T12:00:00`),
          route: payload.route,
          contractId: payload.contractId,
          costCenter: payload.costCenterLabel || payload.costCenter || null,
          driverName: payload.driverName,
          vehiclePlate: payload.vehiclePlate,
          vehicleDescription: payload.vehicleDescription,
          vehicleType: payload.vehicleType,
          dashboardPhotoUrl: payload.dashboardPhotoUrl,
          dashboardPhotoKey: payload.dashboardPhotoKey,
          dashboardPhotoName: payload.dashboardPhotoName,
          observations: payload.observations,
          sourceChatId: params.chatId,
        });

        await completeSession(params.chatId, params.userId);

        if (created.status === FuelRefuelRequestStatus.PENDING_MANAGER) {
          await notifyFuelRequesterWaitingManager(created.sourceChatId, created.displayNumber);
        } else {
          await notifyFuelRequesterWaitingSupplies(created.sourceChatId, created.displayNumber);
        }

        const outsideWarn = formatFuelOutsideHoursWarning();
        return {
          handled: true,
          reply: [
            `✅ Solicitação #${created.displayNumber} registrada com sucesso!`,
            'Você receberá atualizações aqui conforme a solicitação avançar.',
            '',
            formatFuelAttendanceHoursShort(),
            ...(outsideWarn ? ['', outsideWarn] : []),
            '',
            'Precisa de mais alguma coisa?',
          ].join('\n'),
        };
      }

      default:
        return { handled: false, reply: '' };
    }
  }
}

export const gennecyFuelFlowService = new GennecyFuelFlowService();
