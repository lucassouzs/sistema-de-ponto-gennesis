import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { buildApiUrl } from '../config/api';

// Storage compatível com Web e Nativo
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  }
};

// Flag para evitar loops infinitos de refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
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

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  _retry?: boolean;
}

/**
 * Faz uma requisição HTTP com refresh automático de token
 */
export const apiRequest = async (
  url: string,
  options: RequestOptions = {}
): Promise<Response> => {
  const { skipAuth = false, _retry = false, ...fetchOptions } = options;

  // Adicionar token se não for skipAuth
  if (!skipAuth) {
    const token = await storage.getItem('token');
    if (token) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }

  try {
    const response = await fetch(url, fetchOptions);

    // Se for erro 401 e não for a rota de refresh e ainda não tentou refresh
    if (response.status === 401 && !skipAuth && !_retry) {
      // Se já está tentando refresh, adiciona à fila
      if (isRefreshing) {
        return new Promise<Response>((resolve, reject) => {
          failedQueue.push({
            resolve: async (newToken: string) => {
              try {
                const retryOptions: RequestInit = {
                  ...fetchOptions,
                  headers: {
                    ...fetchOptions.headers,
                    Authorization: `Bearer ${newToken}`,
                  },
                  _retry: true,
                };
                const retryResponse = await fetch(url, retryOptions);
                resolve(retryResponse);
              } catch (err) {
                reject(err);
              }
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      const token = await storage.getItem('token');

      // Se não tem token, retornar erro
      if (!token) {
        isRefreshing = false;
        await storage.removeItem('token');
        await storage.removeItem('user');
        return response; // Retorna o erro 401 original
      }

      try {
        // Tentar fazer refresh do token
        const refreshResponse = await fetch(buildApiUrl('/api/auth/refresh-token'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          const newToken = refreshData?.data?.token;

          if (newToken) {
            // Atualizar token no storage
            await storage.setItem('token', newToken);

            // Processar fila de requisições pendentes
            processQueue(null, newToken);

            isRefreshing = false;

            // Retentar a requisição original com novo token
            const retryOptions = {
              ...fetchOptions,
              headers: {
                ...fetchOptions.headers,
                Authorization: `Bearer ${newToken}`,
              },
              _retry: true,
            };
            return fetch(url, retryOptions);
          } else {
            throw new Error('Token não recebido na resposta de refresh');
          }
        } else {
          throw new Error('Erro ao fazer refresh do token');
        }
      } catch (refreshError) {
        // Se falhar o refresh, processar fila com erro
        processQueue(refreshError, null);
        isRefreshing = false;

        await storage.removeItem('token');
        await storage.removeItem('user');
        
        // Retornar o erro original
        return response;
      }
    }

    return response;
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * Métodos HTTP simplificados
 */
export const api = {
  get: async (url: string, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  },

  post: async (url: string, data?: any, options?: RequestOptions): Promise<Response> => {
    const isFormData = data instanceof FormData;
    
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'POST',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options?.headers,
      },
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    });
  },

  patch: async (url: string, data?: any, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  put: async (url: string, data?: any, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  delete: async (url: string, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  },
};

export default api;

