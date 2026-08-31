import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { backendUploadsRoot } from '../lib/uploads';

export type FormularioFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'valor'
  | 'percent'
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
  readOnly?: boolean;
  formula?: {
    op: 'sum' | 'subtract' | 'multiply' | 'divide';
    sourceIds: string[];
    resultFormat?: 'number' | 'valor' | 'percent';
  };
  tableColumns?: Array<{
    id: string;
    title: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    type?: 'text' | 'number' | 'valor' | 'percent';
  }>;
  followUp?: FormularioFollowUp | null;
}

export interface FormularioSection {
  id: string;
  title: string;
  description?: string;
  questions: FormularioQuestion[];
}

export interface FormularioStep {
  id: string;
  title: string;
  description?: string;
  sections: FormularioSection[];
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
  multiStepEnabled?: boolean;
  steps?: FormularioStep[];
  sections: FormularioSection[];
  createdAt: string;
  updatedAt: string;
}

interface FormularioIndexFile {
  items: FormularioTemplateIndexEntry[];
  defaultReuniaoTemplateId?: string;
}

const REUNIAO_DEFAULT_DESCRIPTION_MARKER =
  'Template padrão de reunião de acompanhamento de contrato';

const INDEX_KEY = 'formularios/_index.json';
const VALID_FIELD_TYPES = new Set<FormularioFieldType>([
  'text',
  'textarea',
  'number',
  'valor',
  'percent',
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

function emptyStep(): FormularioStep {
  return {
    id: randomUUID(),
    title: 'Etapa 1',
    description: '',
    sections: [emptySection()],
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
    return {
      items: idx.items,
      defaultReuniaoTemplateId: idx.defaultReuniaoTemplateId,
    };
  }

  private async writeIndex(file: FormularioIndexFile): Promise<void> {
    await this.writeJson(INDEX_KEY, {
      items: file.items,
      ...(file.defaultReuniaoTemplateId
        ? { defaultReuniaoTemplateId: file.defaultReuniaoTemplateId }
        : {}),
    });
  }

  private entryFromTemplate(template: FormularioTemplate): FormularioTemplateIndexEntry {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private async persistDefaultReuniaoTemplateId(
    idx: FormularioIndexFile,
    templateId: string,
  ): Promise<void> {
    if (idx.defaultReuniaoTemplateId === templateId) return;
    await this.writeIndex({ ...idx, defaultReuniaoTemplateId: templateId });
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
          readOnly: qItem.readOnly === true ? true : undefined,
          formula: qItem.formula,
          tableColumns: qItem.tableColumns,
          followUp,
        };
      }),
    }));
  }

  private cleanSteps(steps: FormularioStep[]): FormularioStep[] {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('Etapas inválidas.');
    }
    return steps.map((step) => ({
      id: step.id || randomUUID(),
      title: (step.title || '').trim() || 'Nova etapa',
      description: step.description?.trim() || undefined,
      sections: this.cleanSections(step.sections || []),
    }));
  }

  private applyStructureSave(input: {
    multiStepEnabled?: boolean;
    steps?: FormularioStep[];
    sections?: FormularioSection[];
  }): {
    multiStepEnabled: boolean;
    steps?: FormularioStep[];
    sections: FormularioSection[];
  } {
    if (input.multiStepEnabled === true) {
      const steps = this.cleanSteps(input.steps || []);
      return {
        multiStepEnabled: true,
        steps,
        sections: steps.flatMap((step) => step.sections),
      };
    }

    const sections =
      input.sections && input.sections.length > 0
        ? this.cleanSections(input.sections)
        : [emptySection()];

    return { multiStepEnabled: false, sections, steps: undefined };
  }

  private normalizeStoredTemplate(template: FormularioTemplate): FormularioTemplate {
    if (template.multiStepEnabled === true && template.steps?.length) {
      const steps = this.cleanSteps(template.steps);
      return {
        ...template,
        multiStepEnabled: true,
        steps,
        sections: steps.flatMap((step) => step.sections),
      };
    }

    const sections =
      template.sections && template.sections.length > 0
        ? this.cleanSections(template.sections)
        : template.steps?.length === 1
          ? this.cleanSections(template.steps[0]!.sections || [])
          : [emptySection()];

    return {
      ...template,
      multiStepEnabled: false,
      sections,
      steps: undefined,
    };
  }

  async list(): Promise<FormularioTemplateIndexEntry[]> {
    const idx = await this.readIndex();
    return [...idx.items].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /** Garante o template padrão de reunião (somente em catálogo vazio). */
  async ensureReuniaoDefault(): Promise<FormularioTemplateIndexEntry | null> {
    const idx = await this.readIndex();

    const linkedById = idx.defaultReuniaoTemplateId
      ? idx.items.find((item) => item.id === idx.defaultReuniaoTemplateId)
      : undefined;
    if (linkedById) return linkedById;

    if (idx.defaultReuniaoTemplateId) {
      const stored = await this.get(idx.defaultReuniaoTemplateId);
      if (stored) {
        const entry = this.entryFromTemplate(stored);
        const nextItems = [entry, ...idx.items.filter((item) => item.id !== entry.id)];
        await this.writeIndex({
          items: nextItems,
          defaultReuniaoTemplateId: entry.id,
        });
        return entry;
      }
    }

    const reuniaoCandidates = idx.items.filter((item) =>
      (item.description || '').includes(REUNIAO_DEFAULT_DESCRIPTION_MARKER),
    );
    if (reuniaoCandidates.length > 0) {
      const preferred =
        reuniaoCandidates.find(
          (item) => item.name.trim().toLowerCase() !== 'formulário de reunião',
        ) ||
        [...reuniaoCandidates].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0]!;
      await this.persistDefaultReuniaoTemplateId(idx, preferred.id);
      return preferred;
    }

    const byName = idx.items.find(
      (item) => item.name.trim().toLowerCase() === 'formulário de reunião',
    );
    if (byName) {
      await this.persistDefaultReuniaoTemplateId(idx, byName.id);
      return byName;
    }

    if (idx.items.length > 0) {
      return null;
    }

    const { buildDefaultTemplate } = await import('./ReuniaoService');
    const def = buildDefaultTemplate();
    const created = await this.create({
      name: 'Formulário de reunião',
      description:
        'Template padrão de reunião de acompanhamento de contrato (cronograma, gestão e comunicação).',
      sections: def.sections as FormularioSection[],
    });
    const currentIdx = await this.readIndex();
    await this.writeIndex({
      ...currentIdx,
      defaultReuniaoTemplateId: created.id,
    });
    return this.entryFromTemplate(created);
  }

  async get(id: string): Promise<FormularioTemplate | null> {
    if (!id?.trim()) return null;
    const raw = await this.readJson<FormularioTemplate>(this.templateKey(id.trim()));
    if (!raw) return null;
    return this.normalizeStoredTemplate(raw);
  }

  async create(input: {
    name?: string;
    description?: string;
    multiStepEnabled?: boolean;
    steps?: FormularioStep[];
    sections?: FormularioSection[];
  }): Promise<FormularioTemplate> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = (input.name || '').trim() || 'Novo formulário';
    const description = (input.description || '').trim() || undefined;
    const structure = this.applyStructureSave(input);

    const template: FormularioTemplate = {
      id,
      name,
      description,
      multiStepEnabled: structure.multiStepEnabled,
      steps: structure.steps,
      sections: structure.sections,
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
    await this.writeIndex(idx);
    return template;
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      multiStepEnabled?: boolean;
      steps?: FormularioStep[];
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

    let multiStepEnabled = existing.multiStepEnabled === true;
    let steps = existing.steps;
    let sections = existing.sections;

    if (input.multiStepEnabled !== undefined || input.steps !== undefined || input.sections !== undefined) {
      const structure = this.applyStructureSave({
        multiStepEnabled:
          input.multiStepEnabled !== undefined
            ? input.multiStepEnabled
            : existing.multiStepEnabled,
        steps: input.steps !== undefined ? input.steps : existing.steps,
        sections: input.sections !== undefined ? input.sections : existing.sections,
      });
      multiStepEnabled = structure.multiStepEnabled;
      steps = structure.steps;
      sections = structure.sections;
    }

    const updated: FormularioTemplate = {
      ...existing,
      name,
      description,
      multiStepEnabled,
      steps,
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
    await this.writeIndex(idx);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error('Formulário não encontrado.');

    const idx = await this.readIndex();
    await this.writeIndex({
      items: idx.items.filter((item) => item.id !== id),
      defaultReuniaoTemplateId:
        idx.defaultReuniaoTemplateId === id ? undefined : idx.defaultReuniaoTemplateId,
    });
    await this.deleteKey(this.templateKey(id));
  }
}
