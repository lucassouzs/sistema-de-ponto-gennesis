/**
 * Cache simples em memória para dados que mudam pouco
 * Ideal para feriados, configurações da empresa, etc.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();

  /**
   * Obtém um valor do cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Define um valor no cache
   * @param key Chave do cache
   * @param data Dados a serem armazenados
   * @param ttlSeconds Tempo de vida em segundos (padrão: 5 minutos)
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }

  /**
   * Remove um valor do cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Limpa todo o cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove entradas expiradas do cache
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }
}

// Instância singleton do cache
export const cache = new SimpleCache();

// Limpar cache expirado a cada 10 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cache.cleanup();
  }, 10 * 60 * 1000);
}

/**
 * Helper para buscar CompanySettings com cache
 */
export async function getCompanySettings(prisma: any) {
  const cacheKey = 'company_settings';
  let settings = cache.get<any>(cacheKey);
  
  if (!settings) {
    settings = await prisma.companySettings.findFirst();
    if (settings) {
      // Cache por 1 hora (configurações raramente mudam)
      cache.set(cacheKey, settings, 3600);
    }
  }
  
  return settings;
}

