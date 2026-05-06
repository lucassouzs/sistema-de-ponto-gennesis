import axios, { AxiosInstance } from 'axios';

// ─── Tipos de resposta da API ────────────────────────────────────────────────

interface OrcafascioAuthUser {
  id: string;
  email: string;
  name: string;
  company_name: string;
  company_id: string;
  token_timeout_in_seconds: number;
  /** Setor — com frequência este é o ID usado em `/v1/base/:id/...`. */
  department_id?: string;
  departmentId?: string;
}

interface OrcafascioAuthResponse {
  auth_token: string;
  user: OrcafascioAuthUser;
}

export interface OrcafascioComposicaoListItem {
  id: string;
  company_id: string;
  code: string;
  second_code: string | null;
  description: string;
  type: string;
  unit: string;
  is_sicro: boolean;
  created_at: string;
  group_id?: string;
}

export interface OrcafascioComposicaoItem {
  banco: string;
  code: string;
  description: string;
  type: string;
  unit: string;
  unitary_pnd: number;
  unitary_pd: number;
  coefficient: number;
  pnd: number;
  pd: number;
  is_resource: boolean;
}

export interface OrcafascioComposicaoDetalhe {
  id: string;
  company_id: string;
  user_id: string;
  department_id: string;
  code: string;
  second_code: string | null;
  description: string;
  type: string;
  unit: string;
  is_sicro: boolean;
  labor: boolean;
  calculation_method: { type: number; description: string };
  prices: { pnd: number; pd: number };
  items: OrcafascioComposicaoItem[];
  created_at: string;
}

export interface OrcafascioInsumoListItem {
  id: string;
  company_id: string;
  user_id: string;
  department_id: string;
  code: string;
  second_code: string | null;
  description: string;
  type: number;
  unit: string;
  is_sicro: boolean;
  locals: Record<string, any>;
  status: boolean;
  note: string;
  group_id?: string;
}

export interface OrcafascioListResponse<T> {
  total: number;
  per_page: number;
  current_page: number;
  records: T[];
}

// ─── Serviço ─────────────────────────────────────────────────────────────────

export class OrcafascioService {
  private client: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiry: number | null = null;
  /** ID usado em `/v1/base/:segment/...` (company_id ou override em ORCAFASCIO_BASE_ID). */
  private baseSegment: string | null = null;
  /** login = segmento veio do login; env = ORCAFASCIO_BASE_ID manual (sem fallback). */
  private baseSegmentSource: 'login' | 'env' = 'login';
  /** Último payload de user do login (para fallback de segmento). */
  private lastAuthUser: OrcafascioAuthUser | null = null;
  /** department_id descoberto via /v1/bud/budgets/list */
  private discoveredDepartmentId: string | null = null;
  /** ID que responde 200 em GET /v1/base/:id/groups — é o «mybase» real da documentação */
  private resolvedCompositionBaseId: string | null = null;
  /** IDs Mongo colhidos dos orçamentos (possíveis bases de composição — catálogos locais etc.) */
  private idsExtraidosOrcamentos: string[] = [];
  /** Strings retornadas por GET /v1/bases quando existir */
  private idsDeEndpointBases: string[] = [];
  /** Após novo login cheio — evita novo GET até expirar token */
  private contextoOrcafascioHidratado = false;

  /** Cache curto da lista de segmentos que aceitam GET …/compositions */
  private basesComCatalogoCache: { segments: string[]; expiry: number } | null = null;

  constructor() {
    let baseURL = (process.env.ORCAFASCIO_BASE_URL || 'https://api.orcafascio.com/api').trim();
    baseURL = baseURL.replace(/\/+$/, '');
    // app.orcafascio.com é o site; a API REST fica em api.orcafascio.com
    if (/^https?:\/\/app\.orcafascio\.com/i.test(baseURL)) {
      baseURL = baseURL.replace(/app\.orcafascio\.com/i, 'api.orcafascio.com');
    }
    // Evita .../api/v1 + /v1/... → 404 (docs citam "base .../api/v1" como referência, não como sufixo extra)
    if (baseURL.endsWith('/v1')) {
      baseURL = baseURL.slice(0, -3);
    }
    // Sem Accept: application/json a API costuma devolver HTML 404 em vez de JSON.
    this.client = axios.create({
      baseURL,
      timeout: 90000,
      headers: { Accept: 'application/json' },
    });
  }

  /** Variações aceitas pelo Orçafascio: `Bearer <jwt>` (comum) ou só o JWT (exemplos da doc). */
  private static authorizationVariants(authToken: string): string[] {
    const rawEnv = process.env.ORCAFASCIO_AUTH_RAW?.trim().toLowerCase();
    const t = authToken.trim();
    const jwtBody = /^Bearer\s+/i.test(t) ? t.replace(/^Bearer\s+/i, '').trim() : t;

    if (rawEnv === '1' || rawEnv === 'true' || rawEnv === 'yes' || rawEnv === 'raw') {
      return [jwtBody];
    }
    if (rawEnv === '0' || rawEnv === 'false' || rawEnv === 'no' || rawEnv === 'bearer') {
      return [`Bearer ${jwtBody}`];
    }
    return [`Bearer ${jwtBody}`, jwtBody];
  }

  /**
   * Segmento `/v1/base/:SEGMENT/...` conforme docs (substituem «mybase»).
   * Prioridade: `ORCAFASCIO_BASE_ID` (env, se preenchido) → campo do login definido por
   * `ORCAFASCIO_BASE_FIELD` (company_id, department_id ou user_id; padrão company_id).
   */
  private resolveBaseSegment(response: OrcafascioAuthResponse): string {
    const fromEnv = process.env.ORCAFASCIO_BASE_ID?.trim();
    if (fromEnv) {
      this.baseSegmentSource = 'env';
      return fromEnv;
    }

    this.baseSegmentSource = 'login';
    const field = (process.env.ORCAFASCIO_BASE_FIELD || 'company_id').toLowerCase();
    const u = response.user;

    let segment: string | undefined;
    if (field === 'department_id') {
      segment = u.department_id?.trim();
    } else if (field === 'user_id' || field === 'id') {
      segment = u.id?.trim();
    } else {
      segment = u.company_id?.trim();
    }

    if (!segment) {
      throw new Error(
        `Login Orçafascio não retornou o campo esperado (${field}) para montar /v1/base/:id/. ` +
          'Defina ORCAFASCIO_BASE_ID com o ID exato da sua base ou ajuste ORCAFASCIO_BASE_FIELD ' +
          '(company_id | department_id | user_id).'
      );
    }
    return segment;
  }

  private wrapAxiosError(err: unknown, context: string): Error {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;
      const ct = String(err.response?.headers['content-type'] ?? '');
      const apiMsg =
        data && typeof data === 'object'
          ? (data as any).error || (data as any).message
          : undefined;
      let bodySnippet = '';
      if (typeof data === 'string') {
        bodySnippet =
          data.includes('<!DOCTYPE') || data.includes('<html')
            ? '[resposta HTML da web — use Accept: application/json ou ORCAFASCIO_BASE_URL=https://api.orcafascio.com/api]'
            : data.slice(0, 280);
      } else if (data != null) {
        bodySnippet = JSON.stringify(data).slice(0, 400);
      }
      const suffix =
        apiMsg ??
        (status === 404 ? `Not Found${bodySnippet ? `: ${bodySnippet}` : ''}` : bodySnippet || undefined);
      const isGateway =
        status === 502 ||
        status === 503 ||
        status === 504 ||
        status === 524;
      const gatewayHint = isGateway
        ? ' Servidor/gateway Orçafascio pode estar temporariamente indisponível — tente de novo em alguns minutos.'
        : '';
      const detail = ct.includes('text/html')
        ? `HTTP ${status ?? '?'} — resposta HTML (erro de gateway ou URL incorreta); ORCAFASCIO_BASE_URL deve ser https://api.orcafascio.com/api`
        : `HTTP ${status ?? '?'}${suffix ? ` — ${suffix}` : ''}`;
      return new Error(`${context} (${detail})${gatewayHint}`);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  /** IDs Mongo para `/v1/base/:id/...` — prioridade: department descoberto, depois setor do login, depois empresa/usuário. */
  private orderedSegmentCandidates(primary: string): string[] {
    const isMongo = (s: string) => /^[a-f\d]{24}$/i.test(s.trim());
    const out: string[] = [];
    const add = (v?: unknown) => {
      if (typeof v !== 'string') return;
      const t = v.trim();
      if (!isMongo(t) || out.includes(t)) return;
      out.push(t);
    };

    // 1. department descoberto via /v1/bud/budgets/list (mais confiável)
    add(this.discoveredDepartmentId);

    const u = this.lastAuthUser;
    const raw = u ? (u as unknown as Record<string, unknown>) : null;

    if (u && raw) {
      // 2. department do login (se vier)
      add(u.department_id);
      add(u.departmentId);
      add(raw['department_id']);
      add(raw['departmentId']);
    }

    // 3. segmento principal (company_id por padrão)
    add(primary);

    if (u && raw) {
      // 4. demais IDs
      add(u.company_id);
      add(u.id);
      for (const k of Object.keys(raw)) {
        if (k !== 'id' && !/_id$/i.test(k)) continue;
        add(raw[k]);
      }
    }
    return out;
  }

  private async getJsonWithBaseSegments<T>(
    context: string,
    token: string,
    buildPath: (segment: string) => string,
    axiosConfig?: { params?: Record<string, unknown> }
  ): Promise<T> {
    const tryFallback =
      this.baseSegmentSource === 'login' &&
      String(process.env.ORCAFASCIO_BASE_FALLBACK || '1').trim().toLowerCase() !== '0' &&
      String(process.env.ORCAFASCIO_BASE_FALLBACK || '1').trim().toLowerCase() !== 'false';
    const candidates = tryFallback ? this.orderedSegmentCandidates(this.baseSegment!) : [this.baseSegment!];
    if (!candidates.length) {
      throw new Error('Orçafascio: segmento de base indefinido após login');
    }

    const authModes = OrcafascioService.authorizationVariants(token);
    const retryable = (status?: number) => status === 401 || status === 403 || status === 404;

    let lastErr: unknown;

    for (const seg of candidates) {
      for (const authH of authModes) {
        try {
          const url = buildPath(seg);
          console.log(`[Orçafascio] GET ${this.client.defaults.baseURL}${url} (auth=${authH.startsWith('Bearer') ? 'Bearer' : 'raw'})`);
          const res = await this.client.get<T>(url, {
            headers: { Authorization: authH },
            ...axiosConfig,
          });
          console.log(`[Orçafascio] ✅ ${url} → 200`);
          return res.data;
        } catch (e) {
          lastErr = e;
          const ax = axios.isAxiosError(e);
          const st = ax ? e.response?.status : undefined;
          const bodyPreview = ax && e.response?.data
            ? JSON.stringify(e.response.data).slice(0, 200)
            : '';
          console.log(`[Orçafascio] ❌ ${buildPath(seg)} → HTTP ${st ?? '?'} ${bodyPreview}`);
          if (ax && !e.response) {
            throw this.wrapAxiosError(e, `${context} (base=${seg})`);
          }
          if (!tryFallback || st === undefined || !retryable(st)) {
            throw this.wrapAxiosError(
              e,
              `${context} (base=${seg}, auth=${authH.startsWith('Bearer') ? 'Bearer' : 'token cru'})`
            );
          }
          /* 401/403/404: próxima combinação (outro Authorization ou outro segmento) */
        }
      }
    }
    throw lastErr
      ? this.wrapAxiosError(
          lastErr,
          `${context}. Segmentos tentados (${candidates.length}): ${candidates.join(', ')}. ` +
            'Se tudo retornar 404: verifique no OrçaFascio permissões do usuário da API no módulo Composições e tente ORCAFASCIO_BASE_FIELD=department_id ou ORCAFASCIO_BASE_ID com o ID do setor.'
        )
      : new Error(context);
  }

  private static isMongoLike(s: string): boolean {
    return /^[a-f\d]{24}$/i.test(s.trim());
  }

  /** Coleta IDs tipo Mongo até profundidade controlada — sem limite grande para não sobrecarregar */
  private static coletarIdsMongoVisitado(obj: unknown, para: Set<string>, depth = 0, visited = new Set<unknown>()) {
    if (depth > 18 || para.size >= 120) return;
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      const t = obj.trim();
      if (OrcafascioService.isMongoLike(t)) para.add(t);
      return;
    }
    if (typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);
    if (Array.isArray(obj)) {
      for (const x of obj) OrcafascioService.coletarIdsMongoVisitado(x, para, depth + 1, visited);
      return;
    }
    const rec = obj as Record<string, unknown>;
    for (const v of Object.values(rec)) OrcafascioService.coletarIdsMongoVisitado(v, para, depth + 1, visited);
  }

  /** Tenta ler GET /v1/bases — apenas IDs Mongo para evitar lixo («true», etc.) */
  private static idsMongoDeQualquerJson(payload: unknown): string[] {
    const out = new Set<string>();
    OrcafascioService.coletarIdsMongoVisitado(payload, out);
    return Array.from(out);
  }

  /**
   * Hidrata: orçamentos (department + IDs colhidos), lista de bases opcional — depois tenta resolver o «mybase».
   */
  private async hidratarContextoOrcafascio(token: string): Promise<void> {
    if (this.contextoOrcafascioHidratado) return;
    const authModes = OrcafascioService.authorizationVariants(token);
    let ultimoOrcErro = '';

    this.idsExtraidosOrcamentos = [];
    this.idsDeEndpointBases = [];

    for (const authH of authModes) {
      try {
        const res = await this.client.get<{ budgets?: Record<string, unknown>[] }>(
          '/v1/bud/budgets/list',
          { headers: { Authorization: authH }, params: { page: 1 } }
        );
        const lista = Array.isArray(res.data?.budgets) ? res.data!.budgets! : [];
        if (lista[0]?.department_id != null && typeof lista[0].department_id === 'string') {
          const d = (lista[0].department_id as string).trim();
          if (OrcafascioService.isMongoLike(d)) {
            this.discoveredDepartmentId = d;
          }
        }
        const extra = new Set<string>();
        for (const bud of lista.slice(0, 30)) OrcafascioService.coletarIdsMongoVisitado(bud, extra);
        this.idsExtraidosOrcamentos = Array.from(extra).filter((id) => id !== this.discoveredDepartmentId);
        if (this.discoveredDepartmentId) {
          console.log(`[Orçafascio] department_id dos orçamentos: ${this.discoveredDepartmentId}`);
        }
      } catch (e) {
        ultimoOrcErro = axios.isAxiosError(e)
          ? `orçamentos HTTP ${e.response?.status ?? '?'}`
          : 'orçamentos falhou';
      }

      try {
        const bases = await this.client.get('/v1/bases', {
          headers: { Authorization: authH },
          params: { page: 1 },
        });
        this.idsDeEndpointBases = OrcafascioService.idsMongoDeQualquerJson(bases.data);
        if (this.idsDeEndpointBases.length) {
          console.log(`[Orçafascio] /v1/bases: ${this.idsDeEndpointBases.slice(0, 8).join(', ')}${this.idsDeEndpointBases.length > 8 ? '…' : ''}`);
        }
      } catch {
        /* comum nem existir o endpoint conforme conta */
      }
      break;
    }

    await this.probeEResolverSegmentoCompositionBase(token);
    this.contextoOrcafascioHidratado = true;
    if (ultimoOrcErro) console.log(`[Orçafascio] Aviso: ${ultimoOrcErro}`);
    if (this.resolvedCompositionBaseId) {
      console.log(`[Orçafascio] Base resolveida para rotas /v1/base/*/… → ${this.resolvedCompositionBaseId}`);
    }
  }

  /**
   * Descobre se `segmento` é o `{mybase}` real: primeiro GET .../groups (doc), depois .../compositions.
   */
  private async probeBaseAceita(token: string, segmento: string): Promise<boolean> {
    const authModes = OrcafascioService.authorizationVariants(token);
    const tentar = async (path: string, params?: Record<string, unknown>) => {
      for (const authH of authModes) {
        try {
          await this.client.get(path, { headers: { Authorization: authH }, params });
          return true;
        } catch (e) {
          const st = axios.isAxiosError(e) ? e.response?.status : undefined;
          if (st === 403) return false;
        }
      }
      return false;
    };

    const b = encodeURIComponent(segmento);
    if (await tentar(`/v1/base/${b}/groups`, { page: 1 })) return true;
    if (await tentar(`/v1/base/${b}/compositions`, { page: 1 })) return true;
    return false;
  }

  private candidatosSegmentoCompBase(primary: string): string[] {
    const extraEnv = process.env.ORCAFASCIO_COMPOSITION_BASE_EXTRA?.trim();
    const deEnv = extraEnv?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];

    const out: string[] = [];
    const add = (s?: unknown) => {
      if (typeof s !== 'string') return;
      const t = s.trim();
      if (!t) return;
      /** slug curto só se parecer slug de base BR; evita «undefined» ou ruídos */
      const slugOk =
        OrcafascioService.isMongoLike(t) ||
        /^(sinapi|sicro\d*|sicromg|sicromgf)(_[a-z0-9_-]+)?$/i.test(t) ||
        /^mybase$/i.test(t);
      if (!slugOk && t.length < 4) return;
      if (!slugOk && !OrcafascioService.isMongoLike(t)) return;
      if (out.includes(t)) return;
      out.push(t);
    };

    const baseIdManual = process.env.ORCAFASCIO_BASE_ID?.trim();

    /** ordem fixa solicitada pela documentação típica: extra → .env → catálogo / orçamentos → login */
    for (const x of deEnv) add(x);
    if (baseIdManual) add(baseIdManual);

    for (const x of this.idsDeEndpointBases) add(x);
    for (const x of this.idsExtraidosOrcamentos) add(x);

    add(this.discoveredDepartmentId);
    add(primary);
    for (const id of this.orderedSegmentCandidates(primary)) add(id);

    /** Slugs de bases de referência comuns — útil quando empresa usa catálogo padrão */
    const literais = [
      'sinapi',
      'sicro',
      'sicro3',
      'sicromg',
      'sicromgf',
      'sinapi_sv22',
      'sinapi_sv23',
      'sinapi_sv24',
      'orse',
      'mybase',
    ];
    for (const slug of literais) add(slug);

    return out;
  }

  /**
   * Ordens de tentativa para find_by_code: bases oficiais (SICRO3/SINAPI etc.) primeiro,
   * pois o site «Composições» usa essas bases — a base resolvida por setor pode ser outro catálogo.
   */
  private candidatosParaBuscaPorCodigo(): string[] {
    const primary = this.baseSegment ?? this.lastAuthUser?.company_id ?? '';
    const todos = this.candidatosSegmentoCompBase(primary);
    const resolved = this.resolvedCompositionBaseId;
    const prioridade = [
      'sicro3',
      'sicro',
      'sinapi',
      'sicromg',
      'sicromgf',
      'sinapi_sv22',
      'sinapi_sv23',
      'sinapi_sv24',
    ];
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (s?: string | null) => {
      if (!s || typeof s !== 'string') return;
      const t = s.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (const p of prioridade) add(p);
    if (resolved) add(resolved);
    for (const t of todos) add(t);
    return out;
  }

  /** Descobre um segmento válido para `/v1/base/:SEGMENT/` (composição, grupo, recurso…) */
  private async probeEResolverSegmentoCompositionBase(token: string): Promise<void> {
    const primary =
      this.baseSegment ?? this.lastAuthUser?.company_id ?? '';

    const candidatos = this.candidatosSegmentoCompBase(primary);
    for (const seg of candidatos) {
      if (await this.probeBaseAceita(token, seg)) {
        this.resolvedCompositionBaseId = seg;
        return;
      }
    }
    this.resolvedCompositionBaseId = null;
  }

  private async authenticate(): Promise<{ token: string; baseSegment: string }> {
    const now = Date.now();
    if (this.authToken && this.tokenExpiry && now < this.tokenExpiry && this.baseSegment) {
      await this.hidratarContextoOrcafascio(this.authToken);
      return { token: this.authToken, baseSegment: this.baseSegment };
    }

    /** Novo ciclo de login — reseta dados derivados até obter novo token */
    this.contextoOrcafascioHidratado = false;
    this.discoveredDepartmentId = null;
    this.resolvedCompositionBaseId = null;
    this.idsExtraidosOrcamentos = [];
    this.idsDeEndpointBases = [];
    this.basesComCatalogoCache = null;

    const email = process.env.ORCAFASCIO_EMAIL;
    const secret_token = process.env.ORCAFASCIO_SECRET_TOKEN;

    if (!email || !secret_token) {
      throw new Error(
        'Credenciais do Orçafascio não configuradas. ' +
          'Defina ORCAFASCIO_EMAIL e ORCAFASCIO_SECRET_TOKEN no arquivo .env'
      );
    }

    let response: { data: OrcafascioAuthResponse } | undefined;
    const maxLoginAttempts = Math.min(
      4,
      Math.max(1, parseInt(process.env.ORCAFASCIO_LOGIN_RETRIES || '3', 10) || 3)
    );
    for (let attempt = 1; attempt <= maxLoginAttempts; attempt++) {
      try {
        response = await this.client.post<OrcafascioAuthResponse>('/v1/login/authenticate_user', {
          email,
          secret_token,
        });
        break;
      } catch (e) {
        const st = axios.isAxiosError(e) ? e.response?.status : undefined;
        const noResponse = axios.isAxiosError(e) && !e.response;
        const retryable =
          noResponse || st === 502 || st === 503 || st === 504 || st === 524 || st === 408;
        if (!retryable || attempt === maxLoginAttempts) {
          throw this.wrapAxiosError(e, 'Falha no login Orçafascio');
        }
        const delayMs = 800 * attempt;
        console.warn(
          `[Orçafascio] Login HTTP ${st ?? '???'} (tentativa ${attempt}/${maxLoginAttempts}); nova tentativa em ${delayMs}ms…`
        );
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      }
    }
    if (!response) {
      throw new Error('Falha no login Orçafascio (sem resposta após retentativas)');
    }

    this.authToken = response.data.auth_token;
    this.lastAuthUser = response.data.user;
    this.baseSegment = this.resolveBaseSegment(response.data);
    this.tokenExpiry = now + 23 * 60 * 60 * 1000;

    console.log('[Orçafascio] Login OK. User:', JSON.stringify(response.data.user));
    console.log(`[Orçafascio] Segmento inicial (login): ${this.baseSegment}`);

    await this.hidratarContextoOrcafascio(this.authToken);

    return { token: this.authToken, baseSegment: this.baseSegment };
  }

  // ── Diagnóstico ────────────────────────────────────────────────────────────

  /** Retorna o resultado bruto do login + sonda vários endpoints para diagnóstico. */
  async diagnosticar(): Promise<Record<string, unknown>> {
    const { token } = await this.authenticate();
    const authH = OrcafascioService.authorizationVariants(token)[0];
    const seg = this.discoveredDepartmentId ?? this.baseSegment!;
    const comp = this.lastAuthUser?.company_id ?? this.baseSegment!;
    const user = this.lastAuthUser;

    const probe = async (path: string, params?: Record<string, unknown>) => {
      try {
        const res = await this.client.get(path, { headers: { Authorization: authH }, params });
        return { ok: true, status: 200, data: res.data };
      } catch (e) {
        return {
          ok: false,
          status: axios.isAxiosError(e) ? e.response?.status : null,
          data: axios.isAxiosError(e) ? e.response?.data : String(e),
        };
      }
    };

    const [budgets, bases, basesSeg, basesComp, groupsSeg, groupsComp, composicoesSeg, composicoesComp] =
      await Promise.all([
        probe('/v1/bud/budgets/list', { page: 1 }),
        probe('/v1/bases'),
        probe(`/v1/base/${seg}`),
        probe(`/v1/base/${comp}`),
        probe(`/v1/base/${seg}/groups`),
        probe(`/v1/base/${comp}/groups`),
        probe(`/v1/base/${seg}/compositions`, { page: 1 }),
        probe(`/v1/base/${comp}/compositions`, { page: 1 }),
      ]);

    return {
      user,
      baseSegment: this.baseSegment,
      discoveredDepartmentId: this.discoveredDepartmentId,
      resolvedCompositionBaseId: this.resolvedCompositionBaseId,
      candidatosCompositionBase: this.candidatosSegmentoCompBase(this.baseSegment ?? ''),
      candidatosFallbackLogin: this.orderedSegmentCandidates(this.baseSegment ?? ''),
      idsExtraidosOrcamentos: this.idsExtraidosOrcamentos.slice(0, 40),
      idsDeEndpointBases: this.idsDeEndpointBases,
      sondas: {
        'GET /v1/bud/budgets/list': budgets,
        'GET /v1/bases': bases,
        [`GET /v1/base/${seg}`]: basesSeg,
        [`GET /v1/base/${comp}`]: basesComp,
        [`GET /v1/base/${seg}/groups`]: groupsSeg,
        [`GET /v1/base/${comp}/groups`]: groupsComp,
        [`GET /v1/base/${seg}/compositions`]: composicoesSeg,
        [`GET /v1/base/${comp}/compositions`]: composicoesComp,
      },
    };
  }

  /**
   * Tenta GET em múltiplos paths (com ou sem segmento base) até obter 200.
   * Útil para descobrir o padrão correto sem depender só de documentação.
   */
  private async getJsonMultiPath<T>(
    context: string,
    token: string,
    paths: string[],
    params?: Record<string, unknown>
  ): Promise<T> {
    const authModes = OrcafascioService.authorizationVariants(token);
    let lastErr: unknown;
    for (const path of paths) {
      for (const authH of authModes) {
        try {
          console.log(`[Orçafascio] Tentando GET ${this.client.defaults.baseURL}${path}`);
          const res = await this.client.get<T>(path, {
            headers: { Authorization: authH },
            params,
          });
          console.log(`[Orçafascio] ✅ ${path} → 200`);
          return res.data;
        } catch (e) {
          lastErr = e;
          const st = axios.isAxiosError(e) ? e.response?.status : undefined;
          const body = axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? '').slice(0, 150) : '';
          console.log(`[Orçafascio] ❌ ${path} → HTTP ${st ?? '?'} ${body}`);
          /* continua tentando próximo path/auth */
        }
      }
    }
    throw lastErr
      ? this.wrapAxiosError(lastErr, `${context}. Paths tentados: ${paths.join(', ')}`)
      : new Error(context);
  }

  // ── Composições ────────────────────────────────────────────────────────────

  private mensagemBaseNaoResolvida(): Error {
    return new Error(
      'Orçafascio: não foi possível identificar a base de composições (`/v1/base/{mybase}/…`). ' +
        'No Apidog, «mybase» não é o ID da empresa nem o setor do orçamento — é o identificador da base de catálogo ' +
        '(ex.: SINAPI/SICRO) ativa na sua conta. Teste no Apidog GET `/v1/base/<id>/groups` ou `/compositions` até obter 200 ' +
        'e defina `ORCAFASCIO_BASE_ID=<id>` no `.env`, ou `ORCAFASCIO_COMPOSITION_BASE_EXTRA=id1,id2`. ' +
        'Confirme permissões do usuário da API no módulo Composições. GET `/api/orcafascio/diagnostico` lista candidatos testados.'
    );
  }

  private garantirResolvedCompositionBase(): string {
    if (this.resolvedCompositionBaseId) return this.resolvedCompositionBaseId;
    throw this.mensagemBaseNaoResolvida();
  }

  /**
   * Catálogo ORSE no import do orçamento — slug `orse` ou ID Mongo (`ORCAFASCIO_ORSE_SEGMENT`).
   */
  private segmentCatalogoOrse(): string {
    return process.env.ORCAFASCIO_ORSE_SEGMENT?.trim() || 'orse';
  }

  /**
   * Slugs / env para `GET /v1/base/{seg}/compositions`.
   * Na prática o site usa `/banco/orse/…`, mas **a REST pode não ter** `/v1/base/orse` (404) — segmento real pode ser um MongoID.
   */
  private segmentosRestSlugOrse(): string[] {
    const out: string[] = [];
    const add = (s?: string | null) => {
      const t = typeof s === 'string' ? s.trim() : '';
      if (!t || out.includes(t)) return;
      out.push(t);
    };
    const envSeg = process.env.ORCAFASCIO_ORSE_SEGMENT?.trim();
    if (envSeg) add(envSeg);
    if (!envSeg || envSeg.toLowerCase() !== 'orse') add('orse');
    if (!envSeg || envSeg !== 'ORSE') add('ORSE');
    return out;
  }

  /** Catálogo genérico «Oficiais» (mistura várias tabelas ~1966). */
  private segmentosFallbackCatalogoMisto(): string[] {
    const out: string[] = [];
    const add = (s?: string | null) => {
      const t = typeof s === 'string' ? s.trim() : '';
      if (!t || out.includes(t)) return;
      out.push(t);
    };
    add(this.resolvedCompositionBaseId);
    add('mybase');
    return out;
  }

  /** Ordem única para find_by_code / busca em listagem paginada: REST slug primeiro, depois misto. */
  private segmentosComposicaoOrsePrioridade(): string[] {
    return [...this.segmentosRestSlugOrse(), ...this.segmentosFallbackCatalogoMisto()];
  }

  /** Default ligado: se `/orse` der 404 na REST, usa mybase para não quebrar o modal (`ORCAFASCIO_ORSE_FALLBACK_MYBASE_ON_404=0` para desligar). */
  private orseFallbackMistoApos404Rest(): boolean {
    const v = String(process.env.ORCAFASCIO_ORSE_FALLBACK_MYBASE_ON_404 ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
  }

  /** True quando a listagem veio do catálogo genérico (mistura tabelas), não do segmento ORSE dedicado. */
  private segmentoEhFallbackCatalogoMisto(segment: string): boolean {
    const envSeg = process.env.ORCAFASCIO_ORSE_SEGMENT?.trim();
    const segLc = segment.toLowerCase();
    const dedicado =
      (!!envSeg && segment === envSeg) ||
      segLc === 'orse';
    if (dedicado) return false;
    return segment === 'mybase' || (!!this.resolvedCompositionBaseId && segment === this.resolvedCompositionBaseId);
  }

  /** UF padrão para `find_by_code` no catálogo ORSE (ex.: Sergipe). */
  private estadoPadraoOrse(): string {
    return process.env.ORCAFASCIO_ORSE_STATE?.trim() || 'SE';
  }

  /** Gera variações tolerantes do código para lookup por código/listagem. */
  private variantesCodigoBusca(raw: string): string[] {
    const base = String(raw ?? '').trim();
    if (!base) return [];
    const out: string[] = [];
    const add = (v?: string | null) => {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t || out.includes(t)) return;
      out.push(t);
    };
    const semPrefixo = base.replace(/^(os|orc|orcamento|orçamento)\s+/i, '');
    const semEspaco = semPrefixo.replace(/\s+/g, '');
    const apenasDigitos = semPrefixo.replace(/[^\d]/g, '');
    add(base);
    add(semPrefixo);
    add(semEspaco);
    add(apenasDigitos.length >= 5 ? apenasDigitos : null);
    return out;
  }

  /**
   * Quando `find_by_code` retorna 404 em todos os segmentos (slug «orse» nem sempre existe na API),
   * localiza o código em GET …/compositions (várias páginas) e abre o detalhe por ID.
   */
  private async buscarComposicaoPorCodigoViaListagem(
    token: string,
    codeNorm: string
  ): Promise<OrcafascioComposicaoDetalhe> {
    const variantes = this.variantesCodigoBusca(codeNorm);
    const digitsSet = new Set(
      variantes
        .map((v) => v.replace(/[^\d]/g, ''))
        .filter((v) => v.length >= 5)
    );
    const segments = this.segmentosComposicaoOrsePrioridade();
    const maxPages = Math.min(
      150,
      Math.max(15, parseInt(process.env.ORCAFASCIO_CODE_LOOKUP_MAX_PAGES || '90', 10) || 90)
    );

    for (const seg of segments) {
      for (let page = 1; page <= maxPages; page++) {
        let data: OrcafascioListResponse<OrcafascioComposicaoListItem>;
        try {
          data = await this.listarComposicoesParaSegmento(token, seg, page, codeNorm);
        } catch {
          break;
        }
        const hit = data.records.find((r) => {
          const rc = String(r.code ?? '').trim();
          if (!rc) return false;
          if (variantes.includes(rc)) return true;
          const rcDigits = rc.replace(/[^\d]/g, '');
          return rcDigits.length >= 5 && digitsSet.has(rcDigits);
        });
        if (hit) {
          console.log(
            `[Orçafascio] Código ${codeNorm} resolvido pela listagem (base=${seg}, página ${page}, hit=${hit.code})`
          );
          return this.buscarComposicaoPorId(hit.id, seg);
        }
        const perPage = Math.max(1, data.per_page || 15);
        const total = data.total ?? 0;
        if (total > 0 && page * perPage >= total) break;
        if (data.records.length === 0 && page > 2) break;
      }
    }

    throw new Error(
      `Orçafascio: composição com código «${codeNorm}» não encontrada após buscar em ${segments.join(', ')}. ` +
        'No site o catálogo ORSE pode estar ligado a outro segmento — defina ORCAFASCIO_ORSE_SEGMENT com o ID da base (DevTools → rede ao filtrar ORSE).'
    );
  }

  /**
   * Ordem de sondagem para catálogo: primeiro o que já sabemos que resolve listagem (`resolved`),
   * depois .env e o restante — evita `slice(0,25)` cortar a única base válida (ela pode estar na posição 26+).
   */
  private ordenarCandidatosProbeCatalogo(primary: string): { merged: string[]; limiteProbe: number } {
    const raw = [...new Set(this.candidatosSegmentoCompBase(primary))];
    const priority: string[] = [];
    const addP = (s?: string | null) => {
      const t = typeof s === 'string' ? s.trim() : '';
      if (!t || priority.includes(t)) return;
      priority.push(t);
    };
    addP(process.env.ORCAFASCIO_BASE_ID?.trim());
    for (const x of process.env.ORCAFASCIO_COMPOSITION_BASE_EXTRA?.split(',').map((x) => x.trim()).filter(Boolean) ?? []) {
      addP(x);
    }
    addP(this.resolvedCompositionBaseId);
    addP(this.baseSegment ?? undefined);
    addP(this.discoveredDepartmentId);

    const merged = [...priority, ...raw.filter((s) => !priority.includes(s))];
    const max = Math.min(
      60,
      Math.max(5, parseInt(process.env.ORCAFASCIO_PROBE_BASES_MAX || '40', 10) || 40)
    );
    /** Nunca truncar antes de incluir toda a lista prioritária */
    const limiteProbe = Math.max(max, priority.length);
    return { merged, limiteProbe };
  }

  /**
   * Segmentos em que GET …/compositions responde (slugs SINAPI/SICRO, IDs Mongo da conta, etc.).
   * Não existe endpoint único «global» na API — isto é o máximo que dá para agregar com o token.
   */
  async obterBasesComCatalogo(): Promise<string[]> {
    const now = Date.now();
    /** Lista vazia não fica 5 min «presa» no cache (ex.: rede falhou uma vez). */
    if (
      this.basesComCatalogoCache &&
      this.basesComCatalogoCache.expiry > now &&
      this.basesComCatalogoCache.segments.length > 0
    ) {
      return this.basesComCatalogoCache.segments;
    }
    const { token } = await this.authenticate();
    const primary = this.baseSegment ?? this.lastAuthUser?.company_id ?? '';
    const { merged, limiteProbe } = this.ordenarCandidatosProbeCatalogo(primary);
    const candidatos = merged.slice(0, limiteProbe);
    const ok: string[] = [];
    for (const seg of candidatos) {
      try {
        if (await this.probeBaseAceita(token, seg)) ok.push(seg);
      } catch {
        /* ignora */
      }
    }
    if (ok.length > 0) {
      this.basesComCatalogoCache = { segments: ok, expiry: now + 5 * 60 * 1000 };
    } else {
      this.basesComCatalogoCache = null;
    }
    console.log(`[Orçafascio] Bases com catálogo acessível (${ok.length}): ${ok.join(', ')}`);
    return ok;
  }

  private montarParamsListagemComposicoes(page: number, search?: string): Record<string, unknown> {
    const params: Record<string, unknown> = { page };
    if (search?.trim()) {
      const s = search.trim();
      params.search = s;
      params.description = s;
      params.q = s;
      if (/^\d+$/.test(s)) {
        params.code = s;
      }
    }
    return params;
  }

  private async listarComposicoesParaSegmento(
    token: string,
    segment: string,
    page: number,
    search?: string
  ): Promise<OrcafascioListResponse<OrcafascioComposicaoListItem>> {
    const b = encodeURIComponent(segment);
    const params = this.montarParamsListagemComposicoes(page, search);
    return this.getJsonMultiPath<OrcafascioListResponse<OrcafascioComposicaoListItem>>(
      'Listar composições',
      token,
      [`/v1/base/${b}/compositions`],
      params
    );
  }

  /**
   * Uma página por base, resultados concatenados (cada registro ganha __orcafascio_base).
   */
  private async listarComposicoesAgregado(
    page: number,
    search?: string
  ): Promise<
    OrcafascioListResponse<OrcafascioComposicaoListItem & { __orcafascio_base?: string }> & {
      _aggregated: true;
      _bases: Array<{ segment: string; total: number }>;
      _aggregated_page_limit: number;
    }
  > {
    const { token } = await this.authenticate();
    let segments = await this.obterBasesComCatalogo();
    /** Último recurso: a base já usada na listagem «automática» pode falhar na sonda isolada mas responder em GET …/compositions. */
    if (!segments.length && this.resolvedCompositionBaseId) {
      try {
        await this.listarComposicoesParaSegmento(token, this.resolvedCompositionBaseId, 1, search);
        segments = [this.resolvedCompositionBaseId];
      } catch {
        /* mantém vazio */
      }
    }
    if (!segments.length) {
      throw new Error(
        'Orçafascio: nenhuma base com GET /compositions acessível para este token. Verifique permissões e ORCAFASCIO_COMPOSITION_BASE_EXTRA ou ORCAFASCIO_BASE_ID com o ID da base de composições da conta.'
      );
    }
    type Row = OrcafascioComposicaoListItem & { __orcafascio_base?: string };
    const chunks: Array<{ seg: string; data: OrcafascioListResponse<OrcafascioComposicaoListItem> }> = [];
    await Promise.all(
      segments.map(async seg => {
        try {
          const data = await this.listarComposicoesParaSegmento(token, seg, page, search);
          chunks.push({ seg, data });
        } catch (e) {
          console.warn(`[Orçafascio] Agregado: base ${seg} ignorada`, e);
        }
      })
    );
    chunks.sort((a, b) => a.seg.localeCompare(b.seg));
    const records: Row[] = [];
    let totalSum = 0;
    let maxPageAcrossBases = 1;
    const _bases: Array<{ segment: string; total: number }> = [];
    for (const { seg, data } of chunks) {
      totalSum += data.total;
      _bases.push({ segment: seg, total: data.total });
      const pp = Math.max(1, data.per_page || 15);
      const pages = Math.max(1, Math.ceil(data.total / pp));
      maxPageAcrossBases = Math.max(maxPageAcrossBases, pages);
      for (const r of data.records) {
        records.push({ ...r, __orcafascio_base: seg });
      }
    }
    return {
      total: totalSum,
      per_page: records.length,
      current_page: page,
      records,
      _aggregated: true,
      _bases,
      /** Maior número de páginas entre as bases (cada base usa o mesmo `page` na agregação). */
      _aggregated_page_limit: maxPageAcrossBases,
    };
  }

  /**
   * Listagem do modal de importação: catálogo ORSE — tenta segmentos em ordem até um responder.
   * O parâmetro `baseOpt` é ignorado — mantido só por compatibilidade de query string.
   */
  async listarComposicoes(
    page = 1,
    search?: string,
    _baseOpt?: string
  ): Promise<
    OrcafascioListResponse<OrcafascioComposicaoListItem & { __orcafascio_base?: string }> & {
      _aggregated?: boolean;
      _bases?: Array<{ segment: string; total: number }>;
      _aggregated_page_limit?: number;
      _orcafascio_segment?: string;
      _orcafascio_mix_fallback?: boolean;
      /** true quando os slugs «orse» falharam na REST (404) e usamos mybase/resolved. */
      _orcafascio_rest_orse_404?: boolean;
    }
  > {
    const { token } = await this.authenticate();

    let lastSlugErr: unknown;
    for (const segment of this.segmentosRestSlugOrse()) {
      try {
        const data = await this.listarComposicoesParaSegmento(token, segment, page, search);
        const mix = this.segmentoEhFallbackCatalogoMisto(segment);
        console.log(
          `[Orçafascio] Listagem composições → segmento efetivo=${segment} total=${data.total}${mix ? ' (fallback misto)' : ''}`
        );
        return {
          ...data,
          _orcafascio_segment: segment,
          _orcafascio_mix_fallback: mix,
          _orcafascio_rest_orse_404: false,
        };
      } catch (e) {
        lastSlugErr = e;
        console.warn(`[Orçafascio] Listagem composições falhou em base=${segment}; próximo candidato…`);
      }
    }

    if (!this.orseFallbackMistoApos404Rest()) {
      if (lastSlugErr instanceof Error) {
        throw new Error(
          `${lastSlugErr.message} A REST não expôs /v1/base/orse|ORSE/compositions — obtenha o ID Mongo correto em ORCAFASCIO_ORSE_SEGMENT ou defina ORCAFASCIO_ORSE_FALLBACK_MYBASE_ON_404=1.`
        );
      }
      throw new Error(
        'Orçafascio: não foi possível listar em segmentos ORSE (REST). Defina ORCAFASCIO_ORSE_FALLBACK_MYBASE_ON_404=1 para usar catálogo agregado temporariamente.'
      );
    }

    let lastMixErr: unknown;
    for (const segment of this.segmentosFallbackCatalogoMisto()) {
      try {
        const data = await this.listarComposicoesParaSegmento(token, segment, page, search);
        console.warn(
          `[Orçafascio] REST sem rota /orse — usando catálogo agregado segmento=${segment} total=${data.total}. ` +
            'Obtenha um ID Mongo válido em ORCAFASCIO_ORSE_SEGMENT (suporte Orçafascio ou GET /api/orcafascio/diagnostico).'
        );
        return {
          ...data,
          _orcafascio_segment: segment,
          _orcafascio_mix_fallback: true,
          _orcafascio_rest_orse_404: true,
        };
      } catch (e) {
        lastMixErr = e;
        console.warn(`[Orçafascio] Listagem composições falhou em fallback base=${segment}; próximo…`);
      }
    }

    const lastErr = lastMixErr ?? lastSlugErr;
    if (lastErr instanceof Error) {
      throw new Error(`${lastErr.message}`);
    }
    throw new Error('Orçafascio: não foi possível listar composições em nenhum segmento.');
  }

  async buscarComposicaoPorCodigo(
    code: string,
    state?: string
  ): Promise<OrcafascioComposicaoDetalhe> {
    const rawCode = String(code).trim();
    if (!rawCode) {
      throw new Error('Orçafascio: código da composição vazio.');
    }
    const variantesCodigo = this.variantesCodigoBusca(rawCode);
    if (!variantesCodigo.length) {
      throw new Error('Orçafascio: código da composição inválido.');
    }
    const { token } = await this.authenticate();
    const ufPreferida = state?.trim() || this.estadoPadraoOrse();
    /** Muitos catálogos «Oficiais» usam SP como UF de referência mesmo para ORSE no front */
    const ufs = [...new Set([ufPreferida, 'SP', 'SE'])];
    const segments = this.segmentosComposicaoOrsePrioridade();
    const authModes = OrcafascioService.authorizationVariants(token);
    let lastErr: unknown;

    for (const segment of segments) {
      const path = `/v1/base/${encodeURIComponent(segment)}/compositions/find_by_code`;
      for (const codeTry of variantesCodigo) {
        for (const st of ufs) {
          for (const authH of authModes) {
            try {
              console.log(`[Orçafascio] find_by_code base=${segment} state=${st} code=${codeTry}`);
              const res = await this.client.get<OrcafascioComposicaoDetalhe>(path, {
                headers: { Authorization: authH },
                params: { code: codeTry, state: st },
              });
              return res.data;
            } catch (e) {
              lastErr = e;
              const stHttp = axios.isAxiosError(e) ? e.response?.status : undefined;
              if (stHttp === 404 || stHttp === 403) continue;
              if (axios.isAxiosError(e) && !e.response) throw this.wrapAxiosError(e, 'Composição por código');
            }
          }
        }
      }
    }

    console.warn('[Orçafascio] find_by_code sem sucesso em todos segmentos/UFs — fallback listagem paginada');
    try {
      return await this.buscarComposicaoPorCodigoViaListagem(token, rawCode);
    } catch (eList) {
      if (lastErr && axios.isAxiosError(lastErr) && (lastErr.response?.status ?? 0) >= 500) {
        throw this.wrapAxiosError(lastErr, 'Composição por código');
      }
      throw eList instanceof Error ? eList : new Error(String(eList));
    }
  }

  async buscarComposicaoPorId(composicaoId: string, baseSegment?: string): Promise<OrcafascioComposicaoDetalhe> {
    const { token } = await this.authenticate();
    const base =
      baseSegment?.trim() && baseSegment.trim().length > 0
        ? baseSegment.trim()
        : this.segmentCatalogoOrse();
    const b = encodeURIComponent(base);
    return this.getJsonMultiPath<OrcafascioComposicaoDetalhe>(
      'Composição por id',
      token,
      [`/v1/base/${b}/compositions/${encodeURIComponent(composicaoId)}`]
    );
  }

  // ── Orçamentos ─────────────────────────────────────────────────────────────

  async listarOrcamentos(
    page = 1,
    orderType?: string,
    orderName?: string,
    perPage?: number,
    search?: string
  ): Promise<{ budgets: Record<string, unknown>[]; total?: number; current_page?: number; per_page?: number }> {
    const { token } = await this.authenticate();
    const authModes = OrcafascioService.authorizationVariants(token);
    const params: Record<string, unknown> = { page };
    if (orderType) params.order_type = orderType;
    if (orderName) params.order_name = orderName;
    if (perPage && Number.isFinite(perPage) && perPage > 0) params.per_page = Math.min(5000, perPage);
    if (search?.trim()) params.search = search.trim();

    let lastErr: unknown;
    for (const authH of authModes) {
      try {
        const res = await this.client.get<{ budgets: Record<string, unknown>[] }>(
          '/v1/bud/budgets/list',
          { headers: { Authorization: authH }, params }
        );
        const raw = res.data ?? {};
        const budgets = Array.isArray((raw as any).budgets)
          ? (raw as any).budgets
          : Array.isArray(raw)
            ? raw
            : [];
        return {
          budgets,
          total: (raw as any).total,
          current_page: (raw as any).current_page ?? page,
          per_page: (raw as any).per_page,
        };
      } catch (e) {
        lastErr = e;
        const st = axios.isAxiosError(e) ? e.response?.status : undefined;
        if (st === 401 || st === 403) continue;
        throw this.wrapAxiosError(e, 'Listar orçamentos Orçafascio');
      }
    }
    throw lastErr
      ? this.wrapAxiosError(lastErr, 'Listar orçamentos Orçafascio (todas as variantes de auth falharam)')
      : new Error('Orçafascio: falha ao listar orçamentos');
  }


  /** Junta todas as listas “linhas de orçamento” no mesmo objeto (várias chaves podem coexistir na API). */
  private coletarArraysRelatorioNoObjeto(o: Record<string, unknown>): unknown[] {
    const chaves = [
      'records',
      'items',
      'rows',
      'list',
      'compositions',
      'services',
      'budget_items',
      'budget_items_services',
      'budget_lines',
      'synthetic',
      'lines',
      'budget_services',
      'analytical',
      'analytical_with_unit_price',
      'results',
      'children',
      'chapters',
      'works',
    ];
    const out: unknown[] = [];
    for (const k of chaves) {
      const v = o[k];
      if (!Array.isArray(v) || v.length === 0) continue;
      const first = v[0];
      if (first !== null && typeof first === 'object' && !Array.isArray(first)) out.push(...v);
    }
    return out;
  }

  /**
   * Resposta pode ser array direto ou objeto com listas em chaves típicas; às vezes tudo está em data → budget → …
   */
  private extrairArrayDeRelatorioOrcamento(payload: unknown, depth = 0): unknown[] {
    if (payload == null || depth > 8) return [];
    if (Array.isArray(payload)) return payload;

    if (typeof payload !== 'object') return [];
    const o = payload as Record<string, unknown>;

    const mergedTop = this.coletarArraysRelatorioNoObjeto(o);
    if (mergedTop.length > 0) return mergedTop;

    const nestedData = o.data;
    if (nestedData !== undefined && nestedData !== null) {
      const inner = this.extrairArrayDeRelatorioOrcamento(nestedData, depth + 1);
      if (inner.length > 0) return inner;
    }

    for (const v of Object.values(o)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const inner = this.extrairArrayDeRelatorioOrcamento(v, depth + 1);
        if (inner.length > 0) return inner;
      }
    }

    let best: unknown[] = [];
    for (const v of Object.values(o)) {
      if (!Array.isArray(v) || v.length === 0) continue;
      const first = v[0];
      if (first !== null && typeof first === 'object' && !Array.isArray(first) && v.length > best.length) {
        best = v;
      }
    }
    return best;
  }

  /** GET relatório analítico — tenta variantes de path usadas pela API Orçafascio. */
  async buscarAnaliticoOrcamento(id: string): Promise<unknown[]> {
    const { token } = await this.authenticate();
    const authModes = OrcafascioService.authorizationVariants(token);
    const enc = encodeURIComponent(id);
    const paths = [
      `/v1/bud/budgets/${enc}/analytical_with_unit_price`,
      `/v1/bud/budget/${enc}/analytical_with_unit_price`,
      `/v1/bud/budgets/${enc}/analytical`,
      `/v1/bud/budget/${enc}/analytical`,
    ];

    let lastErr: unknown;
    let lastResult: unknown[] = [];

    for (const path of paths) {
      for (const authH of authModes) {
        try {
          const res = await this.client.get<unknown>(path, {
            headers: { Authorization: authH },
            timeout: 120000,
          });
          lastResult = this.extrairArrayDeRelatorioOrcamento(res.data);
          lastErr = undefined;
          if (lastResult.length > 0) return lastResult;
          console.log(`[Orçafascio] Analítico ${id} ${path} → 200, 0 linhas`);
          break;
        } catch (e) {
          lastErr = e;
          const st = axios.isAxiosError(e) ? e.response?.status : undefined;
          console.log(`[Orçafascio] Analítico orçamento ${id} ${path} → HTTP ${st ?? '?'}`);
          if (st === 401 || st === 403) continue;
          if (axios.isAxiosError(e) && !e.response) throw this.wrapAxiosError(e, 'Analítico orçamento');
          if (st !== 404) throw this.wrapAxiosError(e, `Analítico orçamento ${id}`);
          break;
        }
      }
    }

    if (lastResult.length > 0) return lastResult;
    if (lastErr)
      throw this.wrapAxiosError(lastErr, `Analítico orçamento ${id}`);
    return [];
  }

  /** GET relatório sintético — tenta variantes de path. */
  async buscarSinteticoOrcamento(id: string): Promise<unknown[]> {
    const { token } = await this.authenticate();
    const authModes = OrcafascioService.authorizationVariants(token);
    const enc = encodeURIComponent(id);
    const paths = [`/v1/bud/budgets/${enc}/synthetic`, `/v1/bud/budget/${enc}/synthetic`];

    let lastErr: unknown;
    let lastResult: unknown[] = [];

    for (const path of paths) {
      for (const authH of authModes) {
        try {
          const res = await this.client.get<unknown>(path, {
            headers: { Authorization: authH },
            timeout: 120000,
          });
          lastResult = this.extrairArrayDeRelatorioOrcamento(res.data);
          lastErr = undefined;
          if (lastResult.length > 0) return lastResult;
          console.log(`[Orçafascio] Sintético ${id} ${path} → 200, 0 linhas`);
          break;
        } catch (e) {
          lastErr = e;
          const st = axios.isAxiosError(e) ? e.response?.status : undefined;
          console.log(`[Orçafascio] Sintético orçamento ${id} ${path} → HTTP ${st ?? '?'}`);
          if (st === 401 || st === 403) continue;
          if (axios.isAxiosError(e) && !e.response) throw this.wrapAxiosError(e, 'Sintético orçamento');
          if (st !== 404) throw this.wrapAxiosError(e, `Sintético orçamento ${id}`);
          break;
        }
      }
    }

    if (lastResult.length > 0) return lastResult;
    if (lastErr) throw this.wrapAxiosError(lastErr, `Sintético orçamento ${id}`);
    return [];
  }

  async buscarDetalheOrcamento(id: string): Promise<Record<string, unknown>> {
    const { token } = await this.authenticate();
    const authModes = OrcafascioService.authorizationVariants(token);
    const enc = encodeURIComponent(id);

    // Tenta variantes comuns da API até obter 200
    const pathsBase = [
      `/v1/bud/budgets/${enc}`,
      `/v1/bud/budget/${enc}`,
    ];
    const pathsItems = [
      `/v1/bud/budgets/${enc}/items`,
      `/v1/bud/budget/${enc}/items`,
      `/v1/bud/budgets/${enc}/compositions`,
      `/v1/bud/budget/${enc}/compositions`,
      `/v1/bud/budgets/${enc}/services`,
      `/v1/bud/budget/${enc}/services`,
    ];

    let budgetData: Record<string, unknown> | null = null;
    let lastErr: unknown;

    // 1. Tenta buscar o detalhe do orçamento
    for (const path of pathsBase) {
      for (const authH of authModes) {
        try {
          const res = await this.client.get<Record<string, unknown>>(path, {
            headers: { Authorization: authH },
          });
          budgetData = res.data ?? {};
          console.log(`[Orçafascio] Detalhe orçamento → ${path} → 200`);
          break;
        } catch (e) {
          lastErr = e;
          const st = axios.isAxiosError(e) ? e.response?.status : undefined;
          console.log(`[Orçafascio] Detalhe orçamento ${path} → HTTP ${st ?? '?'}`);
          if (axios.isAxiosError(e) && !e.response) throw this.wrapAxiosError(e, 'Detalhe orçamento');
        }
      }
      if (budgetData !== null) break;
    }

    // 2. Tenta buscar os itens/composições do orçamento
    let itemsData: unknown = null;
    for (const path of pathsItems) {
      for (const authH of authModes) {
        try {
          const res = await this.client.get<unknown>(path, {
            headers: { Authorization: authH },
          });
          itemsData = res.data;
          console.log(`[Orçafascio] Itens orçamento → ${path} → 200`);
          break;
        } catch (e) {
          const st = axios.isAxiosError(e) ? e.response?.status : undefined;
          console.log(`[Orçafascio] Itens orçamento ${path} → HTTP ${st ?? '?'}`);
        }
      }
      if (itemsData !== null) break;
    }

    if (budgetData === null && itemsData === null) {
      if (lastErr) throw this.wrapAxiosError(lastErr, `Detalhe do orçamento ${id}`);
      throw new Error(`Orçafascio: não foi possível obter detalhe do orçamento ${id}`);
    }

    return {
      ...(budgetData ?? { id }),
      _items: itemsData,
    };
  }

  // ── Insumos ────────────────────────────────────────────────────────────────

  async listarInsumos(page = 1): Promise<OrcafascioListResponse<OrcafascioInsumoListItem>> {
    const { token } = await this.authenticate();
    const base = this.garantirResolvedCompositionBase();
    const b = encodeURIComponent(base);
    return this.getJsonMultiPath<OrcafascioListResponse<OrcafascioInsumoListItem>>(
      'Listar insumos',
      token,
      [`/v1/base/${b}/resources`],
      { page }
    );
  }
}
