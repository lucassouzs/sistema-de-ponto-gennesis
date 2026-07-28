/** Eventos leves entre TopNavbar e Sidebar (evita elevar todo o estado do menu). */

export const LAYOUT_CHROME = {
  TOGGLE_SIDEBAR: 'gennesis:layout-toggle-sidebar',
  EXPAND_SIDEBAR: 'gennesis:layout-expand-sidebar',
  OPEN_MOBILE_SIDEBAR: 'gennesis:layout-open-mobile-sidebar',
  SET_MENU_SEARCH: 'gennesis:layout-set-menu-search',
} as const;

export type MenuSearchDetail = {
  term: string;
};

export function dispatchToggleSidebar() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.TOGGLE_SIDEBAR));
}

export function dispatchExpandSidebar() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.EXPAND_SIDEBAR));
}

export function dispatchOpenMobileSidebar() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.OPEN_MOBILE_SIDEBAR));
}

export function dispatchSetMenuSearch(detail: MenuSearchDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.SET_MENU_SEARCH, { detail }));
}
