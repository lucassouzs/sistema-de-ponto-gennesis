import type { ProcessoJuridico } from '@/data/juridico-processos';

/** Colunas alinhadas à planilha de Processos Ativos. */
export interface ProcessoAtivo {
  id: string;
  reclamante: string;
  numeroProcesso: string;
  tribunal: string;
  vara: string;
  mes: string;
  dataAudiencia: string;
  horario: string;
  presencial: string;
  statusProcesso: string;
  decisaoStf: string;
  objeto: string;
  valorCausa: number;
  polo: string;
  funcao: string;
  representanteAutor: string;
  empresa: string;
  contrato: string;
  periodo: string;
  valorAcordo: number;
  valorSentenca: number;
  valorCustas: number;
  valorRO: number;
  valorRR: number;
  valorAgravo: number;
  execucaoProvisoria: string;
  embargosExecucao: string;
  regimeContratacao: string;
}

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

function mesFromDate(value?: string): string {
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

export function mapProcessoToAtivo(p: ProcessoJuridico): ProcessoAtivo {
  return {
    id: p.id,
    reclamante: p.reclamante || '—',
    numeroProcesso: p.numeroProcesso || '—',
    tribunal: p.tribunal || '—',
    vara: p.vara || '—',
    mes: mesFromDate(p.dataAudiencia || p.dataAbertura),
    dataAudiencia: p.dataAudiencia || '—',
    horario: p.horario || '—',
    presencial: p.presencial || '—',
    statusProcesso: p.statusProcesso || p.status || '—',
    decisaoStf: '—',
    objeto: p.objeto || '—',
    valorCausa: p.valorCausa || 0,
    polo: p.polo || '—',
    funcao: p.funcao || '—',
    representanteAutor: p.representanteAutor || '—',
    empresa: p.empresa || '—',
    contrato: p.contrato || '—',
    periodo: p.periodo || '—',
    valorAcordo: p.valorAcordo || 0,
    valorSentenca: p.valorSentenca || 0,
    valorCustas: p.valorCustas || p.custas || 0,
    valorRO: p.valorRO || 0,
    valorRR: p.valorRR || 0,
    valorAgravo: 0,
    execucaoProvisoria: '—',
    embargosExecucao: '—',
    regimeContratacao: p.regimeContratacao || '—',
  };
}

/** Processos ativos — inicia vazio até importar a planilha. */
export const processosAtivos: ProcessoAtivo[] = [];

export function formatCurrencyBRL(value: number): string {
  if (!value) return '—';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
