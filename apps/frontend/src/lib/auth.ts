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

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const clone = response.clone();
      try {
        const error = await clone.json();
        throw new Error(error?.error || error?.message || 'Erro ao fazer login');
      } catch {
        const text = await response.text();
        throw new Error(text || 'Erro ao fazer login');
      }
    }

    const clone = response.clone();
    try {
      const data = await clone.json();
      if (data?.success && data?.data) {
        this.setToken(data.data.token);
        this.setUser(data.data.user);
        return data.data as AuthResponse;
      }
      throw new Error('Resposta inválida do servidor');
    } catch {
      const text = await response.text();
      throw new Error(text || 'Resposta inválida do servidor');
    }
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

    if (!response.ok) {
      const clone = response.clone();
      try {
        const error = await clone.json();
        throw new Error(error?.error || error?.message || 'Erro ao registrar usuário');
      } catch {
        const text = await response.text();
        throw new Error(text || 'Erro ao registrar usuário');
      }
    }

    const clone = response.clone();
    try {
      const result = await clone.json();
      if (result?.success && result?.data) {
        this.setToken(result.data.token);
        this.setUser(result.data.user);
        return result.data as AuthResponse;
      }
      throw new Error('Resposta inválida do servidor');
    } catch {
      const text = await response.text();
      throw new Error(text || 'Resposta inválida do servidor');
    }
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
    const response = await fetch('/api/auth/me', {
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

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  clearAuth(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
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
