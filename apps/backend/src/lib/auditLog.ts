import type { Prisma, PrismaClient } from '@prisma/client';
import { getRequestContext } from './requestContext';

export type AuditAction = 'CREATE' | 'DELETE' | 'APPROVE' | 'REJECT';

/** Models que não devem gerar eventos (ruído / recursão). */
export const AUDIT_DENYLIST = new Set<string>([
  'AuditLog',
  'UserLoginEvent',
  'UserPageVisit',
  'PasswordResetToken',
  'GoogleCalendarConnection',
  'Chat',
  'ChatParticipant',
  'ChatTopic',
  'Message',
  'MessageFavorite',
  'MessageHiddenForUser',
  'MessageAttachment',
  'ChatUserPrivacy',
  'ChatGPTConversation',
  'ChatGPTMessage',
  'WhatsAppConversation',
  'WhatsAppMessage',
  'WhatsAppSubmission',
  'KanbanBoard',
  'KanbanBoardShare',
  'KanbanColumn',
  'KanbanCard',
  'KanbanCardMember',
  'KanbanChecklistItem',
  'KanbanCardComment',
  'KanbanCardAttachment',
  'PlannerEvent',
  'PlannerEventAttendee',
  'PlannerAgendaShare',
  'PlannerTaskList',
  'PlannerTask',
  'GennecyChatFlowSession',
  'FlowDiagram',
  'PncpSyncRun',
  'PncpSyncUfState',
  'ToolRentalRequestEvent',
  'ExtratoCaixaFiltroSalvo',
]);

/** Models de negócio relevantes para a timeline do Rastreio. */
export const AUDIT_ALLOWLIST = new Set<string>([
  'User',
  'Employee',
  'TimeRecord',
  'Vacation',
  'Overtime',
  'MedicalCertificate',
  'PointCorrectionRequest',
  'PointCorrectionComment',
  'SalaryAdjustment',
  'SalaryDiscount',
  'DpRequest',
  'Holiday',
  'PayrollStatus',
  'AsoTipo',
  'Contract',
  'ContractAddendum',
  'ContractAnnualValue',
  'ContractBilling',
  'ContractWeeklyProduction',
  'DemandSheetApproval',
  'Pleito',
  'Project',
  'MaterialRequest',
  'MaterialRequestItem',
  'ConstructionMaterial',
  'EngineeringMaterial',
  'MaterialCategory',
  'StockMovement',
  'StockShortfall',
  'Supplier',
  'PaymentCondition',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'PurchaseOrderInvoiceNumber',
  'QuoteMap',
  'BudgetNature',
  'MaterialDelivery',
  'LogisticsDeliveryRequest',
  'LogisticsDeliveryCompletion',
  'FuelRefuelRequest',
  'FuelGasStation',
  'FuelAdministrativeRegion',
  'Vehicle',
  'VehicleReservation',
  'ToolRentalRequest',
  'CostCenter',
  'CompanySettings',
  'FinancialControlEntry',
  'ExtratoCaixaAjuste',
  'ReceitaFinanceira',
  'RepasseFinanceiro',
  'EspelhoNfMirror',
  'EspelhoNfServiceProvider',
  'EspelhoNfServiceTaker',
  'EspelhoNfTaxCode',
  'EspelhoNfBankAccount',
  'ControleGeralTetoOrcamentario',
  'ResponsavelTecnico',
  'ControleAnuidade',
  'ControlePagamentoArt',
  'Licitacao',
  'LicitacaoDocumento',
  'LicitacaoOrcamento',
  'DriveFolder',
  'DriveFile',
  'UserPermission',
  'UserContractPermission',
  'UserDpApprovalContract',
  'PositionPermissionTemplate',
  'FluigWorkflowApproverViewer',
]);

const ENTITY_LABELS: Record<string, string> = {
  User: 'Funcionário',
  Employee: 'Funcionário',
  TimeRecord: 'Registro de ponto',
  Vacation: 'Férias',
  Overtime: 'Hora extra',
  MedicalCertificate: 'Atestado',
  PointCorrectionRequest: 'Correção de ponto',
  PointCorrectionComment: 'Comentário de correção',
  SalaryAdjustment: 'Acréscimo salarial',
  SalaryDiscount: 'Desconto salarial',
  DpRequest: 'Solicitação DP',
  Holiday: 'Feriado',
  PayrollStatus: 'Folha',
  Contract: 'Contrato',
  ContractAddendum: 'Aditivo de contrato',
  ContractBilling: 'Faturamento',
  DemandSheetApproval: 'Folha de demanda',
  Pleito: 'Pleito',
  MaterialRequest: 'Solicitação de materiais',
  MaterialRequestItem: 'Item de solicitação',
  ConstructionMaterial: 'Material',
  StockMovement: 'Movimentação de estoque',
  Supplier: 'Fornecedor',
  PurchaseOrder: 'Ordem de compra',
  QuoteMap: 'Mapa de cotação',
  MaterialDelivery: 'Entrega de material',
  LogisticsDeliveryRequest: 'Entrega logística',
  FuelRefuelRequest: 'Abastecimento',
  FuelGasStation: 'Posto',
  Vehicle: 'Veículo',
  VehicleReservation: 'Reserva de veículo',
  ToolRentalRequest: 'Locação de ferramentas',
  CostCenter: 'Centro de custo',
  FinancialControlEntry: 'Controle financeiro',
  ReceitaFinanceira: 'Receita',
  RepasseFinanceiro: 'Repasse',
  EspelhoNfMirror: 'Espelho NF',
  ResponsavelTecnico: 'Responsável técnico',
  ControleAnuidade: 'Anuidade',
  ControlePagamentoArt: 'Pagamento ART',
  Licitacao: 'Licitação',
  DriveFolder: 'Pasta do Drive',
  DriveFile: 'Arquivo do Drive',
  UserPermission: 'Permissão',
};

const APPROVE_STATUS = new Set([
  'APPROVED',
  'APPROVED_BY_MANAGER',
  'APPROVED_BY_SUPPLIES',
  'MANAGER_APPROVED',
  'SUPPLIES_APPROVED',
  'VALIDATED',
  'APROVADO',
  'APROVADA',
]);

const REJECT_STATUS = new Set([
  'REJECTED',
  'REJECTED_BY_MANAGER',
  'REJECTED_BY_SUPPLIES',
  'MANAGER_REJECTED',
  'SUPPLIES_REJECTED',
  'INVALIDATED',
  'REJEITADO',
  'REJEITADA',
  'DENIED',
]);

let baseClient: PrismaClient | null = null;

export function setAuditBaseClient(client: PrismaClient): void {
  baseClient = client;
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] || entity;
}

export function buildAuditSummary(action: AuditAction, entity: string): string {
  const label = entityLabel(entity);
  switch (action) {
    case 'CREATE':
      return `Adicionou ${label.toLowerCase()}`;
    case 'DELETE':
      return `Excluiu ${label.toLowerCase()}`;
    case 'APPROVE':
      return `Aprovou ${label.toLowerCase()}`;
    case 'REJECT':
      return `Rejeitou ${label.toLowerCase()}`;
    default:
      return label;
  }
}

function extractId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id === 'string' && obj.id) return obj.id;
  if (typeof obj.id === 'number') return String(obj.id);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Nome legível para adição/exclusão (ex.: nome do centro de custo). */
export function extractDisplayName(record: unknown): string | null {
  const obj = asRecord(record);
  if (!obj) return null;
  for (const key of ['name', 'title', 'label', 'fullName', 'razaoSocial', 'nome', 'fileName', 'originalName']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  if (typeof obj.code === 'string' && obj.code.trim()) return obj.code.trim();
  return null;
}

/** Número de negócio para aprovação/rejeição (ex.: 5, OC-2025-001). */
export function extractDisplayNumber(record: unknown): string | null {
  const obj = asRecord(record);
  if (!obj) return null;
  for (const key of [
    'displayNumber',
    'orderNumber',
    'requestNumber',
    'number',
    'protocol',
    'codigo',
    'code',
  ]) {
    const v = obj[key];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function timelinePayload(
  action: AuditAction,
  result: unknown,
  fallback?: unknown
): { timelineRef?: string } | null {
  const source = result ?? fallback;
  if (action === 'CREATE' || action === 'DELETE') {
    const name = extractDisplayName(source);
    return name ? { timelineRef: name } : null;
  }
  const number = extractDisplayNumber(source) || extractDisplayName(source);
  return number ? { timelineRef: number } : null;
}

export function resolveTimelineRef(
  action: string,
  newData?: unknown,
  oldData?: unknown
): string | null {
  for (const raw of [newData, oldData]) {
    const obj = asRecord(raw);
    if (!obj) continue;
    if (typeof obj.timelineRef === 'string' && obj.timelineRef.trim()) {
      return obj.timelineRef.trim();
    }
  }
  const a = String(action || '').toUpperCase();
  if (a === 'CREATE' || a === 'DELETE') {
    return extractDisplayName(newData) || extractDisplayName(oldData);
  }
  if (a === 'APPROVE' || a === 'REJECT') {
    return (
      extractDisplayNumber(newData) ||
      extractDisplayNumber(oldData) ||
      extractDisplayName(newData) ||
      extractDisplayName(oldData)
    );
  }
  return null;
}

/**
 * Para eventos sem timelineRef (ex.: aprovações antigas), busca o número/nome ainda no banco.
 */
export async function enrichTimelineRefs(
  audits: Array<{
    action: string;
    entity: string;
    entityId?: string | null;
    newData?: unknown;
    oldData?: unknown;
  }>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const client = baseClient;
  if (!client) return out;

  const missingByEntity = new Map<string, string[]>();
  for (const audit of audits) {
    const existing = resolveTimelineRef(audit.action, audit.newData, audit.oldData);
    if (existing || !audit.entityId) continue;
    const list = missingByEntity.get(audit.entity) || [];
    list.push(audit.entityId);
    missingByEntity.set(audit.entity, list);
  }

  const loaders: Array<Promise<void>> = [];

  const addNumberLoader = (
    entity: string,
    loader: (ids: string[]) => Promise<Array<{ id: string; value: string | number | null }>>
  ) => {
    const ids = [...new Set(missingByEntity.get(entity) || [])];
    if (!ids.length) return;
    loaders.push(
      (async () => {
        try {
          const rows = await loader(ids);
          for (const row of rows) {
            if (row.value == null || row.value === '') continue;
            out.set(`${entity}:${row.id}`, String(row.value));
          }
        } catch {
          // ignore lookup failures
        }
      })()
    );
  };

  addNumberLoader('PurchaseOrder', async (ids) => {
    const rows = await client.purchaseOrder.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true },
    });
    return rows.map((r) => ({ id: r.id, value: r.orderNumber }));
  });

  addNumberLoader('MaterialRequest', async (ids) => {
    const rows = await client.materialRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, requestNumber: true },
    });
    return rows.map((r) => ({ id: r.id, value: r.requestNumber }));
  });

  addNumberLoader('DpRequest', async (ids) => {
    const rows = await client.dpRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayNumber: true },
    });
    return rows.map((r) => ({ id: r.id, value: r.displayNumber }));
  });

  addNumberLoader('FuelRefuelRequest', async (ids) => {
    const rows = await client.fuelRefuelRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayNumber: true },
    });
    return rows.map((r) => ({ id: r.id, value: r.displayNumber }));
  });

  addNumberLoader('CostCenter', async (ids) => {
    const rows = await client.costCenter.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, code: true },
    });
    return rows.map((r) => ({ id: r.id, value: r.name || r.code }));
  });

  addNumberLoader('Contract', async (ids) => {
    const rows = await client.contract.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, number: true },
    });
    return rows.map((r) => ({ id: r.id, value: r.number || r.name }));
  });

  await Promise.all(loaders);
  return out;
}

function unwrapData(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  // Prisma update pode vir com { set: x } em alguns campos; status costuma ser string direta
  return obj;
}

function normalizeStatus(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  if (value && typeof value === 'object' && 'set' in (value as object)) {
    const setVal = (value as { set?: unknown }).set;
    if (typeof setVal === 'string' && setVal.trim()) return setVal.trim().toUpperCase();
  }
  return null;
}

/** Detecta APPROVE/REJECT a partir do payload de update. */
export function detectApproveRejectAction(data: unknown): AuditAction | null {
  const obj = unwrapData(data);
  if (!obj) return null;

  const statusKeys = [
    'status',
    'approvalStatus',
    'managerStatus',
    'suppliesStatus',
    'workflowStatus',
  ];
  for (const key of statusKeys) {
    const status = normalizeStatus(obj[key]);
    if (!status) continue;
    if (APPROVE_STATUS.has(status)) return 'APPROVE';
    if (REJECT_STATUS.has(status)) return 'REJECT';
  }

  if (obj.approved === true || obj.approvedAt != null || obj.approvedBy != null) {
    if (obj.rejected === true || obj.rejectedAt != null) return 'REJECT';
    return 'APPROVE';
  }
  if (obj.rejected === true || obj.rejectedAt != null || obj.rejectedBy != null) {
    return 'REJECT';
  }

  return null;
}

export function shouldAuditModel(model: string): boolean {
  if (AUDIT_DENYLIST.has(model)) return false;
  return AUDIT_ALLOWLIST.has(model);
}

export type RecordAuditInput = {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string | null;
  oldData?: Prisma.InputJsonValue | null;
  newData?: Prisma.InputJsonValue | null;
  userId?: string | null;
};

export function recordAuditEvent(input: RecordAuditInput): void {
  const client = baseClient;
  if (!client) return;

  const ctx = getRequestContext();
  const userId = input.userId ?? ctx?.userId ?? null;
  if (!userId) return;

  const summary = input.summary || buildAuditSummary(input.action, input.entity);

  void client.auditLog
    .create({
      data: {
        userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary,
        oldData: input.oldData ?? undefined,
        newData: input.newData ?? undefined,
        ipAddress: ctx?.ipAddress ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    })
    .catch((err) => {
      console.warn('[AuditLog] falha ao gravar evento:', err?.message || err);
    });
}

export function auditAfterWrite(params: {
  model: string;
  operation: 'create' | 'createMany' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany';
  args: { data?: unknown; where?: unknown };
  result: unknown;
  before?: unknown;
}): void {
  const { model, operation, args, result, before } = params;
  if (!shouldAuditModel(model)) return;

  if (operation === 'create') {
    const ref = timelinePayload('CREATE', result);
    recordAuditEvent({
      action: 'CREATE',
      entity: model,
      entityId: extractId(result),
      newData: (ref as Prisma.InputJsonValue) ?? undefined,
    });
    return;
  }

  if (operation === 'createMany') {
    const count =
      result && typeof result === 'object' && 'count' in (result as object)
        ? Number((result as { count?: number }).count || 0)
        : null;
    recordAuditEvent({
      action: 'CREATE',
      entity: model,
      entityId: null,
      newData: count != null ? { count } : undefined,
      summary: `Adicionou ${count ?? ''} ${entityLabel(model).toLowerCase()}`.replace(/\s+/g, ' ').trim(),
    });
    return;
  }

  if (operation === 'delete' || operation === 'deleteMany') {
    const ref =
      timelinePayload('DELETE', result) ||
      timelinePayload('DELETE', before) ||
      timelinePayload('DELETE', args.where);
    recordAuditEvent({
      action: 'DELETE',
      entity: model,
      entityId: extractId(before) || extractId(args.where) || extractId(result),
      oldData: (ref as Prisma.InputJsonValue) ?? undefined,
    });
    return;
  }

  if (operation === 'update' || operation === 'updateMany' || operation === 'upsert') {
    const action = detectApproveRejectAction(args.data);
    if (!action) return;
    const ref =
      timelinePayload(action, result) ||
      timelinePayload(action, before) ||
      timelinePayload(action, args.data);
    recordAuditEvent({
      action,
      entity: model,
      entityId: extractId(args.where) || extractId(result) || extractId(before),
      newData: (ref as Prisma.InputJsonValue) ?? undefined,
    });
  }
}

/** Converte nome do model Prisma (CostCenter) para a chave do client (costCenter). */
export function prismaDelegateKey(model: string): string {
  if (!model) return model;
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export async function loadRecordBeforeWrite(
  model: string,
  where: unknown
): Promise<unknown | null> {
  const client = baseClient as unknown as Record<string, { findUnique?: Function; findFirst?: Function }>;
  if (!client || !where || typeof where !== 'object') return null;
  const key = prismaDelegateKey(model);
  const delegate = client[key];
  if (!delegate?.findUnique && !delegate?.findFirst) return null;
  try {
    if (delegate.findUnique) {
      return await delegate.findUnique({ where });
    }
    return await delegate.findFirst({ where });
  } catch {
    return null;
  }
}
