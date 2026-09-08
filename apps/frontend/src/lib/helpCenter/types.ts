export type HelpCategoryPreview =
  | 'getting-started'
  | 'departamento-pessoal'
  | 'compras'
  | 'chamados'
  | 'atendimentos'
  | 'conta';

export interface HelpStep {
  title: string;
  body: string;
  hint?: string;
}

export interface HelpCategory {
  slug: string;
  title: string;
  description: string;
  preview: HelpCategoryPreview;
}

export interface HelpTutorial {
  slug: string;
  categorySlug: string;
  title: string;
  summary: string;
  keywords: string[];
  /** Rota do sistema relacionada ao tutorial (CTA “Abrir no sistema”). */
  href?: string;
  steps: HelpStep[];
}
