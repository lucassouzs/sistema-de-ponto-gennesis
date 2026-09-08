/** Camadas de z-index — sidebar sempre abaixo de modais. */
export const Z_SIDEBAR = 40;
export const Z_MODAL = 2000;
export const Z_MODAL_ELEVATED = 2100;
export const Z_MODAL_STACKED = 2200;
/**
 * Menu de ações (⋮): um único overlay fixed; o painel fica *dentro* dele
 * (absolute + stopPropagation) para o clique nunca cair no backdrop.
 */
export const Z_ACTION_MENU = 2101;
/** Lightbox / preview de mídia acima de modais comuns. */
export const Z_LIGHTBOX = 9000;

/** Classe no overlay raiz — usada para bloquear sidebar e scroll (ver MainLayout + globals.css). */
export const MODAL_OVERLAY_CLASS = 'app-modal-overlay';

/** Portal compartilhado com dropdowns (acima do conteúdo da página). */
export function getDropdownPortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('getDropdownPortalRoot called on server');
  }
  return document.getElementById('dropdown-portal-root') ?? document.body;
}
