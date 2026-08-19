export type GestaoOsStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SAFETY_CHECK'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'REWORK'
  | 'CLOSED'
  | 'CANCELLED';

export type GestaoOsPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type GestaoOsMaintenanceType = 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE';
export type GestaoOsProfile = 'REQUESTER' | 'MANAGER' | 'TECHNICIAN' | 'ADMIN';

export type GestaoOsDocumentKind =
  | 'MANUAL'
  | 'WARRANTY'
  | 'LAUDO'
  | 'ART'
  | 'CHECKLIST_IFSP'
  | 'MANUAL_PATRIMONIO'
  | 'OTHER';

export type GestaoOsOrigin = 'REQUEST' | 'SAC' | 'UNPLANNED' | 'PLANTAO';
export type GestaoOsSacKind = 'CHAMADO' | 'DUVIDA' | 'RECLAMACAO';

export type GestaoOsAttachment = {
  url: string;
  name: string;
  mimeType?: string;
  kind?: GestaoOsDocumentKind;
};

export type GestaoOsUserRef = {
  id: string;
  name: string;
  email?: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
};

export type GestaoOsChecklistResponseItem = {
  id?: string;
  label: string;
  checked?: boolean;
  required?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
};

export type GestaoOsPartLine = {
  id: string;
  name: string;
  supplier: string | null;
  quantity: number;
  unitCost: number | null;
  expectedAt: string | null;
  notes: string | null;
  materialId?: string | null;
  stockDeductedAt?: string | null;
};

export type GestaoOsWorkOrder = {
  id: string;
  displayNumber: number;
  /** Número da OS — preenchido na primeira análise. Null = ainda é só chamado. */
  osNumber: number | null;
  companyId?: string | null;
  status: GestaoOsStatus;
  priority: GestaoOsPriority;
  maintenanceType: GestaoOsMaintenanceType | null;
  category: string;
  description: string;
  buildingId: string | null;
  sectorId: string | null;
  placeId: string | null;
  assetId: string | null;
  locationLabel: string | null;
  requesterId: string;
  requester: GestaoOsUserRef;
  assigneeId: string | null;
  assignee: GestaoOsUserRef | null;
  teamUserIds?: string[];
  origin?: GestaoOsOrigin | null;
  sacKind?: GestaoOsSacKind | null;
  fiscalRating?: number | null;
  fiscalRatingComment?: string | null;
  fiscalUserId?: string | null;
  attestedAt?: string | null;
  closeQrVerifiedAt?: string | null;
  buildingCloseQrRequired?: boolean;
  providerName: string | null;
  attachments: GestaoOsAttachment[] | null;
  cancelReason: string | null;
  completionNote: string | null;
  rating: number | null;
  ratingComment: string | null;
  dueAt?: string | null;
  slaHoursApplied?: number | null;
  slaWarnedAt?: string | null;
  slaOverdue?: boolean;
  slaWarning?: boolean;
  slaRemainingMs?: number | null;
  parts?: GestaoOsPartLine[];
  partsTotalCost?: number;
  relatedWorkOrderId?: string | null;
  startPhotoUrl?: string | null;
  endPhotoUrl?: string | null;
  executionMs?: number | null;
  lastExecutionResumeAt?: string | null;
  recurrence90dCount?: number | null;
  checklistResponses?: GestaoOsChecklistResponseItem[] | null;
  safetyChecklistResponses?: GestaoOsChecklistResponseItem[] | null;
  safetyPhotoUrl?: string | null;
  signatureRequesterUrl?: string | null;
  signatureTechnicianUrl?: string | null;
  openedAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  events?: Array<{
    id: string;
    fromStatus: GestaoOsStatus | null;
    toStatus: GestaoOsStatus;
    note: string | null;
    createdAt: string;
    actor: GestaoOsUserRef | null;
  }>;
};

export type GestaoOsPlanType = 'PREVENTIVE' | 'PMOC' | 'SAFETY';

export type GestaoOsMaintenancePlan = {
  id: string;
  companyId: string;
  name: string;
  planType: GestaoOsPlanType;
  description: string | null;
  category: string | null;
  buildingId: string | null;
  assetId: string | null;
  checklistId: string | null;
  intervalDays: number;
  nextDueAt: string;
  lastGeneratedAt?: string | null;
  assigneeId: string | null;
  scheduledTime?: string | null;
  technicianIds?: string[];
  rotateTechnicians?: boolean;
  rotationIndex?: number;
  isActive: boolean;
  building?: { id: string; name: string } | null;
  asset?: { id: string; name: string; category?: string | null } | null;
  checklist?: { id: string; name: string; items?: unknown } | null;
  assignee?: GestaoOsUserRef | null;
};

export type GestaoOsDocument = {
  id: string;
  companyId: string;
  title: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  kind: GestaoOsDocumentKind;
  notes: string | null;
  buildingId: string | null;
  assetId: string | null;
  createdAt?: string;
  building?: { id: string; name: string } | null;
  asset?: { id: string; name: string } | null;
  uploadedBy?: GestaoOsUserRef | null;
};

export type GestaoOsReportsSummary = {
  backlog: number;
  openLike: number;
  overdue: number;
  mttrHours: number | null;
  resolved?: number;
  pending?: number;
  byStatus: Partial<Record<GestaoOsStatus, number>>;
  byCategory: Array<{ category: string; count: number }>;
  byBuilding: Array<{ buildingId: string | null; name: string; count: number }>;
  byTechnician: Array<{ assigneeId: string | null; name: string; count: number }>;
  monthlyByCategory?: Array<{
    month: string;
    total: number;
    byCategory: Array<{ category: string; count: number }>;
  }>;
  materials?: Array<{ name: string; quantity: number; cost: number; osCount: number }>;
  pendencias?: Array<{
    id: string;
    label: string;
    status: GestaoOsStatus;
    category: string;
    locationLabel: string | null;
    assigneeName: string | null;
    openedAt: string;
    dueAt: string | null;
    overdue: boolean;
    unsolved: boolean;
  }>;
};

export const PLAN_TYPE_LABELS: Record<GestaoOsPlanType, string> = {
  PREVENTIVE: 'Preventiva',
  PMOC: 'PMOC',
  SAFETY: 'Segurança'
};

export const DOCUMENT_KIND_LABELS: Record<GestaoOsDocumentKind, string> = {
  MANUAL: 'Manual',
  WARRANTY: 'Garantia',
  LAUDO: 'Laudo',
  ART: 'ART',
  CHECKLIST_IFSP: 'Check-list IFSP',
  MANUAL_PATRIMONIO: 'Manual de Patrimônio IFSP',
  OTHER: 'Outro'
};

export const ORIGIN_LABELS: Record<GestaoOsOrigin, string> = {
  REQUEST: 'Chamado',
  SAC: 'SAC da localidade',
  UNPLANNED: 'Ocorrência não planejada',
  PLANTAO: 'Plantão 24h'
};

export const SAC_KIND_LABELS: Record<GestaoOsSacKind, string> = {
  CHAMADO: 'Chamado',
  DUVIDA: 'Dúvida',
  RECLAMACAO: 'Reclamação'
};

export type GestaoOsLocationTree = Array<{
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  responsibleUserId?: string | null;
  prepostoUserId?: string | null;
  managerUserId?: string | null;
  fiscalUserId?: string | null;
  qrToken?: string | null;
  sectors: Array<{
    id: string;
    name: string;
    code?: string | null;
    places: Array<{
      id: string;
      name: string;
      code?: string | null;
      assets: Array<{
        id: string;
        name: string;
        code?: string | null;
        category: string | null;
        serialNumber?: string | null;
        qrToken?: string;
        warrantyEndsAt?: string | null;
      }>;
    }>;
  }>;
}>;

export type GestaoOsCompany = {
  id: string;
  name: string;
  tradeName: string | null;
  document: string | null;
  code: string | null;
  isActive: boolean;
  branches: Array<{
    id: string;
    name: string;
    code: string | null;
    address: string | null;
    isActive: boolean;
  }>;
  _count?: { members: number; buildings: number; providers: number };
};

export type GestaoOsProvider = {
  id: string;
  companyId: string | null;
  name: string;
  document: string | null;
  specialty: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  company?: { id: string; name: string } | null;
};

export type GestaoOsServiceCategory = {
  id: string;
  companyId: string | null;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  checklistId?: string | null;
  checklistItems?: Array<{ id: string; label: string }>;
};

export type GestaoOsMembership = {
  id: string;
  companyId: string;
  userId: string;
  profile: GestaoOsProfile;
  isActive: boolean;
  user: GestaoOsUserRef & { role?: string; isActive?: boolean };
  company: { id: string; name: string };
};

export type GestaoOsAssetQr = {
  assetId: string;
  name: string;
  code: string | null;
  category?: string | null;
  buildingName?: string | null;
  sectorName?: string | null;
  placeName?: string | null;
  qrToken: string;
  payloadUrl: string;
  dataUrl: string;
  locationLabel: string;
};

export const STATUS_LABELS: Record<GestaoOsStatus, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em Análise',
  APPROVED: 'Aprovada',
  SAFETY_CHECK: 'Segurança do Trabalho',
  IN_PROGRESS: 'Em Execução',
  WAITING_PARTS: 'Aguardando Peça/Terceiro',
  COMPLETED: 'Concluída',
  REWORK: 'Aguardando Ajuste',
  CLOSED: 'Encerrada/Avaliada',
  CANCELLED: 'Cancelada'
};

/** Cores do badge de status — mesmo padrão das listas (RM, combustível, aprovações). */
export const STATUS_BADGE: Record<GestaoOsStatus, string> = {
  OPEN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  SAFETY_CHECK: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  WAITING_PARTS: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  REWORK: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  CLOSED: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
};

export function gestaoOsStatusBadgeClass(status: GestaoOsStatus): string {
  return `inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE[status]}`;
}

export type GestaoOsSlaState = 'overdue' | 'warning' | null;

/** Estado de SLA de uma OS: atrasada, no prazo em risco ou ok. */
export function gestaoOsSlaState(row: {
  status: GestaoOsStatus;
  dueAt?: string | null;
  slaOverdue?: boolean;
  slaWarning?: boolean;
}): GestaoOsSlaState {
  if (row.status === 'CLOSED' || row.status === 'CANCELLED') return null;
  const dueMs = row.dueAt ? new Date(row.dueAt).getTime() : NaN;
  const overdueByDate = Number.isFinite(dueMs) && dueMs < Date.now();
  if (row.slaOverdue || overdueByDate) return 'overdue';
  if (row.slaWarning) return 'warning';
  return null;
}

export const GESTAO_OS_SLA_LABEL: Record<'overdue' | 'warning', string> = {
  overdue: 'Atrasada',
  warning: 'No prazo em risco'
};

export const GESTAO_OS_SLA_BADGE: Record<'overdue' | 'warning', string> = {
  overdue: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
};

export const GESTAO_OS_SLA_DOT: Record<'overdue' | 'warning', string> = {
  overdue: 'bg-rose-500',
  warning: 'bg-amber-500'
};

export const PRIORITY_LABELS: Record<GestaoOsPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente'
};

export const MAINTENANCE_TYPE_LABELS: Record<GestaoOsMaintenanceType, string> = {
  CORRECTIVE: 'Corretiva',
  PREVENTIVE: 'Preventiva',
  PREDICTIVE: 'Preditiva'
};

export const PROFILE_LABELS: Record<GestaoOsProfile, string> = {
  REQUESTER: 'Solicitante',
  MANAGER: 'Gestor',
  TECHNICIAN: 'Técnico',
  ADMIN: 'Administrador'
};

export const STATUS_TRANSITIONS: Record<GestaoOsStatus, GestaoOsStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  SAFETY_CHECK: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['REWORK', 'CLOSED', 'CANCELLED'],
  REWORK: ['IN_PROGRESS', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: []
};

export const GESTAO_OS_SAFETY_CHECKLIST_ITEMS: GestaoOsChecklistResponseItem[] = [
  { id: 'sst-helmet', label: 'Capacete de segurança', required: true, checked: false },
  { id: 'sst-goggles', label: 'Óculos de proteção', required: true, checked: false },
  { id: 'sst-ear', label: 'Protetor auricular (quando aplicável)', required: true, checked: false },
  { id: 'sst-gloves', label: 'Luvas adequadas à atividade', required: true, checked: false },
  { id: 'sst-boots', label: 'Calçado de segurança', required: true, checked: false },
  { id: 'sst-uniform', label: 'Uniforme / vestimenta adequada', required: true, checked: false },
  { id: 'sst-area', label: 'Área isolada / sinalizada quando necessário', required: true, checked: false },
  { id: 'sst-tools', label: 'Ferramentas e equipamentos em condições de uso', required: true, checked: false },
  { id: 'sst-fit', label: 'Estou apto e ciente dos riscos da atividade', required: true, checked: false }
];

export function cloneGestaoOsSafetyChecklist(
  items?: GestaoOsChecklistResponseItem[] | null
): GestaoOsChecklistResponseItem[] {
  const source =
    Array.isArray(items) && items.length > 0 ? items : GESTAO_OS_SAFETY_CHECKLIST_ITEMS;
  const byId = new Map(source.map((item) => [item.id, item]));
  return GESTAO_OS_SAFETY_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    checked: Boolean(byId.get(item.id)?.checked)
  }));
}

export function isGestaoOsSafetyChecklistComplete(
  items: GestaoOsChecklistResponseItem[] | null | undefined
): boolean {
  if (!items?.length) return false;
  return items.every((item) => item.required === false || !!item.checked);
}

/** Sem itens: não bloqueia. Com itens: todos precisam estar marcados. */
export function isGestaoOsExecutionChecklistComplete(
  items: GestaoOsChecklistResponseItem[] | null | undefined
): boolean {
  if (!items?.length) return true;
  return items.every((item) => !!item.checked);
}

export function isGestaoOsExecutionChecklistEvidenceComplete(
  items: GestaoOsChecklistResponseItem[] | null | undefined
): boolean {
  if (!items?.length) return true;
  return items.every(
    (item) =>
      !!item.checked &&
      !!item.startedAt &&
      !!item.completedAt &&
      !!item.beforePhotoUrl &&
      !!item.afterPhotoUrl
  );
}

export function stampGestaoOsChecklistToggle(
  items: GestaoOsChecklistResponseItem[],
  index: number,
  checked: boolean
): GestaoOsChecklistResponseItem[] {
  const now = new Date().toISOString();
  return items.map((item, i) => {
    if (i !== index) return item;
    if (!checked) return { ...item, checked: false, completedAt: null };
    return {
      ...item,
      checked: true,
      startedAt: item.startedAt || now,
      completedAt: now
    };
  });
}

export const SERVICE_CATEGORIES = [
  'Elétrica',
  'Energia elétrica',
  'Hidráulica',
  'Climatização',
  'Ar-condicionado',
  'Iluminação',
  'Automação',
  'Elevadores',
  'Bombas e motores',
  'Civil / Alvenaria',
  'Pintura',
  'Marcenaria',
  'Limpeza / Conservação',
  'TI / Telefonia',
  'Segurança / Acesso',
  'Segurança do trabalho',
  'Outros'
] as const;

/** Rótulo público: Chamado #N até gerar OS; depois OS #M. */
export function formatGestaoOsLabel(row: {
  displayNumber: number;
  osNumber?: number | null;
}): string {
  if (row.osNumber != null && row.osNumber > 0) return `OS #${row.osNumber}`;
  return `Chamado #${row.displayNumber}`;
}

/** Só o número — para coluna ID das listas. */
export function formatGestaoOsNumber(row: {
  displayNumber: number;
  osNumber?: number | null;
}): string {
  if (row.osNumber != null && row.osNumber > 0) return String(row.osNumber);
  return String(row.displayNumber);
}

export function liveGestaoOsExecutionMs(row: {
  status: GestaoOsStatus;
  executionMs?: number | null;
  lastExecutionResumeAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  now?: number;
}): number {
  const stored = Math.max(0, Math.round(Number(row.executionMs) || 0));
  const now = row.now ?? Date.now();
  if (row.status === 'IN_PROGRESS' && row.lastExecutionResumeAt) {
    const resume = new Date(row.lastExecutionResumeAt).getTime();
    if (Number.isFinite(resume)) return stored + Math.max(0, now - resume);
  }
  if (stored > 0) return stored;
  if (row.startedAt && row.completedAt) {
    const start = new Date(row.startedAt).getTime();
    const end = new Date(row.completedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  }
  return stored;
}

export function formatGestaoOsDuration(ms: number | null | undefined): string {
  const value = Math.max(0, Math.round(Number(ms) || 0));
  if (value <= 0) return '—';
  const totalMinutes = Math.round(value / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export function warrantyState(warrantyEndsAt?: string | null): 'expired' | 'expiring' | 'ok' | null {
  if (!warrantyEndsAt) return null;
  const end = new Date(warrantyEndsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const now = Date.now();
  if (end < now) return 'expired';
  if (end <= now + 30 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'ok';
}

export function checklistItemsToText(
  items?: Array<{ label?: string }> | null
): string {
  if (!items?.length) return '';
  return items.map((item) => String(item.label ?? '').trim()).filter(Boolean).join('\n');
}
