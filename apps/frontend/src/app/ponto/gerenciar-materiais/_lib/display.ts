import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle, Wrench, XCircle } from 'lucide-react';
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
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
        icon: XCircle
      };
    default:
      return {
        label: 'Desconhecido',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
        icon: AlertCircle
      };
  }
}

export function getPriorityInfo(priority: string): { label: string; color: string } {
  switch (priority) {
    case 'URGENT':
      return { label: 'Urgente', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'HIGH':
      return { label: 'Alta', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
    case 'MEDIUM':
      return { label: 'Média', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
    case 'LOW':
      return { label: 'Baixa', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
    default:
      return { label: 'Média', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400' };
  }
}

export function rmSolicitante(r: MaterialRequest): { id: string; name: string; email: string } | undefined {
  const rb = r.requestedBy as unknown;
  if (rb && typeof rb === 'object' && 'name' in (rb as Record<string, unknown>)) {
    return rb as { id: string; name: string; email: string };
  }
  return r.requester;
}

export function rmTitulo(r: MaterialRequest): string {
  const os = (r.serviceOrder || '').trim();
  if (os) return `OS ${os}`;
  if (r.requestNumber) return `OS ${r.requestNumber}`;
  return `OS #${r.id.slice(0, 8)}`;
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
    .replace(/\bCM[-:\s]*[A-Za-z0-9_-]+\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-:|.,;/]+|[\s\-:|.,;/]+$/g, '')
    .trim();
}

/** Título do material: descrição primeiro (texto legível), depois nome/códigos. */
export function materialItemLabel(item: MaterialLineItem): string {
  const m = item.material;
  const desc = sanitizeMaterialDisplayText(m.description);
  if (desc) return desc;
  const name = sanitizeMaterialDisplayText(m.name);
  if (name) return name;
  if (m.sinapiCode) return String(m.sinapiCode).trim();
  if (m.code) return String(m.code).trim();
  return 'Material';
}

/** Linha auxiliar: exibe nome curto, sem códigos técnicos (SINAPI/CM). */
export function materialItemSubtitle(item: MaterialLineItem): string | null {
  const m = item.material;
  const main = materialItemLabel(item);
  const parts: string[] = [];
  const name = sanitizeMaterialDisplayText(m.name);
  const desc = sanitizeMaterialDisplayText(m.description);
  if (desc && name && name !== desc) parts.push(name);
  return parts.length ? parts.join(' · ') : null;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Lista em pt-BR: "A", "A e B", "A, B e C" */
export function joinOrderNumbersPt(labels: string[]): string {
  const t = labels.filter(Boolean);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  if (t.length === 2) return `${t[0]} e ${t[1]}`;
  return `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}
