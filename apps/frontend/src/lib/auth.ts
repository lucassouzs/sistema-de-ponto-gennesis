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
    this.clearImpersonationMeta();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('impersonation-changed'));
    }
  }

  private impersonationAdminTokenKey = 'impersonationAdminToken';
  private impersonationTargetNameKey = 'impersonationTargetName';

  private clearImpersonationMeta(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(this.impersonationAdminTokenKey);
    sessionStorage.removeItem(this.impersonationTargetNameKey);
  }

  isImpersonating(): boolean {
    if (typeof window === 'undefined') return false;
    return !!sessionStorage.getItem(this.impersonationAdminTokenKey);
  }

  getImpersonationTargetName(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(this.impersonationTargetNameKey);
  }

  async startImpersonation(userId: string): Promise<AuthResponse & { targetName?: string }> {
    const adminToken = this.getToken();
    if (!adminToken) {
      throw new Error('Sessão de administrador não encontrada');
    }

    const response = await fetch(this.authUrl(`/impersonate/${encodeURIComponent(userId)}`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Accept: 'application/json',
      },
    });

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new Error(body?.error || body?.message || 'Erro ao entrar como usuário');
    }
    if (!body?.success || !body.data?.token || !body.data?.user) {
      throw new Error(body?.message || 'Resposta inválida do servidor');
    }

    const targetName =
      (body.data as { impersonation?: { targetName?: string } }).impersonation?.targetName ||
      body.data.user.name ||
      'usuário';

    sessionStorage.setItem(this.impersonationAdminTokenKey, adminToken);
    sessionStorage.setItem(this.impersonationTargetNameKey, targetName);

    // Impersonação fica só na sessão do navegador (aba)
    this.setToken(body.data.token, false);
    this.setUser(body.data.user, false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('impersonation-changed'));
    }

    return { user: body.data.user, token: body.data.token, targetName };
  }

  async stopImpersonation(): Promise<AuthResponse> {
    const response = await fetch(this.authUrl('/stop-impersonation'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        Accept: 'application/json',
      },
    });

    const body = await this.parseJson(response);

    // Preferência: token devolvido pela API; fallback: token admin guardado
    const savedAdminToken = sessionStorage.getItem(this.impersonationAdminTokenKey);

    if (response.ok && body?.success && body.data?.token && body.data?.user) {
      this.clearImpersonationMeta();
      this.setToken(body.data.token, true);
      this.setUser(body.data.user, true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('impersonation-changed'));
      }
      return { user: body.data.user, token: body.data.token };
    }

    if (savedAdminToken) {
      this.clearImpersonationMeta();
      this.setToken(savedAdminToken, true);
      try {
        const user = await this.getProfile();
        this.setUser(user, true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('impersonation-changed'));
        }
        return { user, token: savedAdminToken };
      } catch {
        this.clearAuth();
        throw new Error(body?.error || body?.message || 'Erro ao voltar ao administrador');
      }
    }

    throw new Error(body?.error || body?.message || 'Erro ao encerrar impersonação');
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
