import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { backendUploadsRoot } from '../lib/uploads';

export type FormularioFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'sim_nao'
  | 'dropdown'
  | 'checkbox'
  | 'checklist'
  | 'pills'
  | 'profiles'
  | 'rating'
  | 'slider'
  | 'attachment'
  | 'image'
  | 'table'
  | 'qrcode'
  | 'signature';

export type FormularioFieldWidth = 'half' | 'full';

export interface FormularioFollowUp {
  whenValue: string;
  type: 'text' | 'textarea' | 'pills';
  placeholder?: string;
  options?: string[];
}

export interface FormularioQuestion {
  id: string;
  title: string;
  type: FormularioFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  width?: FormularioFieldWidth;
  followUp?: FormularioFollowUp | null;
}

export interface FormularioSection {
  id: string;
  title: string;
  description?: string;
  questions: FormularioQuestion[];
}

export interface FormularioTemplateIndexEntry {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormularioTemplate {
  id: string;
  name: string;
  description?: string;
  sections: FormularioSection[];
  createdAt: string;
  updatedAt: string;
}

interface FormularioIndexFile {
  items: FormularioTemplateIndexEntry[];
}

const INDEX_KEY = 'formularios/_index.json';
const VALID_FIELD_TYPES = new Set<FormularioFieldType>([
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'sim_nao',
  'dropdown',
  'checkbox',
  'checklist',
  'pills',
  'profiles',
  'rating',
  'slider',
  'attachment',
  'image',
  'table',
  'qrcode',
  'signature',
]);
const VALID_FIELD_WIDTHS = new Set<FormularioFieldWidth>(['half', 'full']);
const VALID_FOLLOW_UP_TYPES = new Set(['text', 'textarea', 'pills']);

function emptySection(): FormularioSection {
  return {
    id: randomUUID(),
    title: 'Nova seção',
    description: '',
    questions: [
      {
        id: randomUUID(),
        title: 'Nova pergunta',
        type: 'textarea',
        required: false,
        followUp: null,
      },
    ],
  };
}

export class FormularioTemplateService {
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
    this.localBasePath = path.join(backendUploadsRoot, 'formularios');
  }

  private templateKey(id: string): string {
    return `formularios/${id}.json`;
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
    const json = JSON.stringify(data, null, 2);
    if (this.useLocal) {
      const filePath = path.join(this.localBasePath, ...key.split('/').slice(1));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, json, 'utf-8');
      return;
    }
    await this.s3!
      .putObject({
        Bucket: this.bucketName,
        Key: key,
        Body: json,
        ContentType: 'application/json',
      })
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

  private async readIndex(): Promise<FormularioIndexFile> {
    const idx = await this.readJson<FormularioIndexFile>(INDEX_KEY);
    if (!idx || !Array.isArray(idx.items)) return { items: [] };
    return { items: idx.items };
  }

  private async writeIndex(items: FormularioTemplateIndexEntry[]): Promise<void> {
    await this.writeJson(INDEX_KEY, { items });
  }

  private cleanSections(sections: FormularioSection[] | undefined): FormularioSection[] {
    if (!sections || !Array.isArray(sections)) {
      throw new Error('Seções inválidas.');
    }
    return sections.map((s) => ({
      id: s.id || randomUUID(),
      title: (s.title || '').trim() || 'Nova seção',
      description: s.description?.trim() || undefined,
      questions: (s.questions || []).map((qItem) => {
        const type = VALID_FIELD_TYPES.has(qItem.type) ? qItem.type : 'textarea';
        const followUpRaw = qItem.followUp || null;
        const followUp =
          followUpRaw && VALID_FOLLOW_UP_TYPES.has(followUpRaw.type)
            ? {
                whenValue: (followUpRaw.whenValue || '').trim(),
                type: followUpRaw.type as FormularioFollowUp['type'],
                placeholder: followUpRaw.placeholder,
                options: followUpRaw.options,
              }
            : null;
        return {
          id: qItem.id || randomUUID(),
          title: (qItem.title || '').trim() || 'Nova pergunta',
          type,
          options: qItem.options,
          required: !!qItem.required,
          placeholder: qItem.placeholder,
          width: VALID_FIELD_WIDTHS.has(qItem.width as FormularioFieldWidth)
            ? (qItem.width as FormularioFieldWidth)
            : undefined,
          followUp,
        };
      }),
    }));
  }

  async list(): Promise<FormularioTemplateIndexEntry[]> {
    await this.ensureReuniaoDefault();
    const idx = await this.readIndex();
    return [...idx.items].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /** Garante o template padrão de reunião em Cadastros > Formulários. */
  async ensureReuniaoDefault(): Promise<FormularioTemplateIndexEntry> {
    const idx = await this.readIndex();
    const found = idx.items.find(
      (i) => i.name.trim().toLowerCase() === 'formulário de reunião'
    );
    if (found) return found;

    const { buildDefaultTemplate } = await import('./ReuniaoService');
    const def = buildDefaultTemplate();
    const created = await this.create({
      name: 'Formulário de reunião',
      description:
        'Template padrão de reunião de acompanhamento de contrato (cronograma, gestão e comunicação).',
      sections: def.sections as FormularioSection[],
    });
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async get(id: string): Promise<FormularioTemplate | null> {
    if (!id?.trim()) return null;
    return this.readJson<FormularioTemplate>(this.templateKey(id.trim()));
  }

  async create(input: {
    name?: string;
    description?: string;
    sections?: FormularioSection[];
  }): Promise<FormularioTemplate> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = (input.name || '').trim() || 'Novo formulário';
    const description = (input.description || '').trim() || undefined;
    const sections =
      input.sections && input.sections.length > 0
        ? this.cleanSections(input.sections)
        : [emptySection()];

    const template: FormularioTemplate = {
      id,
      name,
      description,
      sections,
      createdAt: now,
      updatedAt: now,
    };

    const idx = await this.readIndex();
    idx.items.unshift({
      id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    });
    await this.writeJson(this.templateKey(id), template);
    await this.writeIndex(idx.items);
    return template;
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      sections?: FormularioSection[];
    }
  ): Promise<FormularioTemplate> {
    const existing = await this.get(id);
    if (!existing) throw new Error('Formulário não encontrado.');

    const now = new Date().toISOString();
    const name =
      input.name !== undefined ? (input.name || '').trim() || 'Novo formulário' : existing.name;
    const description =
      input.description !== undefined
        ? (input.description || '').trim() || undefined
        : existing.description;
    const sections =
      input.sections !== undefined
        ? this.cleanSections(input.sections)
        : existing.sections;

    const updated: FormularioTemplate = {
      ...existing,
      name,
      description,
      sections,
      updatedAt: now,
    };

    const idx = await this.readIndex();
    const entryIdx = idx.items.findIndex((i) => i.id === id);
    const entry: FormularioTemplateIndexEntry = {
      id,
      name,
      description,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    if (entryIdx >= 0) idx.items[entryIdx] = entry;
    else idx.items.unshift(entry);

    await this.writeJson(this.templateKey(id), updated);
    await this.writeIndex(idx.items);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error('Formulário não encontrado.');

    const idx = await this.readIndex();
    await this.writeIndex(idx.items.filter((i) => i.id !== id));
    await this.deleteKey(this.templateKey(id));
  }
}
