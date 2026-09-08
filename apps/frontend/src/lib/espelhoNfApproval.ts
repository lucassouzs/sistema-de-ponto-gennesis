export type EspelhoApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT_FOR_CORRECTION'
  | 'CANCELLED';

export type EspelhoApprovalRecord = {
  status: EspelhoApprovalStatus;
  comment?: string;
  updatedAt: string;
};

const ESPELHO_APPROVAL_STORAGE_KEY = 'espelho-nf-approval-status-by-id';

export const ESPELHO_APPROVAL_STATUS_LABELS: Record<EspelhoApprovalStatus, string> = {
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  SENT_FOR_CORRECTION: 'Enviado para correção',
  CANCELLED: 'Cancelado'
};

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function getEspelhoApprovalStatusMap(): Record<string, EspelhoApprovalRecord> {
  if (!hasWindow()) return {};
  try {
    const raw = localStorage.getItem(ESPELHO_APPROVAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, EspelhoApprovalRecord>;
  } catch {
    return {};
  }
}

function setEspelhoApprovalStatusMap(map: Record<string, EspelhoApprovalRecord>): void {
  if (!hasWindow()) return;
  localStorage.setItem(ESPELHO_APPROVAL_STORAGE_KEY, JSON.stringify(map));
}

export function resolveEspelhoApprovalStatus(
  mirrorId: string,
  inlineStatus?: string | null
): EspelhoApprovalStatus {
  if (inlineStatus === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
  if (inlineStatus === 'APPROVED') return 'APPROVED';
  if (inlineStatus === 'SENT_FOR_CORRECTION') return 'SENT_FOR_CORRECTION';
  if (inlineStatus === 'CANCELLED') return 'CANCELLED';
  const fromMap = getEspelhoApprovalStatusMap()[mirrorId]?.status;
  if (fromMap === 'APPROVED') return 'APPROVED';
  if (fromMap === 'SENT_FOR_CORRECTION') return 'SENT_FOR_CORRECTION';
  if (fromMap === 'CANCELLED') return 'CANCELLED';
  return 'PENDING_APPROVAL';
}

export function updateEspelhoApprovalStatus(
  mirrorId: string,
  status: EspelhoApprovalStatus,
  comment?: string
): void {
  const map = getEspelhoApprovalStatusMap();
  map[mirrorId] = {
    status,
    comment: comment?.trim() || undefined,
    updatedAt: new Date().toISOString()
  };
  setEspelhoApprovalStatusMap(map);
}

export function removeEspelhoApprovalStatus(mirrorId: string): void {
  const map = getEspelhoApprovalStatusMap();
  if (!map[mirrorId]) return;
  delete map[mirrorId];
  setEspelhoApprovalStatusMap(map);
}
