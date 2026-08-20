import type { HelpCategoryPreview } from '@/lib/helpCenter/types';
import { DEPARTMENTS_LIST } from '@/constants/payrollFilters';

export const HELP_SETOR_GERAL = 'Geral';

export const HELP_SETOR_ORDER = [HELP_SETOR_GERAL, ...DEPARTMENTS_LIST] as const;

const SETOR_META: Record<
  string,
  { description: string; preview: HelpCategoryPreview }
> = {
  Geral: {
    description: 'Tutoriais gerais para começar e navegar no sistema.',
    preview: 'getting-started',
  },
  Projetos: {
    description: 'Guias ligados a projetos e fluxos de engenharia.',
    preview: 'chamados',
  },
  'Contratos e Licitações': {
    description: 'Tutoriais sobre contratos, licitações e documentos.',
    preview: 'conta',
  },
  Suprimentos: {
    description: 'RMs, OCs, estoque e fluxos de compras.',
    preview: 'compras',
  },
  Jurídico: {
    description: 'Orientações do setor jurídico no sistema.',
    preview: 'conta',
  },
  'Departamento Pessoal': {
    description: 'Funcionários, ausências, ponto e atendimentos.',
    preview: 'departamento-pessoal',
  },
  Engenharia: {
    description: 'Guias de engenharia e operação técnica.',
    preview: 'chamados',
  },
  Administrativo: {
    description: 'Processos administrativos do dia a dia.',
    preview: 'getting-started',
  },
  Financeiro: {
    description: 'Controle financeiro, receitas e processos do setor.',
    preview: 'conta',
  },
  Operacional: {
    description: 'Tutoriais de operação e rotinas de campo.',
    preview: 'chamados',
  },
  'Segurança do Trabalho': {
    description: 'Guias de SST, ASO e segurança no trabalho.',
    preview: 'departamento-pessoal',
  },
  Sócios: {
    description: 'Conteúdos voltados ao setor de Sócios.',
    preview: 'conta',
  },
};

export function slugifySetor(setor: string): string {
  return setor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveSetorFromSlug(slug: string): string | null {
  const found = HELP_SETOR_ORDER.find((s) => slugifySetor(s) === slug);
  return found ?? null;
}

export function getSetorMeta(setor: string): {
  description: string;
  preview: HelpCategoryPreview;
} {
  return (
    SETOR_META[setor] || {
      description: `Tutoriais e guias do setor ${setor}.`,
      preview: 'getting-started' as HelpCategoryPreview,
    }
  );
}
