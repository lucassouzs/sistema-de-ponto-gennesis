import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './apiBaseUrl';
import { forceAuthRedirect, notifyAuthTokenRefreshed } from './authSession';

export { API_BASE_URL } from './apiBaseUrl';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

/** Sem interceptors — evita loop em refresh. */
const refreshApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (reason?: unknown) => void;
}> = [];

let refreshPromise: Promise<string | null> | null = null;

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function storeToken(newToken: string) {
  if (localStorage.getItem('token')) {
    localStorage.setItem('token', newToken);
  } else {
    sessionStorage.setItem('token', newToken);
  }
}

function parseJwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(normalized)) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** true se o JWT já expirou ou expira em menos de `skewMs`. */
function tokenNeedsRefresh(token: string, skewMs = 90_000): boolean {
  const expMs = parseJwtExpMs(token);
  if (expMs == null) return false;
  return expMs <= Date.now() + skewMs;
}

function isRefreshRequest(config?: InternalAxiosRequestConfig): boolean {
  const url = String(config?.url || '');
  return url.includes('/auth/refresh-token');
}

/**
 * Renova o access token (single-flight). Retorna o novo token ou null se falhar.
 * Não redireciona — quem chama decide.
 * Libera a fila do interceptor de resposta quando o refresh termina.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const token = getStoredToken();
    if (!token) {
      processQueue(new Error('Sem token para renovar'), null);
      return null;
    }

    try {
      const refreshResponse = await refreshApi.post(
        '/auth/refresh-token',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newToken = refreshResponse.data?.data?.token as string | undefined;
      if (!newToken) {
        processQueue(new Error('Token não recebido na renovação'), null);
        return null;
      }
      storeToken(newToken);
      notifyAuthTokenRefreshed();
      processQueue(null, newToken);
      return newToken;
    } catch (err) {
      processQueue(err, null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Garante token válido antes de rajadas de requests (ex.: detalhe do contrato).
 * Renova se estiver expirado ou perto de expirar.
 */
export async function ensureValidAuthToken(skewMs = 90_000): Promise<string | null> {
  const token = getStoredToken();
  if (!token) return null;
  if (!tokenNeedsRefresh(token, skewMs)) return token;
  return (await refreshAccessToken()) || getStoredToken();
}

api.interceptors.request.use(
  async (config) => {
    if (!isRefreshRequest(config)) {
      const current = getStoredToken();
      if (current && tokenNeedsRefresh(current)) {
        await refreshAccessToken();
      }
    }

    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.data instanceof FormData) {
      const h = config.headers;
      if (h && typeof (h as { delete?: (k: string) => void }).delete === 'function') {
        (h as { delete: (k: string) => void }).delete('Content-Type');
        (h as { delete: (k: string) => void }).delete('content-type');
      } else {
        delete (h as Record<string, unknown>)['Content-Type'];
        delete (h as Record<string, unknown>)['content-type'];
      }
    } else {
      config.headers['Content-Type'] = 'application/json';
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;
    if (!originalRequest) return Promise.reject(error);

    if (error.response?.status !== 401 || originalRequest._retry || isRefreshRequest(originalRequest)) {
      return Promise.reject(error);
    }

    if (refreshPromise) {
      return new Promise<string | null>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (!token) return Promise.reject(error);
          originalRequest._retry = true;
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;

    const token = getStoredToken();
    if (!token) {
      forceAuthRedirect();
      return Promise.reject(error);
    }

    const newToken = await refreshAccessToken();
    if (newToken) {
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
      }
      return api(originalRequest);
    }

    forceAuthRedirect();
    return Promise.reject(error);
  }
);

export default api;
