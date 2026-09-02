import { User } from '@/types';
import { API_BASE_URL } from './apiBaseUrl';
import { serializeLoginIdentifier } from './cpf';

export interface LoginCredentials {
  identifier: string;
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

type AuthApiBody = {
  success?: boolean;
  data?: { user?: User; token?: string };
  message?: string;
  error?: string;
};

class AuthService {
  private tokenKey = 'token';
  private userKey = 'user';

  private authUrl(path: string): string {
    return `${API_BASE_URL}/auth${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async parseJson(response: Response): Promise<AuthApiBody> {
    try {
      return (await response.json()) as AuthApiBody;
    } catch {
      throw new Error(response.ok ? 'Resposta inválida do servidor' : 'Erro na requisição de autenticação');
    }
  }

  async login(credentials: LoginCredentials, rememberMe: boolean = true): Promise<AuthResponse> {
    const response = await fetch(this.authUrl('/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        identifier: serializeLoginIdentifier(credentials.identifier),
        password: credentials.password,
        source: 'web',
      }),
    });

    const body = await this.parseJson(response);

    if (!response.ok) {
      throw new Error(body?.error || body?.message || 'Erro ao fazer login');
    }

    if (!body?.success || !body.data || typeof body.data.token !== 'string' || !body.data.user) {
      throw new Error(body?.message || 'Resposta inválida do servidor');
    }

    try {
      this.setToken(body.data.token, rememberMe);
      this.setUser(body.data.user, rememberMe);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível guardar a sessão.';
      throw new Error(msg);
    }

    return body.data as AuthResponse;
  }

  async register(data: RegisterData): Promise<{ user: User }> {
    const response = await fetch(this.authUrl('/register'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify(data),
    });

    const result = await this.parseJson(response);

    if (!response.ok) {
      throw new Error(result?.error || result?.message || 'Erro ao registrar usuário');
    }

    if (!result?.success || !result.data?.user) {
      throw new Error(result?.message || 'Resposta inválida do servidor');
    }

    // Não troca a sessão do admin pelo usuário recém-criado
    return { user: result.data.user };
  }

  async logout(): Promise<void> {
    try {
      await fetch(this.authUrl('/logout'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: 'web' }),
      });
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      this.clearAuth();
    }
  }

  async getProfile(): Promise<User> {
    const response = await fetch(this.authUrl('/me'), {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error('Erro ao buscar perfil');
    }

    const data = await response.json();
    return data.data;
  }

  async updateProfile(profileData: Partial<User>): Promise<User> {
    const response = await fetch(this.authUrl('/profile'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
        Accept: 'application/json',
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
    const response = await fetch(this.authUrl('/change-password'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
        Accept: 'application/json',
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

  setToken(token: string, rememberMe: boolean = true): void {
    // Evita token duplicado nos dois storages
    localStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.tokenKey);
    if (rememberMe) {
      localStorage.setItem(this.tokenKey, token);
    } else {
      sessionStorage.setItem(this.tokenKey, token);
    }
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey) || sessionStorage.getItem(this.tokenKey);
  }

  setUser(user: User, rememberMe: boolean = true): void {
    localStorage.removeItem(this.userKey);
    sessionStorage.removeItem(this.userKey);
    const serialized = JSON.stringify(user);
    if (rememberMe) {
      localStorage.setItem(this.userKey, serialized);
    } else {
      sessionStorage.setItem(this.userKey, serialized);
    }
  }

  getUser(): User | null {
    if (typeof window === 'undefined') return null;
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

// Função para uso no servidor (Next.js) — sessão JWT é client-side hoje
export async function getServerSession(): Promise<User | null> {
  return null;
}
