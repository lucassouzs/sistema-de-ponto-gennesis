import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface OrcamentoData {
  servicos: unknown[];
  composicoes: unknown[];
  imports: unknown[];
  /** Rascunho da aba Orçamento (itens no orçamento, quantidades, dimensões, itens ocultos). */
  sessaoOrcamento?: unknown;
}

export interface OrcamentoIndexEntry {
  id: string;
  nome: string;
  updatedAt: string;
}

export interface OrcamentoIndex {
  ultimoOrcamentoId?: string;
  orcamentos: OrcamentoIndexEntry[];
}

/** Serviços padrão + histórico de importações — compartilhado por todos os orçamentos do contrato. */
export interface ServicosPadraoData {
  servicos: unknown[];
  imports: unknown[];
}

const EMPTY_DATA: OrcamentoData = {
  servicos: [],
  composicoes: [],
  imports: []
};

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export class OrcamentoService {
  private s3: AWS.S3 | null;
  private bucketName: string;
  private useLocal: boolean;
  private localBasePath: string;

  constructor() {
    this.useLocal =
      (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local' ||
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY;

    this.s3 = this.useLocal
      ? null
      : new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        });

    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
    this.localBasePath = path.join(process.cwd(), 'uploads', 'orcamentos');
  }

  private getLegacyDataKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/data.json';
  }

  private getIndexKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/index.json';
  }

  private getOrcamentoDataKey(centroCustoId: string, orcamentoId: string): string {
    return 'orcamentos/' + centroCustoId + '/' + orcamentoId + '.json';
  }

  private getServicosPadraoKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/servicos-padrao.json';
  }

  private localServicosPadraoPath(centroCustoId: string): string {
    return path.join(this.localDir(centroCustoId), 'servicos-padrao.json');
  }

  private getComposicoesGeralKey(): string {
    return 'orcamentos/composicoes-geral/data.json';
  }

  private localDir(centroCustoId: string): string {
    return path.join(this.localBasePath, centroCustoId);
  }

  private localLegacyPath(centroCustoId: string): string {
    return path.join(this.localDir(centroCustoId), 'data.json');
  }

  private localIndexPath(centroCustoId: string): string {
    return path.join(this.localDir(centroCustoId), 'index.json');
  }

  private localOrcamentoPath(centroCustoId: string, orcamentoId: string): string {
    return path.join(this.localDir(centroCustoId), `${orcamentoId}.json`);
  }

  private hasOrcamentoPerfeitoImport(imports: unknown[]): boolean {
    if (!Array.isArray(imports) || imports.length === 0) return false;
    return imports.some((imp) => {
      if (!imp || typeof imp !== 'object') return false;
      const origem = (imp as { origem?: unknown }).origem;
      return origem === 'orcamento-perfeito';
    });
  }

  async migrateLegacyIfNeeded(centroCustoId: string): Promise<void> {
    const indexPath = this.localIndexPath(centroCustoId);
    const legacyPath = this.localLegacyPath(centroCustoId);

    if (this.useLocal || !this.s3) {
      if (!fs.existsSync(legacyPath)) return;
      if (fs.existsSync(indexPath)) {
        try {
          const raw = fs.readFileSync(indexPath, 'utf-8');
          const idx = JSON.parse(raw) as OrcamentoIndex;
          if (idx?.orcamentos?.length) return;
        } catch {
          /* continua migração */
        }
      }
      let rawLegacy: string;
      try {
        rawLegacy = fs.readFileSync(legacyPath, 'utf-8');
      } catch {
        return;
      }
      let legacy: OrcamentoData;
      try {
        legacy = JSON.parse(rawLegacy) as OrcamentoData;
      } catch {
        return;
      }
      const id = randomUUID();
      const nome = 'Orçamento (importado)';
      const updatedAt = new Date().toISOString();
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await this.saveServicosPadrao(centroCustoId, {
        servicos: legacy.servicos || [],
        imports: legacy.imports || []
      });
      fs.writeFileSync(
        this.localOrcamentoPath(centroCustoId, id),
        JSON.stringify({ sessaoOrcamento: legacy.sessaoOrcamento }),
        'utf-8'
      );
      const index: OrcamentoIndex = {
        ultimoOrcamentoId: id,
        orcamentos: [{ id, nome, updatedAt }]
      };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), 'utf-8');
      try {
        fs.renameSync(legacyPath, legacyPath + '.migrated.bak');
      } catch {
        /* ok */
      }
      return;
    }

    // S3: migra só se não houver índice com orçamentos
    try {
      const idxObj = await this.s3!.getObject({ Bucket: this.bucketName, Key: this.getIndexKey(centroCustoId) }).promise();
      const rawIdx = idxObj.Body
        ? typeof idxObj.Body === 'string'
          ? idxObj.Body
          : idxObj.Body.toString('utf-8')
        : '';
      if (rawIdx) {
        const idx = JSON.parse(rawIdx) as OrcamentoIndex;
        if (idx?.orcamentos?.length) return;
      }
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code !== 'NoSuchKey') throw err;
    }

    let legacyBody: string | undefined;
    try {
      const r = await this.s3!.getObject({ Bucket: this.bucketName, Key: this.getLegacyDataKey(centroCustoId) }).promise();
      legacyBody = r.Body ? (typeof r.Body === 'string' ? r.Body : r.Body.toString('utf-8')) : undefined;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return;
      throw err;
    }
    if (!legacyBody) return;
    let legacy: OrcamentoData;
    try {
      legacy = JSON.parse(legacyBody) as OrcamentoData;
    } catch {
      return;
    }
    const id = randomUUID();
    const nome = 'Orçamento (importado)';
    const updatedAt = new Date().toISOString();
    await this.saveServicosPadrao(centroCustoId, {
      servicos: legacy.servicos || [],
      imports: legacy.imports || []
    });
    await this.s3!.putObject({
      Bucket: this.bucketName,
      Key: this.getOrcamentoDataKey(centroCustoId, id),
      Body: JSON.stringify({ sessaoOrcamento: legacy.sessaoOrcamento }),
      ContentType: 'application/json'
    }).promise();
    const index: OrcamentoIndex = {
      ultimoOrcamentoId: id,
      orcamentos: [{ id, nome, updatedAt }]
    };
    await this.s3!.putObject({
      Bucket: this.bucketName,
      Key: this.getIndexKey(centroCustoId),
      Body: JSON.stringify(index),
      ContentType: 'application/json'
    }).promise();
  }

  async getIndex(centroCustoId: string): Promise<OrcamentoIndex> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    try {
      if (this.useLocal || !this.s3) {
        const p = this.localIndexPath(centroCustoId);
        if (!fs.existsSync(p)) return { orcamentos: [] };
        const raw = fs.readFileSync(p, 'utf-8');
        const idx = JSON.parse(raw) as OrcamentoIndex;
        return {
          ultimoOrcamentoId: idx.ultimoOrcamentoId,
          orcamentos: Array.isArray(idx.orcamentos) ? idx.orcamentos : []
        };
      }
      const result = await this.s3!.getObject({
        Bucket: this.bucketName,
        Key: this.getIndexKey(centroCustoId)
      }).promise();
      if (!result.Body) return { orcamentos: [] };
      const body = typeof result.Body === 'string' ? result.Body : result.Body.toString('utf-8');
      const idx = JSON.parse(body) as OrcamentoIndex;
      return {
        ultimoOrcamentoId: idx.ultimoOrcamentoId,
        orcamentos: Array.isArray(idx.orcamentos) ? idx.orcamentos : []
      };
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return { orcamentos: [] };
      if (this.useLocal) return { orcamentos: [] };
      throw err;
    }
  }

  private async writeIndex(centroCustoId: string, index: OrcamentoIndex): Promise<void> {
    const body = JSON.stringify(index);
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localIndexPath(centroCustoId), body, 'utf-8');
      return;
    }
    await this.s3!.putObject({
      Bucket: this.bucketName,
      Key: this.getIndexKey(centroCustoId),
      Body: body,
      ContentType: 'application/json'
    }).promise();
  }

  /** Lê arquivo JSON do orçamento (sem merge com serviços do contrato). */
  async readOrcamentoFile(centroCustoId: string, orcamentoId: string): Promise<OrcamentoData | null> {
    if (!isUuid(orcamentoId)) return null;
    await this.migrateLegacyIfNeeded(centroCustoId);
    try {
      if (this.useLocal || !this.s3) {
        const p = this.localOrcamentoPath(centroCustoId, orcamentoId);
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as OrcamentoData;
      }
      const result = await this.s3!.getObject({
        Bucket: this.bucketName,
        Key: this.getOrcamentoDataKey(centroCustoId, orcamentoId)
      }).promise();
      if (!result.Body) return null;
      const body = typeof result.Body === 'string' ? result.Body : result.Body.toString('utf-8');
      return JSON.parse(body) as OrcamentoData;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  async readServicosPadraoFile(centroCustoId: string): Promise<ServicosPadraoData | null> {
    try {
      if (this.useLocal || !this.s3) {
        const p = this.localServicosPadraoPath(centroCustoId);
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as ServicosPadraoData;
      }
      const result = await this.s3!.getObject({
        Bucket: this.bucketName,
        Key: this.getServicosPadraoKey(centroCustoId)
      }).promise();
      if (!result.Body) return null;
      const body = typeof result.Body === 'string' ? result.Body : result.Body.toString('utf-8');
      return JSON.parse(body) as ServicosPadraoData;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  /**
   * Se existir orçamento antigo com serviços só no arquivo por ID, copia para servicos-padrao.json uma vez.
   */
  async migrateServicosPadraoFromOrcamentosIfNeeded(centroCustoId: string): Promise<void> {
    const existing = await this.readServicosPadraoFile(centroCustoId);
    const hasPadrao =
      existing &&
      Array.isArray(existing.servicos) &&
      existing.servicos.length > 0;
    if (hasPadrao) return;

    const index = await this.getIndex(centroCustoId);
    for (const o of index.orcamentos) {
      const raw = await this.readOrcamentoFile(centroCustoId, o.id);
      if (!raw) continue;
      const servicos = raw.servicos;
      if (Array.isArray(servicos) && servicos.length > 0) {
        await this.saveServicosPadrao(centroCustoId, {
          servicos,
          imports: Array.isArray(raw.imports) ? raw.imports : []
        });
        return;
      }
    }
  }

  async saveServicosPadrao(centroCustoId: string, data: ServicosPadraoData): Promise<void> {
    const servicos = Array.isArray(data.servicos) ? data.servicos : [];
    const imports = Array.isArray(data.imports) ? data.imports : [];
    const shouldDelete = servicos.length === 0 && imports.length === 0;

    if (shouldDelete) {
      if (this.useLocal || !this.s3) {
        const p = this.localServicosPadraoPath(centroCustoId);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return;
      }
      await this.s3!.deleteObject({
        Bucket: this.bucketName,
        Key: this.getServicosPadraoKey(centroCustoId)
      }).promise();
      return;
    }

    const body = JSON.stringify({
      servicos,
      imports
    });
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localServicosPadraoPath(centroCustoId), body, 'utf-8');
      return;
    }
    await this.s3!.putObject({
      Bucket: this.bucketName,
      Key: this.getServicosPadraoKey(centroCustoId),
      Body: body,
      ContentType: 'application/json'
    }).promise();
  }

  /** Serviços padrão do contrato (compartilhado entre todos os orçamentos). */
  async getServicosPadrao(centroCustoId: string): Promise<ServicosPadraoData> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    await this.migrateServicosPadraoFromOrcamentosIfNeeded(centroCustoId);
    const f = await this.readServicosPadraoFile(centroCustoId);
    const servicos = f?.servicos;
    const imports = f?.imports;
    return {
      servicos: Array.isArray(servicos) ? servicos : [],
      imports: Array.isArray(imports) ? imports : []
    };
  }

  /**
   * Resposta da API: serviços/imports do contrato + sessão só deste orçamento.
   * Árvore `servicos` editada na montagem fica no arquivo do orçamento; `servicos-padrao` é só o catálogo (import).
   */
  async getOrcamento(centroCustoId: string, orcamentoId: string): Promise<OrcamentoData | null> {
    if (!isUuid(orcamentoId)) return null;
    await this.migrateLegacyIfNeeded(centroCustoId);
    const raw = await this.readOrcamentoFile(centroCustoId, orcamentoId);
    if (!raw) return null;
    const padrao = await this.getServicosPadrao(centroCustoId);
    const rawObj = raw as unknown as Record<string, unknown>;
    const docTemServicos = Object.prototype.hasOwnProperty.call(rawObj, 'servicos');
    const servicos = docTemServicos && Array.isArray(rawObj.servicos) ? rawObj.servicos : padrao.servicos;
    return {
      servicos,
      imports: padrao.imports,
      composicoes: [],
      sessaoOrcamento: raw.sessaoOrcamento
    };
  }

  /**
   * Mescla sessão e/ou árvore de serviços no JSON do orçamento sem apagar o que não veio no patch.
   */
  async mergeOrcamentoArquivo(
    centroCustoId: string,
    orcamentoId: string,
    patch: { sessaoOrcamento?: unknown; servicos?: unknown[] }
  ): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const exists = index.orcamentos.some(o => o.id === orcamentoId);
    if (!exists) throw new Error('Orçamento não encontrado no índice');

    const existing: Partial<OrcamentoData> =
      (await this.readOrcamentoFile(centroCustoId, orcamentoId)) ?? {};
    const nextSessao =
      patch.sessaoOrcamento !== undefined ? patch.sessaoOrcamento : existing.sessaoOrcamento;
    const nextServicos = patch.servicos !== undefined ? patch.servicos : existing.servicos;

    const payload: Record<string, unknown> = {};
    if (nextSessao !== undefined) payload.sessaoOrcamento = nextSessao;
    if (nextServicos !== undefined) payload.servicos = nextServicos;

    const body = JSON.stringify(payload);
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localOrcamentoPath(centroCustoId, orcamentoId), body, 'utf-8');
    } else {
      await this.s3!.putObject({
        Bucket: this.bucketName,
        Key: this.getOrcamentoDataKey(centroCustoId, orcamentoId),
        Body: body,
        ContentType: 'application/json'
      }).promise();
    }
    const updatedAt = new Date().toISOString();
    const next: OrcamentoIndex = {
      ultimoOrcamentoId: orcamentoId,
      orcamentos: index.orcamentos.map(o =>
        o.id === orcamentoId ? { ...o, updatedAt } : o
      )
    };
    await this.writeIndex(centroCustoId, next);
  }

  async saveOrcamentoSessao(centroCustoId: string, orcamentoId: string, sessaoOrcamento: unknown): Promise<void> {
    await this.mergeOrcamentoArquivo(centroCustoId, orcamentoId, { sessaoOrcamento });
  }

  /** Grava serviços do contrato + sessão do orçamento (compat com clientes que enviam o payload completo). */
  async saveOrcamento(centroCustoId: string, orcamentoId: string, data: OrcamentoData): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const exists = index.orcamentos.some(o => o.id === orcamentoId);
    if (!exists) throw new Error('Orçamento não encontrado no índice');
    await this.mergeOrcamentoArquivo(centroCustoId, orcamentoId, {
      sessaoOrcamento: data.sessaoOrcamento,
      servicos: Array.isArray(data.servicos) ? data.servicos : undefined
    });
    const imports = Array.isArray(data.imports) ? data.imports : [];
    if (imports.length > 0 && this.hasOrcamentoPerfeitoImport(imports)) {
      const current = await this.getServicosPadrao(centroCustoId);
      await this.saveServicosPadrao(centroCustoId, {
        servicos: current.servicos,
        imports
      });
    }
  }

  async createOrcamento(centroCustoId: string, nome?: string): Promise<OrcamentoIndexEntry> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    const id = randomUUID();
    const index = await this.getIndex(centroCustoId);
    const n = (nome && nome.trim()) || `Orçamento ${index.orcamentos.length + 1}`;
    const updatedAt = new Date().toISOString();
    const entry: OrcamentoIndexEntry = { id, nome: n, updatedAt };
    const body = JSON.stringify({});
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localOrcamentoPath(centroCustoId, id), body, 'utf-8');
    } else {
      await this.s3!.putObject({
        Bucket: this.bucketName,
        Key: this.getOrcamentoDataKey(centroCustoId, id),
        Body: body,
        ContentType: 'application/json'
      }).promise();
    }
    await this.writeIndex(centroCustoId, {
      ultimoOrcamentoId: id,
      orcamentos: [entry, ...index.orcamentos]
    });
    return entry;
  }

  async renameOrcamento(centroCustoId: string, orcamentoId: string, nome: string): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const updatedAt = new Date().toISOString();
    const next: OrcamentoIndex = {
      ...index,
      orcamentos: index.orcamentos.map(o =>
        o.id === orcamentoId ? { ...o, nome: nome.trim() || o.nome, updatedAt } : o
      )
    };
    if (!next.orcamentos.some(o => o.id === orcamentoId)) throw new Error('Orçamento não encontrado');
    await this.writeIndex(centroCustoId, next);
  }

  async deleteOrcamento(centroCustoId: string, orcamentoId: string): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const filtered = index.orcamentos.filter(o => o.id !== orcamentoId);
    if (filtered.length === index.orcamentos.length) throw new Error('Orçamento não encontrado');

    if (this.useLocal || !this.s3) {
      const p = this.localOrcamentoPath(centroCustoId, orcamentoId);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      try {
        await this.s3!.deleteObject({
          Bucket: this.bucketName,
          Key: this.getOrcamentoDataKey(centroCustoId, orcamentoId)
        }).promise();
      } catch {
        /* ok */
      }
    }

    let ultimo = index.ultimoOrcamentoId;
    if (ultimo === orcamentoId) {
      ultimo = filtered[0]?.id;
    }
    await this.writeIndex(centroCustoId, {
      ultimoOrcamentoId: ultimo,
      orcamentos: filtered
    });
  }

  /** Compat: salva no primeiro orçamento ou cria um se não houver índice (legado). */
  async saveLegacy(centroCustoId: string, data: OrcamentoData): Promise<void> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    let index = await this.getIndex(centroCustoId);
    let targetId = index.ultimoOrcamentoId || index.orcamentos[0]?.id;
    if (!targetId) {
      const created = await this.createOrcamento(centroCustoId, 'Orçamento 1');
      targetId = created.id;
      index = await this.getIndex(centroCustoId);
    }
    await this.saveServicosPadrao(centroCustoId, {
      servicos: data.servicos || [],
      imports: data.imports || []
    });
    await this.saveOrcamentoSessao(centroCustoId, targetId, data.sessaoOrcamento);
  }

  /** @deprecated usar getIndex + getOrcamento */
  async save(centroCustoId: string, data: OrcamentoData): Promise<void> {
    await this.saveLegacy(centroCustoId, data);
  }

  /** @deprecated usar getIndex + getOrcamento */
  async get(centroCustoId: string): Promise<OrcamentoData | null> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    const index = await this.getIndex(centroCustoId);
    const id = index.ultimoOrcamentoId || index.orcamentos[0]?.id;
    if (!id) return null;
    return this.getOrcamento(centroCustoId, id);
  }

  async getComposicoesGeral(): Promise<unknown[] | null> {
    try {
      if (this.useLocal || !this.s3) {
        const filePath = path.join(this.localBasePath, 'composicoes-geral', 'data.json');
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as unknown[];
      }
      const result = await this.s3!.getObject({
        Bucket: this.bucketName,
        Key: this.getComposicoesGeralKey()
      }).promise();
      if (!result.Body) return null;
      const body = typeof result.Body === 'string' ? result.Body : result.Body.toString('utf-8');
      return JSON.parse(body) as unknown[];
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  async saveComposicoesGeral(items: unknown[]): Promise<void> {
    const body = JSON.stringify(items);
    if (this.useLocal || !this.s3) {
      const dir = path.join(this.localBasePath, 'composicoes-geral');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data.json'), body, 'utf-8');
      return;
    }
    await this.s3!.putObject({
      Bucket: this.bucketName,
      Key: this.getComposicoesGeralKey(),
      Body: body,
      ContentType: 'application/json'
    }).promise();
  }
}
