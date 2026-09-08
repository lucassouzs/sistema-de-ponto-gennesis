const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const SIDEBAR_SELECTED_MODULE_KEY = 'sidebar-selected-module-id';

/** Rail (5rem) + painel tier 2 (18rem) */
export const SIDEBAR_WIDTH_EXPANDED = '23rem';
/** Apenas o rail */
export const SIDEBAR_WIDTH_COLLAPSED = '5rem';

export const SIDEBAR_TRANSITION_CLASS = 'duration-500 ease-in-out';
/** ms — alinhado a duration-500 (borda do painel só some após fechar) */
export const SIDEBAR_TRANSITION_MS = 500;

/** Atalhos do rodapé do rail — recolhem o painel tier 2 automaticamente */
export const RAIL_FOOTER_ROUTES = ['/ponto/agenda', '/ponto/conversas', '/ponto/kanban', '/ponto/drive', '/ponto/flow'] as const;

export function isRailFooterRoute(pathname: string | null): boolean {
  if (pathname == null) return false;
  return RAIL_FOOTER_ROUTES.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}

export function isHomeRoute(pathname: string | null): boolean {
  return pathname === '/ponto/home';
}

export function shouldForceSidebarCollapsed(pathname: string | null): boolean {
  return isHomeRoute(pathname) || isRailFooterRoute(pathname);
}

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? JSON.parse(saved) === true : false;
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readSelectedModuleId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SIDEBAR_SELECTED_MODULE_KEY);
  } catch {
    return null;
  }
}

export function writeSelectedModuleId(moduleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SIDEBAR_SELECTED_MODULE_KEY, moduleId);
  } catch {
    /* ignore quota / private mode */
  }
}
