import { PERMISSION_MODULES } from '@sistema-ponto/permission-modules';

export const APP_TITLE = 'Gennesis Conecta';

/** Rotas que não estão em PERMISSION_MODULES ou usam href diferente no menu. */
const EXTRA_PAGE_TITLES: Record<string, { title: string; category?: string; href?: string }> = {
  '/ponto/home': { title: 'Início' },
  '/ponto/agenda': { title: 'Agenda', category: 'Principal' },
  '/ponto/aprovacoes': { title: 'Aprovações', category: 'Principal' },
  '/ponto/solicitacoes-gerais': { title: 'Solicitações DP/ADM/TST', category: 'Principal' },
  '/ponto/gerenciar-solicitacoes-gerais': {
    title: 'Gerenciar Solicitações',
    category: 'Departamento Pessoal',
  },
  '/ponto/conversas': { title: 'Conversas', category: 'Principal' },
  '/ponto/gestao-solicitacoes': { title: 'Gestão de Solicitações', category: 'Principal' },
  '/ponto/regioes-postos-combustivel': {
    title: 'Postos de Combustível',
    category: 'Cadastros',
  },
  '/ponto/veiculos': { title: 'Frota', category: 'Cadastros' },
  '/ponto/seguranca-do-trabalho': {
    title: 'Segurança do Trabalho',
    category: 'Departamento Pessoal',
  },
  '/auth/login': { title: 'Login' },
};

const SUB_PATH_TITLES: Record<string, string> = {
  andamento: 'Andamento',
  'cronograma-mensal': 'Cronograma Mensal',
  'historico-os': 'Histórico OS',
  faturamento: 'Faturamento',
  relatorios: 'Relatórios Fotográficos',
  reunioes: 'Reuniões',
};

const MODULES_BY_HREF_LENGTH = [...PERMISSION_MODULES].sort(
  (a, b) => b.href.length - a.href.length,
);

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, '');
  return trimmed || '/';
}

function humanizeSegment(segment: string): string {
  const lowercaseParticles = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  return segment
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index > 0 && lowercaseParticles.has(lower)) return lower;
      if (!lower) return part;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** IDs opacos na URL (UUID, CUID, etc.) — não viram subtítulo legível. */
function looksLikeOpaqueId(segment: string): boolean {
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return true;
  if (/^[a-z0-9]{20,}$/i.test(segment)) return true;
  return false;
}

/** Decodifica segmentos dinâmicos da URL (ex.: `Paulo%20anania` → `Paulo anania`). */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '));
  } catch {
    return segment;
  }
}

/** Rótulo do breadcrumb — Aprovadores Fluig não exibe o sufixo interno «(legado)». */
function breadcrumbModuleLabel(module: { name: string; href: string }): string {
  if (module.href === '/ponto/fluig/aprovadores') return 'Aprovadores';
  return module.name;
}

export type BreadcrumbItem = {
  label: string;
  /** Se definido, o crumb é clicável (exceto o último). */
  href?: string;
};

/** Resolve o nome da página a partir da rota (ex.: `/ponto/kanban` → `Tasks`). */
export function resolvePageTitle(pathname: string): string | null {
  const crumbs = resolveBreadcrumbs(pathname);
  if (crumbs.length === 0) return null;
  return crumbs[crumbs.length - 1]?.label ?? null;
}

/**
 * Breadcrumb da rota: categoria/módulo (muted) > página atual (destaque).
 * Ex.: `/ponto/aprovacoes` → Principal > Aprovações
 */
export function resolveBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const path = normalizePath(pathname);

  const extra = EXTRA_PAGE_TITLES[path];
  if (extra) {
    if (extra.category) {
      return [{ label: extra.category }, { label: extra.title, href: extra.href ?? path }];
    }
    return [{ label: extra.title, href: path }];
  }

  for (const module of MODULES_BY_HREF_LENGTH) {
    const moduleLabel = breadcrumbModuleLabel(module);
    if (path === module.href) {
      if (module.category && module.category !== moduleLabel) {
        return [
          { label: module.category },
          { label: moduleLabel, href: module.href },
        ];
      }
      return [{ label: moduleLabel, href: module.href }];
    }

    if (path.startsWith(`${module.href}/`)) {
      const suffix = path.slice(module.href.length + 1);
      const segments = suffix.split('/').filter(Boolean);
      const lastSegment = decodePathSegment(segments[segments.length - 1] ?? '');

      const crumbs: BreadcrumbItem[] = [];
      if (module.category && module.category !== moduleLabel) {
        crumbs.push({ label: module.category });
      }
      crumbs.push({ label: moduleLabel, href: module.href });

      if (lastSegment && !looksLikeOpaqueId(lastSegment)) {
        const subTitle = SUB_PATH_TITLES[lastSegment] ?? humanizeSegment(lastSegment);
        crumbs.push({ label: subTitle, href: path });
      }

      return crumbs;
    }
  }

  // Fallback: humaniza o último segmento da URL
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || looksLikeOpaqueId(last)) return [];
  return [{ label: humanizeSegment(decodePathSegment(last)), href: path }];
}

/** Categoria/módulo do menu (ícone do rail), não o nome da página. */
export function resolveModuleCategory(pathname: string): string | null {
  const path = normalizePath(pathname);

  const extra = EXTRA_PAGE_TITLES[path];
  if (extra?.category) return extra.category;
  if (path === '/ponto/home') return 'Principal';

  for (const module of MODULES_BY_HREF_LENGTH) {
    if (path === module.href || path.startsWith(`${module.href}/`)) {
      return module.category || null;
    }
  }

  return null;
}

export function buildDocumentTitle(pageTitle: string | null | undefined): string {
  if (!pageTitle) return APP_TITLE;
  return `${pageTitle} | ${APP_TITLE}`;
}

/**
 * Insere entidade(s) dinâmica(s) após o crumb do módulo (ex.: após Contratos / Meu Drive).
 * Ex.: Principal > Meu Drive + CONFEA → Principal > Meu Drive > CONFEA
 */
export function appendBreadcrumbEntity(
  crumbs: BreadcrumbItem[],
  entity: BreadcrumbItem | BreadcrumbItem[] | null | undefined,
): BreadcrumbItem[] {
  const entities = (Array.isArray(entity) ? entity : entity ? [entity] : [])
    .map((item) => ({
      label: item.label?.trim() ?? '',
      href: item.href,
    }))
    .filter((item) => item.label.length > 0);

  if (entities.length === 0 || crumbs.length === 0) return crumbs;

  const existing = new Set(crumbs.map((c) => c.label));
  const toInsert = entities.filter((e) => !existing.has(e.label));
  if (toInsert.length === 0) return crumbs;

  const moduleIdx = crumbs.findIndex((c) => Boolean(c.href));
  if (moduleIdx < 0) {
    return [...crumbs, ...toInsert];
  }

  const next = [...crumbs];
  next.splice(moduleIdx + 1, 0, ...toInsert);
  return next;
}
