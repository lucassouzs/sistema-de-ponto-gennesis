export type JuridicoProcessoAnexo = {
  id: string;
  externalId?: string | null;
  originalName: string;
  sourcePath?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt?: string;
};

export type JuridicoProcessoComprovante = JuridicoProcessoAnexo & {
  dataPagamento?: string | null;
};

export type JuridicoProcesso = {
  id: string;
  externalId: string;
  numeroProcesso: string;
  tribunal?: string | null;
  vara?: string | null;
  reclamante: string;
  dataAudiencia?: string | null;
  horario?: string | null;
  presencial?: string | null;
  statusProcesso?: string | null;
  decisaoStf?: string | null;
  polo?: string | null;
  empresa?: string | null;
  objeto?: string | null;
  objeto2?: string | null;
  contrato?: string | null;
  funcao?: string | null;
  regimeContratacao?: string | null;
  periodo?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  representanteAutor?: string | null;
  acordo?: string | null;
  valorCausa?: string | number | null;
  statusSentenca?: string | null;
  valorSentenca?: string | number | null;
  valorRO?: string | number | null;
  valorRR?: string | number | null;
  valorCustas?: string | number | null;
  valorAcordo?: string | number | null;
  valorPagoSentenciado?: string | number | null;
  valorParcela?: string | number | null;
  valorPago?: string | number | null;
  numParcelas?: number | null;
  custas?: string | number | null;
  previdencia?: string | number | null;
  outrosGastos?: string | number | null;
  status?: string | null;
  dataAcordo?: string | null;
  dataAbertura?: string | null;
  agravoInstrumento?: string | null;
  anexos?: JuridicoProcessoAnexo[];
  comprovantes?: JuridicoProcessoComprovante[];
  _count?: { anexos: number; comprovantes: number };
  /** Registros da planilha cujo arquivo ainda não foi enviado. */
  anexosPendentes?: number;
  comprovantesPendentes?: number;
};

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function mesFromDate(value?: string | null): string {
  if (!value) return '—';
  const parts = value.split('/');
  if (parts.length >= 2) {
    const m = Number(parts[1]);
    if (m >= 1 && m <= 12) return MESES[m - 1]!;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return MESES[d.getMonth()]!;
  return '—';
}

export function toMoneyNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value)
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastDot > lastComma ? raw.replace(/,/g, '') : raw.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    normalized = raw.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrencyBRL(value: string | number | null | undefined): string {
  const n = toMoneyNumber(value);
  if (!n) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const s = String(value).trim();
  return s || '—';
}

export function statusBadgeClass(status?: string | null): string {
  const s = (status || '').toUpperCase();
  if (s.includes('ARQUIV')) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (s.includes('ANDAMENTO')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  if (s.includes('SUSPENS')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  if (s.includes('ACORDO')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  if (s.includes('INSTRU') || s.includes('AUDIEN')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
}

/** Primeira letra de cada palavra maiúscula (ex.: "ANDAMENTO PROCESSUAL" → "Andamento Processual"). */
export function toStatusTitleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Rótulo legível do status do processo (sem ALL CAPS). */
export function formatProcessoStatus(
  status?: string | null,
  statusProcesso?: string | null,
): string {
  const raw = String(status || statusProcesso || '').trim();
  if (!raw) return '—';
  return toStatusTitleCase(raw);
}

export function statusStatIconClasses(status?: string | null): {
  iconBg: string;
  iconColor: string;
} {
  const s = (status || '').toUpperCase();
  if (!status || status === 'all') {
    return {
      iconBg: 'bg-slate-100 dark:bg-slate-800/60',
      iconColor: 'text-slate-600 dark:text-slate-300',
    };
  }
  if (s.includes('ARQUIV')) {
    return {
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
    };
  }
  if (s.includes('ANDAMENTO')) {
    return {
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    };
  }
  if (s.includes('SUSPENS')) {
    return {
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    };
  }
  if (s.includes('ACORDO')) {
    return {
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
    };
  }
  if (s.includes('INSTRU') || s.includes('AUDIEN')) {
    return {
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
    };
  }
  return {
    iconBg: 'bg-gray-100 dark:bg-gray-700',
    iconColor: 'text-gray-600 dark:text-gray-300',
  };
}

/** Rótulo curto dos cards de filtro por status (plural). */
export function statusCardLabel(status?: string | null): string {
  if (!status || status === 'all') return 'Todos';
  const s = status.toUpperCase();
  if (s.includes('ARQUIV')) return 'Arquivados';
  if (s.includes('SUSPENS')) return 'Suspensos';
  if (s.includes('ANDAMENTO')) return 'Andamento Processual';
  if (s.includes('INSTRU')) return 'Audiências de Instrução';
  if (s.includes('INICIAL') && s.includes('AUDIEN')) return 'Audiências Iniciais';
  if (s.includes('AGUARDANDO') && s.includes('ARQUIV')) return 'Aguardando Arquivamento';
  if (s.includes('ACORDO')) return 'Acordos';
  if (s.includes('AUDIEN')) return 'Audiências';
  return toStatusTitleCase(status);
}

/** Título da lista conforme o card de status selecionado (plural). */
export function statusListTitle(status?: string | null): string {
  if (!status || status === 'all') return 'Todos os Processos';
  const s = status.toUpperCase();
  if (s.includes('ARQUIV')) return 'Processos Arquivados';
  if (s.includes('SUSPENS')) return 'Processos Suspensos';
  if (s.includes('ANDAMENTO')) return 'Processos em Andamento Processual';
  if (s.includes('INSTRU')) return 'Processos em Audiência de Instrução';
  if (s.includes('INICIAL') && s.includes('AUDIEN')) return 'Processos em Audiência Inicial';
  if (s.includes('AGUARDANDO') && s.includes('ARQUIV')) return 'Processos Aguardando Arquivamento';
  if (s.includes('ACORDO')) return 'Processos com Acordo';
  if (s.includes('AUDIEN')) return 'Processos em Audiência';
  return `Processos ${toStatusTitleCase(status)}`;
}
