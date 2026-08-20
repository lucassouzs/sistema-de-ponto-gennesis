import type { HelpCategory } from './types';

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    slug: 'primeiros-passos',
    title: 'Primeiros passos',
    description:
      'Orientações para começar a usar o sistema: cadastros básicos, navegação e fluxos do dia a dia.',
    preview: 'getting-started',
  },
  {
    slug: 'departamento-pessoal',
    title: 'Departamento Pessoal',
    description:
      'Guias sobre funcionários, ausências, alterações de ponto e solicitações ao DP.',
    preview: 'departamento-pessoal',
  },
  {
    slug: 'compras-e-materiais',
    title: 'Compras e materiais',
    description:
      'Como abrir requisições de materiais (RM), acompanhar status e seguir o fluxo até a OC.',
    preview: 'compras',
  },
  {
    slug: 'chamados-e-gestao-os',
    title: 'Chamados e Gestão de OS',
    description:
      'Abrir e acompanhar chamados de manutenção e usar o Sistema de Gestão de OS.',
    preview: 'chamados',
  },
  {
    slug: 'central-de-atendimentos',
    title: 'Central de Atendimentos',
    description:
      'Atender conversas aguardando humano, responder e encerrar na Central de Atendimentos.',
    preview: 'atendimentos',
  },
  {
    slug: 'conta-e-seguranca',
    title: 'Conta e segurança',
    description:
      'Alterar senha, entender permissões de acesso e manter sua conta segura.',
    preview: 'conta',
  },
] as const;
