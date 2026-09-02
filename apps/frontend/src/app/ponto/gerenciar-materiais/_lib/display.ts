import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle, Wrench, XCircle } from 'lucide-react';
import { ensureOsSePrefix } from '@/lib/formatOsSePasta';
import type { MaterialRequest } from './types';

export function getStatusInfo(status: string): {
  label: string;
  color: string;
  icon: LucideIcon;
} {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Pendente',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        icon: AlertCircle
      };
    case 'IN_REVIEW':
      return {
        label: 'Correção RM',
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        icon: Wrench
      };
    case 'APPROVED':
      return {
        label: 'Aprovada',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: CheckCircle
      };
    case 'CANCELLED':
      return {
        label: 'Cancelada',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        icon: XCircle
      };
    default:
      return {
        label: 'Desconhecido',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        icon: AlertCircle
      };
  }
}

export function getPriorityInfo(priority: string): { label: string; color: string } {
  switch (priority) {
    case 'URGENT':
      return { label: 'Urgente', color: 'text-red-600 dark:text-red-400' };
    case 'HIGH':
      return { label: 'Alta', color: 'text-orange-600 dark:text-orange-400' };
    case 'MEDIUM':
      return { label: 'Média', color: 'text-yellow-600 dark:text-yellow-400' };
    case 'LOW':
      return { label: 'Baixa', color: 'text-blue-600 dark:text-blue-400' };
    default:
      return { label: 'Média', color: 'text-gray-600 dark:text-gray-400' };
  }
}

export function rmSolicitante(r: MaterialRequest): { id: string; name: string; email: string } | undefined {
  const rb = r.requestedBy as unknown;
  if (rb && typeof rb === 'object' && 'name' in (rb as Record<string, unknown>)) {
    return rb as { id: string; name: string; email: string };
  }
  return r.requester;
}

export function rmSolicitanteId(r: MaterialRequest): string | undefined {
  const rb = r.requestedBy as unknown;
  if (typeof rb === 'string') return rb;
  if (rb && typeof rb === 'object' && 'id' in (rb as Record<string, unknown>)) {
    return String((rb as { id?: string }).id || '').trim() || undefined;
  }
  return r.requester?.id;
}

export function canUserCancelMaterialRequest(
  request: MaterialRequest,
  userId?: string | null,
  isElevatedUser = false,
  options?: { assumeCurrentUserIsOwner?: boolean }
): boolean {
  if (isElevatedUser) return true;
  if (!userId) return false;
  if (options?.assumeCurrentUserIsOwner) return true;
  const creatorId = rmSolicitanteId(request);
  if (!creatorId) return false;
  return creatorId === userId;
}

export function rmTitulo(r: MaterialRequest): string {
  const os = (r.serviceOrder || '').trim();
  if (os) return ensureOsSePrefix(os);
  if (r.requestNumber) return `OS ${r.requestNumber}`;
  return `OS #${r.id.slice(0, 8)}`;
}

function rmLinkedContract(r: MaterialRequest) {
  const pleitos = r.service_orders?.pleitos ?? [];
  const src = pleitos.find((p) => p.updatedContract) ?? pleitos[0];
  return src?.updatedContract ?? null;
}

export function rmOsDisplay(r: MaterialRequest): string {
  const os = (r.serviceOrder || '').trim();
  if (os) return os.replace(/^(OS|SE)\s+/i, '').trim() || '—';
  const so = r.service_orders;
  if (so) return `${so.numero}/${so.ano}`;
  return '—';
}

export function rmContractDisplay(r: MaterialRequest): string {
  const contract = rmLinkedContract(r);
  if (contract?.name?.trim()) return contract.name.trim();
  if (contract?.number?.trim()) return contract.number.trim();
  // Fallback: CC costuma ser o rótulo do contrato quando a OS não traz vínculo.
  if (r.costCenter?.name?.trim()) return r.costCenter.name.trim();
  return '—';
}

/** Item com material (SC / OC) — aceita variações de API (null em códigos). */
export type MaterialLineItem = {
  material: {
    name?: string | null;
    description?: string | null;
    sinapiCode?: string | null;
    code?: string | null;
  };
};

function sanitizeMaterialDisplayText(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/\bSINAPI\b/gi, ' ')
    .replace(/\bCM[\s:-]*[A-Za-z0-9_-]+\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-:|.,;/]+|[\s\-:|.,;/]+$/g, '')
    .trim();
}

/** Título do material: nome do cadastro em destaque; descrição vai no subtítulo. */
export function materialItemLabel(item: MaterialLineItem): string {
  const m = item.material;
  if (!m) return 'Material';
  const name = sanitizeMaterialDisplayText(m.name);
  if (name) return name;
  const desc = sanitizeMaterialDisplayText(m.description);
  if (desc) return desc;
  if (m.sinapiCode) return String(m.sinapiCode).trim();
  if (m.code) return String(m.code).trim();
  return 'Material';
}

/** Linha auxiliar: descrição quando existir e for diferente do nome. */
export function materialItemSubtitle(item: MaterialLineItem): string | null {
  const m = item.material;
  if (!m) return null;
  const name = sanitizeMaterialDisplayText(m.name);
  const desc = sanitizeMaterialDisplayText(m.description);
  if (desc && name && desc !== name) return desc;
  return null;
}

/** Rótulo de material/serviço em linhas de OC (nome do cadastro em destaque). */
export function catalogMaterialLabel(
  material?: MaterialLineItem['material'] | null
): string {
  if (!material) return '—';
  return materialItemLabel({ material });
}

/** Subtítulo em linhas de OC quando a descrição difere do nome. */
export function catalogMaterialSubtitle(
  material?: MaterialLineItem['material'] | null
): string | null {
  if (!material) return null;
  return materialItemSubtitle({ material });
}

export type PurchaseOrderLineDetailSource = {
  notes?: string | null;
  materialRequestItem?: {
    notes?: string | null;
    observation?: string | null;
  } | null;
};

/** Detalhamento do item (mapa de cotação → notes da OC; fallback observação da RM). */
export function purchaseOrderItemDetailText(line: PurchaseOrderLineDetailSource): string {
  const fromOc = typeof line.notes === 'string' ? line.notes.trim() : '';
  if (fromOc) return fromOc;
  const mri = line.materialRequestItem;
  if (!mri || typeof mri !== 'object') return '';
  const fromRmNotes = typeof mri.notes === 'string' ? mri.notes.trim() : '';
  if (fromRmNotes) return fromRmNotes;
  const fromRmObs = typeof mri.observation === 'string' ? mri.observation.trim() : '';
  return fromRmObs;
}

/** Linha secundária na OC: detalhamento do mapa (se houver), senão descrição do cadastro. */
export function purchaseOrderLineSubtitle(
  line: PurchaseOrderLineDetailSource & { material?: MaterialLineItem['material'] | null }
): string | null {
  const detail = purchaseOrderItemDetailText(line);
  if (detail) return detail;
  return catalogMaterialSubtitle(line.material);
}

export function formatDateOnly(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDate(dateString: string): string {
  return formatDateTime(dateString);
}

/** Lista em pt-BR: "A", "A e B", "A, B e C" */
export function joinOrderNumbersPt(labels: string[]): string {
  const t = labels.filter(Boolean);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  if (t.length === 2) return `${t[0]} e ${t[1]}`;
  return `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}
