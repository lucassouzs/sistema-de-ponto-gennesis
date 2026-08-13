export type GestaoOsStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export type GestaoOsPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type GestaoOsMaintenanceType = 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE';
export type GestaoOsProfile = 'REQUESTER' | 'MANAGER' | 'TECHNICIAN' | 'ADMIN';

export type GestaoOsAttachment = {
  url: string;
  name: string;
  mimeType?: string;
};

export type GestaoOsUserRef = {
  id: string;
  name: string;
  email?: string;
};

export type GestaoOsWorkOrder = {
  id: string;
  displayNumber: number;
  /** Número da OS — preenchido na primeira análise. Null = ainda é só chamado. */
  osNumber: number | null;
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
  providerName: string | null;
  attachments: GestaoOsAttachment[] | null;
  cancelReason: string | null;
  completionNote: string | null;
  rating: number | null;
  ratingComment: string | null;
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

export type GestaoOsLocationTree = Array<{
  id: string;
  name: string;
  sectors: Array<{
    id: string;
    name: string;
    places: Array<{
      id: string;
      name: string;
      assets: Array<{
        id: string;
        name: string;
        category: string | null;
        qrToken?: string;
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
  qrToken: string;
  payloadUrl: string;
  dataUrl: string;
  locationLabel: string;
};

export const STATUS_LABELS: Record<GestaoOsStatus, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em Análise',
  APPROVED: 'Aprovada',
  IN_PROGRESS: 'Em Execução',
  WAITING_PARTS: 'Aguardando Peça/Terceiro',
  COMPLETED: 'Concluída',
  CLOSED: 'Encerrada/Avaliada',
  CANCELLED: 'Cancelada'
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
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: []
};

export const SERVICE_CATEGORIES = [
  'Elétrica',
  'Hidráulica',
  'Climatização',
  'Civil / Alvenaria',
  'Marcenaria',
  'Limpeza / Conservação',
  'TI / Telefonia',
  'Segurança / Acesso',
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
