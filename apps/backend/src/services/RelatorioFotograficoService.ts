import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface FotoItem {
  id: string;
  src: string | null;
  titulo: string;
  desc: string;
}

export interface RelatorioFotograficoData {
  campos: {
    contrato: string;
    os: string;
    unidade: string;
    tipo: string;
    solicitante: string;
    os2: string;
    lote: string;
  };
  logo: string | null;
  croqui: string | null;
  localizacao: string | null;
  fotos: FotoItem[];
}

export type RelatorioCamposData = RelatorioFotograficoData['campos'];

export interface RelatorioIndexEntry {
  id: string;
  titulo: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelatorioIndex {
  relatorios: RelatorioIndexEntry[];
}

const EMPTY_DATA: RelatorioFotograficoData = {
  campos: {
    contrato: '',
    os: '',
    unidade: '',
    tipo: '',
    solicitante: '',
    os2: '',
    lote: '',
  },
  logo: null,
  croqui: null,
  localizacao: null,
  fotos: [],
};

export class RelatorioFotograficoService {
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
          region: process.env.AWS_REGION || 'us-east-1',
        });

    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
    this.localBasePath = path.join(process.cwd(), 'uploads', 'relatorios-fotograficos');
  }

  private getIndexKey(contractId: string): string {
    return `relatorios-fotograficos/${contractId}/index.json`;
  }

  private getRelatorioKey(contractId: string, relatorioId: string): string {
    return `relatorios-fotograficos/${contractId}/${relatorioId}.json`;
  }

  private async readJson<T>(key: string): Promise<T | null> {
    if (this.useLocal) {
      const filePath = path.join(this.localBasePath, ...key.split('/').slice(1));
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
    try {
      const result = await this.s3!.getObject({ Bucket: this.bucketName, Key: key }).promise();
      return JSON.parse(result.Body!.toString('utf-8')) as T;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'NoSuchKey') return null;
      throw err;
    }
  }

  private async writeJson(key: string, data: unknown): Promise<void> {
    const json = JSON.stringify(data);
    if (this.useLocal) {
      const filePath = path.join(this.localBasePath, ...key.split('/').slice(1));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, json, 'utf-8');
      return;
    }
    await this.s3!
      .putObject({ Bucket: this.bucketName, Key: key, Body: json, ContentType: 'application/json' })
      .promise();
  }

  private async deleteKey(key: string): Promise<void> {
    if (this.useLocal) {
      const filePath = path.join(this.localBasePath, ...key.split('/').slice(1));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    }
    await this.s3!.deleteObject({ Bucket: this.bucketName, Key: key }).promise();
  }

  async getIndex(contractId: string): Promise<RelatorioIndex> {
    const idx = await this.readJson<RelatorioIndex>(this.getIndexKey(contractId));
    return idx ?? { relatorios: [] };
  }

  async createRelatorio(
    contractId: string,
    titulo: string,
    initialCampos?: Partial<RelatorioCamposData>
  ): Promise<RelatorioIndexEntry> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const entry: RelatorioIndexEntry = { id, titulo, createdAt: now, updatedAt: now };

    const idx = await this.getIndex(contractId);
    idx.relatorios.push(entry);
    await this.writeJson(this.getIndexKey(contractId), idx);

    const data: RelatorioFotograficoData = {
      ...EMPTY_DATA,
      campos: {
        ...EMPTY_DATA.campos,
        ...(initialCampos ?? {}),
      },
    };
    await this.writeJson(this.getRelatorioKey(contractId, id), data);

    return entry;
  }

  async getRelatorio(contractId: string, relatorioId: string): Promise<RelatorioFotograficoData | null> {
    return this.readJson<RelatorioFotograficoData>(this.getRelatorioKey(contractId, relatorioId));
  }

  async saveRelatorio(
    contractId: string,
    relatorioId: string,
    data: RelatorioFotograficoData,
    titulo?: string
  ): Promise<void> {
    await this.writeJson(this.getRelatorioKey(contractId, relatorioId), data);

    const idx = await this.getIndex(contractId);
    const entry = idx.relatorios.find((r) => r.id === relatorioId);
    if (entry) {
      entry.updatedAt = new Date().toISOString();
      if (titulo !== undefined) entry.titulo = titulo;
      await this.writeJson(this.getIndexKey(contractId), idx);
    }
  }

  async renameRelatorio(contractId: string, relatorioId: string, titulo: string): Promise<void> {
    const idx = await this.getIndex(contractId);
    const entry = idx.relatorios.find((r) => r.id === relatorioId);
    if (entry) {
      entry.titulo = titulo;
      entry.updatedAt = new Date().toISOString();
      await this.writeJson(this.getIndexKey(contractId), idx);
    }
  }

  async deleteRelatorio(contractId: string, relatorioId: string): Promise<void> {
    await this.deleteKey(this.getRelatorioKey(contractId, relatorioId));

    const idx = await this.getIndex(contractId);
    idx.relatorios = idx.relatorios.filter((r) => r.id !== relatorioId);
    await this.writeJson(this.getIndexKey(contractId), idx);
  }
}
