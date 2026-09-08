import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { buildApiUrl } from '../config/api';
import { serializeLoginIdentifier } from '../lib/cpf';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Storage compatível com Web e Nativo
const storage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return Promise.resolve(localStorage.getItem(key));
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const token = await storage.getItem('token');
      const userData = await storage.getItem('user');

      if (token && userData) {
        setUser(JSON.parse(userData));
        // Atualiza perfil (inclui foto) em background
        try {
          const res = await fetch(buildApiUrl('/api/auth/me'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            const fresh = (json?.data ?? json) as User;
            if (fresh?.id) {
              setUser(fresh);
              await storage.setItem('user', JSON.stringify(fresh));
            }
          }
        } catch {
          // mantém usuário do storage
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados de autenticação:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (identifier: string, password: string) => {
    try {
      console.log('🔐 Tentando fazer login...');
      console.log('🌐 URL:', buildApiUrl('/api/auth/login'));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: serializeLoginIdentifier(identifier),
          password,
          source: 'mobile',
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Erro na resposta:', error);
        throw new Error(error.error || 'Erro ao fazer login');
      }

      const data = await response.json();
      console.log('✅ Dados recebidos:', data);
      
      if (data.success) {
        const { user: userData, token } = data.data;
        
        await storage.setItem('token', token);
        await storage.setItem('user', JSON.stringify(userData));
        
        setUser(userData);
        console.log('🎉 Login realizado com sucesso!');
      }
    } catch (error: any) {
      console.error('💥 Erro no login:', error);
      if (error.name === 'AbortError') {
        throw new Error('Timeout: Servidor não respondeu em 10 segundos');
      }
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = await storage.getItem('token');
      
      if (token) {
        await fetch(buildApiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      await storage.removeItem('token');
      await storage.removeItem('user');
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
