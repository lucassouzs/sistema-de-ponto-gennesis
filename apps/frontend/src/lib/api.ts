import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './apiBaseUrl';

export { API_BASE_URL } from './apiBaseUrl';

// Configurar axios
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  // Removendo Content-Type fixo para permitir multipart/form-data
});

// Instância separada do axios para refresh (sem interceptors que causam loop)
const refreshApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Flag para evitar loops infinitos de refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Interceptor para adicionar token de autenticação e configurar Content-Type
api.interceptors.request.use(
  (config) => {
    // Buscar token tanto do localStorage quanto do sessionStorage
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // FormData: o browser/axios precisa adicionar `multipart/form-data; boundary=...`
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
      // Para outros tipos, usar application/json
      config.headers['Content-Type'] = 'application/json';
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar respostas e fazer refresh automático de token
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Se for erro 401 e não for a rota de refresh e ainda não tentou refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Se já está tentando refresh, adiciona à fila
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      // Buscar token tanto do localStorage quanto do sessionStorage
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');

      // Se não tem token, redireciona para login
      if (!token) {
        isRefreshing = false;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/auth/login';
        return Promise.reject(error);
      }

      try {
        // Tentar fazer refresh do token usando instância separada (sem interceptors)
        const refreshResponse = await refreshApi.post(
          '/auth/refresh-token',
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const newToken = refreshResponse.data?.data?.token;

        if (newToken) {
          // Atualizar token no mesmo storage onde estava (localStorage ou sessionStorage)
          const currentToken = localStorage.getItem('token') || sessionStorage.getItem('token');
          if (localStorage.getItem('token')) {
            localStorage.setItem('token', newToken);
          } else {
            sessionStorage.setItem('token', newToken);
          }

          // Atualizar header da requisição original
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }

          // Processar fila de requisições pendentes
          processQueue(null, newToken);

          isRefreshing = false;

          // Retentar a requisição original
          return api(originalRequest);
        } else {
          throw new Error('Token não recebido na resposta de refresh');
        }
      } catch (refreshError) {
        // Se falhar o refresh, processar fila com erro e redirecionar
        processQueue(refreshError, null);
        isRefreshing = false;

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/auth/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
