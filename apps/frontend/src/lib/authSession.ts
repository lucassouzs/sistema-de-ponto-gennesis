export const AUTH_TOKEN_REFRESHED_EVENT = 'auth:token-refreshed';

export function notifyAuthTokenRefreshed() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT));
}

export function clearStoredAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}

export function forceAuthRedirect() {
  if (typeof window === 'undefined') return;
  clearStoredAuth();
  if (!window.location.pathname.startsWith('/auth/')) {
    window.location.href = '/auth/login';
  }
}

export function hasStoredAuthToken() {
  if (typeof window === 'undefined') return false;
  return !!(localStorage.getItem('token') || sessionStorage.getItem('token'));
}
