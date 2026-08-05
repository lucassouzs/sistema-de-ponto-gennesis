/** Eventos leves entre TopNavbar e Sidebar (evita elevar todo o estado do menu). */

export const LAYOUT_CHROME = {
  TOGGLE_SIDEBAR: 'gennesis:layout-toggle-sidebar',
  EXPAND_SIDEBAR: 'gennesis:layout-expand-sidebar',
  OPEN_MOBILE_SIDEBAR: 'gennesis:layout-open-mobile-sidebar',
  CLOSE_MOBILE_SIDEBAR: 'gennesis:layout-close-mobile-sidebar',
  CLOSE_PROFILE_MENU: 'gennesis:layout-close-profile-menu',
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
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.CLOSE_PROFILE_MENU));
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.OPEN_MOBILE_SIDEBAR));
}

export function dispatchCloseMobileSidebar() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.CLOSE_MOBILE_SIDEBAR));
}

export function dispatchCloseProfileMenu() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.CLOSE_PROFILE_MENU));
}

export function dispatchSetMenuSearch(detail: MenuSearchDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHROME.SET_MENU_SEARCH, { detail }));
}
