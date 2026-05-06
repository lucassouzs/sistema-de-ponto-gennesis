import dotenv from 'dotenv';
import path from 'path';

// Garantir que .env seja carregado antes de ler process.env (imports são avaliados antes do index)
dotenv.config({ path: path.join(__dirname, '../../.env') });

import axios, { AxiosError } from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export interface FluigDatasetValues {
  content?: {
    values?: Record<string, unknown>[];
    columns?: string[];
  };
  message?: string | null;
}

export interface FluigDatasetStructure {
  content?: {
    datasetId: string;
    fields: Array<{ fieldName: string; dataType: string }>;
    lastReset: number;
    lastUpdate: number;
  };
  message?: string | null;
}

function isRetryableError(err: unknown): boolean {
  const axiosErr = err as AxiosError;
  const status = axiosErr?.response?.status;
  if (status === 404) return true;
  if (status === 500) {
    const data = axiosErr?.response?.data;
    if (data && typeof data === 'object' && 'code' in data) {
      const code = String((data as { code?: string }).code);
      return code.includes('NotFoundException') || code.includes('NotFound');
    }
    return true; // 500 sem detalhes - tentar path alternativo
  }
  return false;
}

/** Paths de API dataset do Fluig. /api/public + /ecm/dataset/ = /api/public/ecm/dataset/ (exige OAuth 1.0) */
const DATASET_BASE_PATHS = [
  '/api/public',       // path que responde; Bearer dá 401, OAuth 1.0 funciona
  '/portal/api/rest',
  '/api/public/2.0',
  '',
  '/webdesk/api/public',
];

export class FluigService {
  private baseUrl: string;
  private datasetBaseUrl: string;
  private datasetBasePaths: string[];
  private workingDatasetBase: string | null = null;
  private oauth: OAuth;
  private token: { key: string; secret: string };

  constructor() {
    const domain = (process.env.FLUIG_BASE_URL || 'https://gennesisengenharia160516.fluig.cloudtotvs.com.br').replace(/\/$/, '');
    const apiPath = process.env.FLUIG_API_PATH || '/portal/api/rest';
    const datasetPath = process.env.FLUIG_DATASET_API_PATH;
    this.baseUrl = domain + apiPath;
    this.datasetBaseUrl = datasetPath ? domain + datasetPath : domain + apiPath;
    if (datasetPath) {
      this.datasetBasePaths = [this.datasetBaseUrl];
    } else {
      this.datasetBasePaths = DATASET_BASE_PATHS.map((p) => (p ? domain + p : domain));
    }
    const consumerKey = process.env.FLUIG_CONSUMER_KEY || '';
    const consumerSecret = process.env.FLUIG_CONSUMER_SECRET || '';
    const accessToken = process.env.FLUIG_ACCESS_TOKEN || '';
    const accessTokenSecret = process.env.FLUIG_ACCESS_TOKEN_SECRET || '';

    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
      console.warn('Fluig: Configure as variáveis OAuth (FLUIG_CONSUMER_KEY, FLUIG_CONSUMER_SECRET, FLUIG_ACCESS_TOKEN, FLUIG_ACCESS_TOKEN_SECRET)');
    }

    this.oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function: (baseString: string, key: string) =>
        crypto.createHmac('sha1', key).update(baseString).digest('base64'),
    });

    this.token = { key: accessToken, secret: accessTokenSecret };
  }

  private getAuthHeaders(url: string, method: string, useOAuth?: boolean): Record<string, string> {
    const hasOAuth = !!(process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN);
    // Importante: não enviar Authorization Bearer.
    // Alguns ambientes Fluig rejeitam Bearer (401) e funcionam apenas via OAuth 1.0.
    // Por isso sempre tentamos apenas OAuth quando disponível.
    if (hasOAuth) {
      const requestData = { url, method };
      const authData = this.oauth.authorize(requestData, this.token);
      return this.oauth.toHeader(authData) as unknown as Record<string, string>;
    }
    return {};
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: { useDatasetBase?: boolean; timeout?: number }
  ): Promise<T> {
    const bases = options?.useDatasetBase !== false
      ? (this.workingDatasetBase ? [this.workingDatasetBase] : this.datasetBasePaths)
      : [this.baseUrl];

    const hasOAuth = !!(process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN);
    let lastErr: unknown;
    for (const base of bases) {
      const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
      // Não tentar Bearer: vai direto para OAuth (quando existir).
      for (const useOAuth of [true] as const) {
        if (useOAuth && !hasOAuth) break;
        const headers = this.getAuthHeaders(url, method, useOAuth);
        const config: {
          method: 'GET' | 'POST';
          url: string;
          headers: Record<string, string>;
          timeout: number;
          data?: unknown;
        } = {
          method,
          url,
          headers: { ...headers, 'Content-Type': 'application/json' },
          timeout: options?.timeout ?? 30000,
        };
        if (body && method === 'POST') config.data = body;

        try {
          const response = await axios.request<T>(config);
          if (options?.useDatasetBase !== false && !this.workingDatasetBase) {
            this.workingDatasetBase = base;
            console.log(`Fluig: Path funcionando: ${base} (auth: OAuth 1.0)`);
          }
          return response.data;
        } catch (err) {
          lastErr = err;
          // Se falhar, tenta o próximo path/base.
          const status = (err as AxiosError)?.response?.status;
          if (isRetryableError(err) && bases.length > 1) {
            console.warn(`Fluig: Falha em ${url} (${status}), tentando próximo path...`);
            break;
          }
          throw err;
        }
      }
    }
    throw lastErr;
  }

  async getAvailableDatasets(): Promise<string[]> {
    const result = await this.request<string[]>('GET', '/ecm/dataset/availableDatasets');
    return Array.isArray(result) ? result : [];
  }

  async getDatasetStructure(datasetId: string): Promise<FluigDatasetStructure> {
    return this.request<FluigDatasetStructure>(
      'GET',
      '/ecm/dataset/datasetStructure/' + encodeURIComponent(datasetId)
    );
  }

  async getDatasetData(
    datasetId: string,
    options?: {
      fields?: string[];
      constraints?: Array<{
        _field: string;
        _initialValue?: string;
        _finalValue?: string;
        _type?: number;
        _likeSearch?: boolean;
      }>;
      order?: string[];
    }
  ): Promise<FluigDatasetValues> {
    const body = {
      name: datasetId,
      fields: options?.fields || [],
      constraints: options?.constraints || [],
      order: options?.order || [],
    };
    const dataTimeout = Number(process.env.FLUIG_DATASET_TIMEOUT_MS) || 120000; // 2 min default
    return this.request<FluigDatasetValues>('POST', '/ecm/dataset/datasets', body, {
      timeout: dataTimeout,
    });
  }

  async searchDataset(
    datasetId: string,
    options?: {
      searchField?: string;
      searchValue?: string;
      filterFields?: string[];
      resultFields?: string[];
      likeField?: string;
      likeValue?: string;
      limit?: number;
      orderBy?: string;
    }
  ): Promise<FluigDatasetValues> {
    const body = {
      datasetId,
      searchField: options?.searchField || '',
      searchValue: options?.searchValue || '',
      filterFields: options?.filterFields || [],
      resultFields: options?.resultFields || [],
      likeField: options?.likeField || '',
      likeValue: options?.likeValue || '',
      limit: String(options?.limit || 100),
      orderBy: options?.orderBy || '',
    };
    const dataTimeout = Number(process.env.FLUIG_DATASET_TIMEOUT_MS) || 120000;
    return this.request<FluigDatasetValues>('POST', '/ecm/dataset/search', body, {
      timeout: dataTimeout,
    });
  }
}
