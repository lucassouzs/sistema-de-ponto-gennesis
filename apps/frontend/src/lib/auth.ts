import { User } from '@/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  cpf: string;
  role?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

class AuthService {
  private tokenKey = 'token';
  private userKey = 'user';

  async login(credentials: LoginCredentials, rememberMe: boolean = true): Promise<AuthResponse> {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(response.ok ? 'Resposta inválida do servidor' : 'Erro ao fazer login');
    }

    const body = data as { success?: boolean; data?: { user?: User; token?: string }; message?: string; error?: string };

    if (!response.ok) {
      throw new Error(body?.error || body?.message || 'Erro ao fazer login');
    }

    if (!body?.success || !body.data || typeof body.data.token !== 'string' || !body.data.user) {
      throw new Error(body?.message || 'Resposta inválida do servidor');
    }

    try {
      this.setToken(body.data.token, rememberMe);
      const plainUser = JSON.parse(JSON.stringify(body.data.user)) as User;
      this.setUser(plainUser, rememberMe);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível guardar a sessão.';
      throw new Error(msg);
    }

    return body.data as AuthResponse;
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(data),
    });

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error(response.ok ? 'Resposta inválida do servidor' : 'Erro ao registrar usuário');
    }

    const result = parsed as { success?: boolean; data?: { user?: User; token?: string }; message?: string; error?: string };

    if (!response.ok) {
      throw new Error(result?.error || result?.message || 'Erro ao registrar usuário');
    }

    if (!result?.success || typeof result.data?.token !== 'string' || !result.data?.user) {
      throw new Error(result?.message || 'Resposta inválida do servidor');
    }

    try {
      this.setToken(result.data.token);
      const plainUser = JSON.parse(JSON.stringify(result.data.user)) as User;
      this.setUser(plainUser);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível guardar a sessão.';
      throw new Error(msg);
    }

    return result.data as AuthResponse;
  }

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
          'Accept': 'application/json',
        },
      });
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      this.clearAuth();
    }
  }

  async getProfile(): Promise<User> {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Erro ao buscar perfil');
    }

    const data = await response.json();
    return data.data;
  }

  async updateProfile(profileData: Partial<User>): Promise<User> {
    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const clone = response.clone();
      try {
        const error = await clone.json();
        throw new Error(error?.error || error?.message || 'Erro ao atualizar perfil');
      } catch {
        const text = await response.text();
        throw new Error(text || 'Erro ao atualizar perfil');
      }
    }

    const data = await response.json();
    this.setUser(data.data);
    return data.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch('/api/auth/change-password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const clone = response.clone();
      try {
        const error = await clone.json();
        throw new Error(error?.error || error?.message || 'Erro ao alterar senha');
      } catch {
        const text = await response.text();
        throw new Error(text || 'Erro ao alterar senha');
      }
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const clone = response.clone();
        try {
          const error = await clone.json();
          throw new Error(error?.error || error?.message || 'Erro ao solicitar recuperação de senha');
        } catch (parseError) {
          const text = await response.text();
          throw new Error(text || `Erro ao solicitar recuperação de senha (${response.status})`);
        }
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Erro ao solicitar recuperação de senha');
      }
    } catch (error: any) {
      // Se for erro de rede, fornecer mensagem mais clara
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
      }
      throw error;
    }
  }

  setToken(token: string, rememberMe: boolean = true): void {
    if (rememberMe) {
      localStorage.setItem(this.tokenKey, token);
    } else {
      sessionStorage.setItem(this.tokenKey, token);
    }
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    // Tenta primeiro localStorage, depois sessionStorage
    return localStorage.getItem(this.tokenKey) || sessionStorage.getItem(this.tokenKey);
  }

  setUser(user: User, rememberMe: boolean = true): void {
    if (rememberMe) {
      localStorage.setItem(this.userKey, JSON.stringify(user));
    } else {
      sessionStorage.setItem(this.userKey, JSON.stringify(user));
    }
  }

  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    // Tenta primeiro localStorage, depois sessionStorage
    const userStr = localStorage.getItem(this.userKey) || sessionStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  clearAuth(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.userKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role === role;
  }

  hasAnyRole(roles: string[]): boolean {
    const user = this.getUser();
    return user ? roles.includes(user.role) : false;
  }
}

export const authService = new AuthService();

// Função para uso no servidor (Next.js)
export async function getServerSession(): Promise<User | null> {
  // Em uma implementação real, você verificaria o token JWT no servidor
  // Por enquanto, retornamos null para forçar login
  return null;
}
