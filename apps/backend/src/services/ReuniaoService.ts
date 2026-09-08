import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { formatMonthLabel, getIsoMonthKey } from '../lib/monthPeriod';
import { formatWeekLabel, getFortnightKey } from '../lib/weekPeriod';
import { backendUploadsRoot } from '../lib/uploads';

export type ReuniaoFieldType =
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

export type ReuniaoFieldWidth = 'half' | 'full';

export interface ReuniaoFollowUp {
  whenValue: string;
  type: 'text' | 'textarea' | 'pills';
  placeholder?: string;
  options?: string[];
}

export interface ReuniaoQuestion {
  id: string;
  title: string;
  type: ReuniaoFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  width?: ReuniaoFieldWidth;
  followUp?: ReuniaoFollowUp | null;
}

export interface ReuniaoSection {
  id: string;
  title: string;
  description?: string;
  questions: ReuniaoQuestion[];
}

export interface ReuniaoFormStep {
  id: string;
  title: string;
  description?: string;
  sections: ReuniaoSection[];
}

export interface ReuniaoTemplate {
  sections: ReuniaoSection[];
  updatedAt: string;
}

export interface ReuniaoAnexoInfo {
  key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface ReuniaoAnswer {
  value: string | number | null;
  followUp?: string;
}

export interface ReuniaoData {
  identificacao: {
    data: string;
    responsavelPreenchimento: string;
    /** Nome/título da reunião (o contrato já é o da pasta). */
    nome: string;
  };
  /** Respostas por id da pergunta */
  answers: Record<string, ReuniaoAnswer>;
  ata: ReuniaoAnexoInfo | null;
  video: ReuniaoAnexoInfo | null;
  /** Snapshot do formulário escolhido na criação (Cadastros > Formulários). */
  formTemplate?: {
    id: string;
    name: string;
    description?: string;
    multiStepEnabled?: boolean;
    steps?: ReuniaoFormStep[];
    sections: ReuniaoSection[];
  } | null;
}

export interface ReuniaoIndexEntry {
  id: string;
  data: string;
  responsavelPreenchimento: string;
  nome: string;
  /** Chave do mês (ex.: 2026-08) para relatório mensal. */
  monthKey?: string;
  /** Chave da quinzena (semana ISO inicial do bloco de 14 dias, ex.: 2026-W35). */
  weekKey?: string;
  /** Nome do formulário (template) usado na criação. */
  formularioName?: string;
  /** Descrição do formulário (template). */
  formularioDescription?: string;
  createdAt: string;
  updatedAt: string;
  /** Preenchido somente ao salvar/finalizar o formulário (não em rascunho). */
  submittedAt?: string;
}

export type ReuniaoKind = 'mensal' | 'semanal';

export function parseReuniaoKind(value: string): ReuniaoKind {
  if (value === 'mensal' || value === 'semanal') return value;
  throw new Error('Tipo de acompanhamento inválido.');
}

export interface ReuniaoIndex {
  reunioes: ReuniaoIndexEntry[];
}

export interface ReuniaoContractConfig {
  formularioId: string;
  formularioName?: string;
  updatedAt: string;
}

export type MensalReportStatus = 'sem_formulario' | 'pendente' | 'preenchido';

export interface MensalOverviewRow {
  contractId: string;
  contractName: string;
  contractNumber: string;
  costCenterCode?: string;
  formularioId?: string;
  formularioName?: string;
  monthKey: string;
  status: MensalReportStatus;
  entryId?: string;
  responsavelPreenchimento?: string;
  updatedAt?: string;
  totalRegistros: number;
}

export interface SemanalOverviewRow {
  contractId: string;
  contractName: string;
  contractNumber: string;
  costCenterCode?: string;
  formularioId?: string;
  formularioName?: string;
  weekKey: string;
  status: MensalReportStatus;
  entryId?: string;
  responsavelPreenchimento?: string;
  updatedAt?: string;
  totalRegistros: number;
}

function q(
  id: string,
  title: string,
  type: ReuniaoFieldType,
  extra?: Partial<ReuniaoQuestion>
): ReuniaoQuestion {
  return { id, title, type, ...extra };
}

/** Template padrão com as perguntas originais do formulário de reunião. */
export function buildDefaultTemplate(): ReuniaoTemplate {
  return {
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'cronograma',
        title: 'Apresentação do cronograma',
        description: 'Sem cronograma, não existe controle. Sem controle, existe risco.',
        questions: [
          q(
            'cronograma_pendencia_pagamento',
            'Existe pendência de pagamento na diretoria que pode travar faturamento?',
            'sim_nao',
            {
              options: ['NÃO', 'SIM'],
              followUp: {
                whenValue: 'SIM',
                type: 'textarea',
                placeholder: 'Qual ID? Justificativa.',
              },
            }
          ),
          q(
            'cronograma_pessoas_empreiteiros',
            'Quantas pessoas e quantos empreiteiros estão alocados hoje no contrato?',
            'textarea'
          ),
          q(
            'cronograma_equipe_executavel',
            'Com a equipe atual, o cronograma apresentado é executável sem horas extras, retrabalho ou risco de atraso?',
            'sim_nao',
            {
              options: ['SIM', 'NÃO'],
              followUp: {
                whenValue: 'NÃO',
                type: 'textarea',
                placeholder: 'Qual ajuste é necessário?',
              },
            }
          ),
          q(
            'cronograma_gargalo',
            'Qual gargalo do contrato hoje? O que tem feito em relação a isso? Precisa de ajuda?',
            'textarea'
          ),
          q(
            'cronograma_situacao_risco',
            'Existe alguma situação que possa virar problema se não agirmos agora?',
            'textarea'
          ),
        ],
      },
      {
        id: 'gestao',
        title: 'Perguntas direcionadas à gestão do contrato',
        questions: [
          q(
            'gestao_alteracao_faturamento',
            'Houve alteração na previsão de faturamento enviado em cronograma?',
            'sim_nao',
            {
              options: ['SIM', 'NÃO'],
              followUp: {
                whenValue: 'SIM',
                type: 'textarea',
                placeholder: 'Alteração de previsão de faturamento',
              },
            }
          ),
          q(
            'gestao_alteracao_custo',
            'Houve alteração na previsão de custos enviado em cronograma?',
            'sim_nao',
            {
              options: ['SIM', 'NÃO'],
              followUp: {
                whenValue: 'SIM',
                type: 'textarea',
                placeholder: 'Alteração de previsão de custo',
              },
            }
          ),
          q('gestao_emissao_nf', 'Já teve emissão de NF esse mês?', 'sim_nao', {
            options: ['SIM', 'NÃO'],
            followUp: { whenValue: 'SIM', type: 'text', placeholder: 'Qual valor?' },
          }),
          q('gestao_producao_semana', 'A produção da semana passada foi preenchida?', 'sim_nao', {
            options: ['SIM', 'NÃO'],
            followUp: {
              whenValue: 'NÃO',
              type: 'textarea',
              placeholder: 'Motivo? Data de regularizar.',
            },
          }),
          q(
            'gestao_problema_relevante',
            'Houve algum problema relevante desde a última reunião?',
            'sim_nao',
            {
              options: ['SIM', 'NÃO'],
              followUp: {
                whenValue: 'SIM',
                type: 'textarea',
                placeholder: 'Qual impacto? Custo, prazo, glosa, outro?',
              },
            }
          ),
          q(
            'gestao_problema_status',
            'Qual status do problema relevante?',
            'pills',
            { options: ['SEM AÇÃO', 'ANDAMENTO', 'RESOLVIDO'] }
          ),
          q(
            'gestao_desempenho_equipe',
            'Como está o desempenho da sua equipe de campo e de escritório? Pretende fazer substituição?',
            'textarea'
          ),
          q('gestao_relacionamento_fiscalizacao', 'Como está o relacionamento com a fiscalização?', 'pills', {
            options: ['BOA', 'RUIM', 'REGULAR'],
          }),
          q('gestao_controle_saldo', 'Como está o controle de saldo do contrato x vigência?', 'textarea'),
          q('gestao_relatar_algo', 'Gostaria de relatar algo?', 'textarea'),
        ],
      },
      {
        id: 'comunicacao',
        title: 'Comunicação e transparência',
        questions: [
          q(
            'com_problema_nao_relatado',
            'Algum problema relevante NÃO foi relatado na reunião e só apareceu depois?',
            'sim_nao',
            { options: ['NÃO', 'SIM'] }
          ),
          q('com_reuniao_produtiva', 'A reunião foi produtiva?', 'sim_nao', {
            options: ['SIM', 'NÃO'],
          }),
          q('com_respostas_estruturadas', 'Os responsáveis levam respostas estruturadas?', 'rating'),
          q('com_exige_atencao_direcao', 'Esse contrato exige atenção ou atuação da direção?', 'sim_nao', {
            options: ['SIM', 'NÃO'],
            required: true,
          }),
        ],
      },
    ],
  };
}

const EMPTY_DATA: ReuniaoData = {
  identificacao: { data: '', responsavelPreenchimento: '', nome: '' },
  answers: {},
  ata: null,
  video: null,
  formTemplate: null,
};

function pickIdentificacaoNome(id: Record<string, unknown> | ReuniaoData['identificacao']): string {
  const raw = id as Record<string, unknown>;
  // Compat: formulários antigos gravavam o nome do contrato em `contrato`
  return String(raw.nome || raw.contrato || '');
}

const TEMPLATE_KEY = 'reunioes/_form-template.json';

/** Normaliza dados antigos (formato fixo) para o formato dinâmico. */
function normalizeReuniaoData(raw: unknown): ReuniaoData {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DATA };
  const obj = raw as Record<string, unknown>;

  if (obj.answers && typeof obj.answers === 'object') {
    const id = (obj.identificacao as ReuniaoData['identificacao']) || EMPTY_DATA.identificacao;
    const formTemplateRaw = obj.formTemplate;
    let formTemplate: ReuniaoData['formTemplate'] = null;
    if (formTemplateRaw && typeof formTemplateRaw === 'object') {
      const ft = formTemplateRaw as {
        id?: string;
        name?: string;
        description?: string;
        multiStepEnabled?: boolean;
        steps?: ReuniaoFormStep[];
        sections?: ReuniaoSection[];
      };
      if (ft.id && Array.isArray(ft.sections)) {
        formTemplate = {
          id: String(ft.id),
          name: String(ft.name || 'Formulário'),
          description: ft.description ? String(ft.description) : undefined,
          multiStepEnabled: ft.multiStepEnabled === true ? true : undefined,
          steps: Array.isArray(ft.steps) ? ft.steps : undefined,
          sections: ft.sections,
        };
      }
    }
    return {
      identificacao: {
        data: id.data || '',
        responsavelPreenchimento: id.responsavelPreenchimento || '',
        nome: pickIdentificacaoNome(id),
      },
      answers: obj.answers as Record<string, ReuniaoAnswer>,
      ata: (obj.ata as ReuniaoAnexoInfo | null) ?? null,
      video: (obj.video as ReuniaoAnexoInfo | null) ?? null,
      formTemplate,
    };
  }

  // Migração do formato antigo (campos fixos)
  const answers: Record<string, ReuniaoAnswer> = {};
  const cronograma = (obj.cronograma || {}) as Record<string, string>;
  const gestao = (obj.gestaoContrato || {}) as Record<string, string>;
  const com = (obj.comunicacao || {}) as Record<string, string | number | null>;

  const mapAnswer = (id: string, value: unknown, followUp?: string) => {
    if (value === undefined || value === null || value === '') return;
    answers[id] = {
      value: value as string | number,
      ...(followUp ? { followUp } : {}),
    };
  };

  mapAnswer('cronograma_pendencia_pagamento', cronograma.pendenciaPagamento, cronograma.pendenciaPagamentoDetalhe);
  mapAnswer('cronograma_pessoas_empreiteiros', cronograma.pessoasEmpreiteiros);
  mapAnswer('cronograma_equipe_executavel', cronograma.equipeExecutavel, cronograma.ajusteNecessario);
  mapAnswer('cronograma_gargalo', cronograma.gargalo);
  mapAnswer('cronograma_situacao_risco', cronograma.situacaoRisco);
  mapAnswer('gestao_alteracao_faturamento', gestao.alteracaoFaturamento, gestao.alteracaoFaturamentoDetalhe);
  mapAnswer('gestao_alteracao_custo', gestao.alteracaoCusto, gestao.alteracaoCustoDetalhe);
  mapAnswer('gestao_emissao_nf', gestao.emissaoNf, gestao.emissaoNfValor);
  mapAnswer('gestao_producao_semana', gestao.producaoSemanaPassada, gestao.producaoSemanaPassadaMotivo);
  mapAnswer('gestao_problema_relevante', gestao.problemaRelevante, gestao.problemaRelevanteImpacto);
  mapAnswer('gestao_problema_status', gestao.problemaRelevanteStatus);
  mapAnswer('gestao_desempenho_equipe', gestao.desempenhoEquipe);
  mapAnswer('gestao_relacionamento_fiscalizacao', gestao.relacionamentoFiscalizacao);
  mapAnswer('gestao_controle_saldo', gestao.controleSaldo);
  mapAnswer('gestao_relatar_algo', gestao.relatarAlgo);
  mapAnswer('com_problema_nao_relatado', com.problemaNaoRelatado);
  mapAnswer('com_reuniao_produtiva', com.reuniaoProdutiva);
  mapAnswer('com_respostas_estruturadas', com.respostasEstruturadasNota);
  mapAnswer('com_exige_atencao_direcao', com.exigeAtencaoDirecao);

  const id = (obj.identificacao as ReuniaoData['identificacao']) || EMPTY_DATA.identificacao;
  return {
    identificacao: {
      data: id.data || '',
      responsavelPreenchimento: id.responsavelPreenchimento || '',
      nome: pickIdentificacaoNome(id),
    },
    answers,
    ata: (obj.ata as ReuniaoAnexoInfo | null) ?? null,
    video: (obj.video as ReuniaoAnexoInfo | null) ?? null,
    formTemplate: null,
  };
}

export class ReuniaoService {
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
    this.localBasePath = path.join(backendUploadsRoot, 'reunioes');
  }

  private scopedBase(contractId: string, kind: ReuniaoKind): string {
    return `reunioes/${contractId}/${kind}`;
  }

  private getIndexKey(contractId: string, kind: ReuniaoKind): string {
    return `${this.scopedBase(contractId, kind)}/index.json`;
  }

  private getLegacyIndexKey(contractId: string): string {
    return `reunioes/${contractId}/index.json`;
  }

  private getReuniaoKey(contractId: string, kind: ReuniaoKind, reuniaoId: string): string {
    return `${this.scopedBase(contractId, kind)}/${reuniaoId}.json`;
  }

  private getLegacyReuniaoKey(contractId: string, reuniaoId: string): string {
    return `reunioes/${contractId}/${reuniaoId}.json`;
  }

  private getConfigKey(contractId: string, kind: ReuniaoKind): string {
    return `${this.scopedBase(contractId, kind)}/config.json`;
  }

  private getLegacyConfigKey(contractId: string): string {
    return `reunioes/${contractId}/config.json`;
  }

  async getContractConfig(
    contractId: string,
    kind: ReuniaoKind,
  ): Promise<ReuniaoContractConfig | null> {
    let raw = await this.readJson<ReuniaoContractConfig>(this.getConfigKey(contractId, kind));
    if (!raw?.formularioId && kind === 'mensal') {
      raw = await this.readJson<ReuniaoContractConfig>(this.getLegacyConfigKey(contractId));
    }
    if (!raw?.formularioId) return null;
    return raw;
  }

  async saveContractConfig(
    contractId: string,
    kind: ReuniaoKind,
    formularioId: string,
  ): Promise<ReuniaoContractConfig> {
    const id = String(formularioId || '').trim();
    if (!id) throw new Error('Selecione um formulário.');

    const { FormularioTemplateService } = await import('./FormularioTemplateService');
    const formService = new FormularioTemplateService();
    const tpl = await formService.get(id);
    if (!tpl) throw new Error('Formulário não encontrado.');

    const config: ReuniaoContractConfig = {
      formularioId: tpl.id,
      formularioName: tpl.name,
      updatedAt: new Date().toISOString(),
    };
    await this.writeJson(this.getConfigKey(contractId, kind), config);
    return config;
  }

  /** Abre ou cria o preenchimento do período corrente (mês ou quinzena). */
  async ensurePeriodoAtual(contractId: string, kind: ReuniaoKind): Promise<ReuniaoIndexEntry> {
    const config = await this.getContractConfig(contractId, kind);
    if (!config?.formularioId) {
      throw new Error(
        kind === 'mensal'
          ? 'Configure o formulário de relatório mensal antes de preencher.'
          : 'Configure o formulário de reunião quinzenal antes de preencher.',
      );
    }

    if (kind === 'mensal') {
      const monthKey = getIsoMonthKey();
      const idx = await this.getIndex(contractId, kind);
      const existing = idx.reunioes.find((row) => row.monthKey === monthKey);
      if (existing) return existing;

      return this.createReuniao(contractId, kind, {
        formularioId: config.formularioId,
        monthKey,
        nome: formatMonthLabel(monthKey),
      });
    }

    const weekKey = getFortnightKey();
    const idx = await this.getIndex(contractId, kind);
    const existing = idx.reunioes.find((row) => row.weekKey === weekKey);
    if (existing) return existing;

    return this.createReuniao(contractId, kind, {
      formularioId: config.formularioId,
      weekKey,
      nome: formatWeekLabel(weekKey),
    });
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

  // ---- Template do formulário ----

  async getTemplate(): Promise<ReuniaoTemplate> {
    const tpl = await this.readJson<ReuniaoTemplate>(TEMPLATE_KEY);
    if (tpl?.sections?.length) return tpl;
    const def = buildDefaultTemplate();
    await this.writeJson(TEMPLATE_KEY, def);
    return def;
  }

  async saveTemplate(template: ReuniaoTemplate): Promise<ReuniaoTemplate> {
    if (!template?.sections || !Array.isArray(template.sections)) {
      throw new Error('Template inválido.');
    }
    const cleaned: ReuniaoTemplate = {
      updatedAt: new Date().toISOString(),
      sections: template.sections.map((s) => ({
        id: s.id || randomUUID(),
        title: (s.title || '').trim() || 'Nova seção',
        description: s.description?.trim() || undefined,
        questions: (s.questions || []).map((qItem) => ({
          id: qItem.id || randomUUID(),
          title: (qItem.title || '').trim() || 'Nova pergunta',
          type: qItem.type || 'textarea',
          options: qItem.options,
          required: !!qItem.required,
          placeholder: qItem.placeholder,
          followUp: qItem.followUp || null,
        })),
      })),
    };
    await this.writeJson(TEMPLATE_KEY, cleaned);
    return cleaned;
  }

  async resetTemplate(): Promise<ReuniaoTemplate> {
    const def = buildDefaultTemplate();
    await this.writeJson(TEMPLATE_KEY, def);
    return def;
  }

  // ---- Reuniões ----

  async getIndex(contractId: string, kind: ReuniaoKind): Promise<ReuniaoIndex> {
    let idx = await this.readJson<ReuniaoIndex>(this.getIndexKey(contractId, kind));
    if (!idx?.reunioes?.length && kind === 'mensal') {
      idx = await this.readJson<ReuniaoIndex>(this.getLegacyIndexKey(contractId));
    }
    if (!idx) return { reunioes: [] };
    return {
      reunioes: (idx.reunioes || []).map((r) => {
        const raw = r as ReuniaoIndexEntry & { contrato?: string };
        return {
          ...raw,
          nome: raw.nome || raw.contrato || '',
          formularioName: raw.formularioName || '',
          formularioDescription: raw.formularioDescription || '',
        };
      }),
    };
  }

  /** Lista com enriquecimento do nome/descrição do formulário quando faltar no índice. */
  async listReunioes(contractId: string, kind: ReuniaoKind): Promise<ReuniaoIndexEntry[]> {
    const idx = await this.getIndex(contractId, kind);
    let dirty = false;
    for (const entry of idx.reunioes) {
      if (entry.formularioName) continue;
      try {
        const data = await this.getReuniao(contractId, kind, entry.id);
        if (data?.formTemplate?.name) {
          entry.formularioName = data.formTemplate.name;
          entry.formularioDescription = data.formTemplate.description || '';
          dirty = true;
        }
      } catch {
        /* ignora */
      }
    }
    if (dirty) {
      await this.writeJson(this.getIndexKey(contractId, kind), idx);
    }
    return idx.reunioes;
  }

  private reuniaoDataLooksSubmitted(data: ReuniaoData): boolean {
    if (data.identificacao?.responsavelPreenchimento?.trim()) return true;
    if (data.ata?.key || data.video?.key) return true;
    const answers = data.answers || {};
    for (const key of Object.keys(answers)) {
      const answer = answers[key];
      if (!answer) continue;
      const value = answer.value;
      if (value !== null && value !== undefined && value !== '') return true;
      if (answer.followUp?.trim()) return true;
    }
    return false;
  }

  private async isEntrySubmitted(
    contractId: string,
    kind: ReuniaoKind,
    entry: ReuniaoIndexEntry,
  ): Promise<boolean> {
    if (entry.submittedAt) return true;
    if (entry.responsavelPreenchimento?.trim()) return true;
    const data = await this.getReuniao(contractId, kind, entry.id);
    return data ? this.reuniaoDataLooksSubmitted(data) : false;
  }

  private async buildOverviewEntryFields(
    contractId: string,
    kind: ReuniaoKind,
    entry: ReuniaoIndexEntry | undefined,
    hasForm: boolean,
  ): Promise<{
    status: MensalReportStatus;
    entryId?: string;
    responsavelPreenchimento?: string;
    updatedAt?: string;
  }> {
    if (!hasForm) return { status: 'sem_formulario' };
    if (!entry) return { status: 'pendente' };

    const submitted = await this.isEntrySubmitted(contractId, kind, entry);
    return {
      status: submitted ? 'preenchido' : 'pendente',
      entryId: entry.id,
      responsavelPreenchimento: submitted ? entry.responsavelPreenchimento || undefined : undefined,
      updatedAt: submitted ? entry.submittedAt || entry.updatedAt : undefined,
    };
  }

  async getMensalOverviewRow(
    contract: {
      id: string;
      name: string;
      number: string;
      costCenter?: { code: string } | null;
    },
    monthKey: string,
  ): Promise<MensalOverviewRow> {
    const config = await this.getContractConfig(contract.id, 'mensal');
    const idx = await this.getIndex(contract.id, 'mensal');
    const entry = idx.reunioes.find((row) => row.monthKey === monthKey);
    const overview = await this.buildOverviewEntryFields(
      contract.id,
      'mensal',
      entry,
      Boolean(config?.formularioId),
    );

    return {
      contractId: contract.id,
      contractName: contract.name,
      contractNumber: contract.number,
      costCenterCode: contract.costCenter?.code || undefined,
      formularioId: config?.formularioId,
      formularioName: config?.formularioName,
      monthKey,
      status: overview.status,
      entryId: overview.entryId,
      responsavelPreenchimento: overview.responsavelPreenchimento,
      updatedAt: overview.updatedAt,
      totalRegistros: idx.reunioes.length,
    };
  }

  async getSemanalOverviewRow(
    contract: {
      id: string;
      name: string;
      number: string;
      costCenter?: { code: string } | null;
    },
    weekKey: string,
  ): Promise<SemanalOverviewRow> {
    const config = await this.getContractConfig(contract.id, 'semanal');
    const idx = await this.getIndex(contract.id, 'semanal');
    const entry = idx.reunioes.find((row) => row.weekKey === weekKey);
    const overview = await this.buildOverviewEntryFields(
      contract.id,
      'semanal',
      entry,
      Boolean(config?.formularioId),
    );

    return {
      contractId: contract.id,
      contractName: contract.name,
      contractNumber: contract.number,
      costCenterCode: contract.costCenter?.code || undefined,
      formularioId: config?.formularioId,
      formularioName: config?.formularioName,
      weekKey,
      status: overview.status,
      entryId: overview.entryId,
      responsavelPreenchimento: overview.responsavelPreenchimento,
      updatedAt: overview.updatedAt,
      totalRegistros: idx.reunioes.length,
    };
  }

  async createReuniao(
    contractId: string,
    kind: ReuniaoKind,
    opts: { formularioId: string; weekKey?: string; monthKey?: string; nome?: string },
  ): Promise<ReuniaoIndexEntry> {
    const formularioId = String(opts.formularioId || '').trim();
    if (!formularioId) {
      throw new Error('Selecione um formulário.');
    }

    const { FormularioTemplateService } = await import('./FormularioTemplateService');
    const formService = new FormularioTemplateService();
    const tpl = await formService.get(formularioId);
    if (!tpl) {
      throw new Error('Formulário não encontrado.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const weekKey = opts.weekKey?.trim() || undefined;
    const monthKey = opts.monthKey?.trim() || undefined;
    const entry: ReuniaoIndexEntry = {
      id,
      data: '',
      responsavelPreenchimento: '',
      nome:
        opts.nome?.trim() ||
        (monthKey ? formatMonthLabel(monthKey) : weekKey ? formatWeekLabel(weekKey) : ''),
      monthKey,
      weekKey,
      formularioName: tpl.name || '',
      formularioDescription: tpl.description || '',
      createdAt: now,
      updatedAt: now,
    };

    const initial: ReuniaoData = {
      ...EMPTY_DATA,
      identificacao: {
        ...EMPTY_DATA.identificacao,
        nome: entry.nome,
      },
      formTemplate: {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        multiStepEnabled: tpl.multiStepEnabled,
        steps: tpl.steps,
        sections: tpl.sections as ReuniaoSection[],
      },
    };

    const idx = await this.getIndex(contractId, kind);
    idx.reunioes.unshift(entry);
    await this.writeJson(this.getIndexKey(contractId, kind), idx);
    await this.writeJson(this.getReuniaoKey(contractId, kind, id), initial);

    return entry;
  }

  async getReuniao(
    contractId: string,
    kind: ReuniaoKind,
    reuniaoId: string,
  ): Promise<ReuniaoData | null> {
    let raw = await this.readJson<unknown>(this.getReuniaoKey(contractId, kind, reuniaoId));
    if (!raw && kind === 'mensal') {
      raw = await this.readJson<unknown>(this.getLegacyReuniaoKey(contractId, reuniaoId));
    }
    if (!raw) return null;
    const data = normalizeReuniaoData(raw);
    if (data.ata?.key) data.ata = { ...data.ata, url: await this.getAnexoUrl(data.ata.key) };
    if (data.video?.key) data.video = { ...data.video, url: await this.getAnexoUrl(data.video.key) };
    return data;
  }

  async saveReuniao(
    contractId: string,
    kind: ReuniaoKind,
    reuniaoId: string,
    data: ReuniaoData,
    opts?: { finalize?: boolean },
  ): Promise<void> {
    const normalized = normalizeReuniaoData(data);
    await this.writeJson(this.getReuniaoKey(contractId, kind, reuniaoId), normalized);

    const idx = await this.getIndex(contractId, kind);
    const entry = idx.reunioes.find((r) => r.id === reuniaoId);
    if (entry) {
      const now = new Date().toISOString();
      entry.updatedAt = now;
      entry.data = normalized.identificacao?.data || '';
      entry.responsavelPreenchimento = normalized.identificacao?.responsavelPreenchimento || '';
      if (opts?.finalize) {
        entry.submittedAt = now;
      }
      if (!entry.weekKey && !entry.monthKey) {
        entry.nome = normalized.identificacao?.nome || entry.nome;
      }
      if (normalized.formTemplate?.name) {
        entry.formularioName = normalized.formTemplate.name;
        entry.formularioDescription = normalized.formTemplate.description || '';
      }
      await this.writeJson(this.getIndexKey(contractId, kind), idx);
    }
  }

  async deleteReuniao(contractId: string, kind: ReuniaoKind, reuniaoId: string): Promise<void> {
    const existing = await this.getReuniao(contractId, kind, reuniaoId);
    if (existing?.ata?.key) await this.deleteAnexoFile(existing.ata.key).catch(() => {});
    if (existing?.video?.key) await this.deleteAnexoFile(existing.video.key).catch(() => {});

    await this.deleteKey(this.getReuniaoKey(contractId, kind, reuniaoId));

    const idx = await this.getIndex(contractId, kind);
    idx.reunioes = idx.reunioes.filter((r) => r.id !== reuniaoId);
    await this.writeJson(this.getIndexKey(contractId, kind), idx);
  }

  // ---- Anexos ----

  private getAnexoExtension(originalName: string, mimetype: string): string {
    const extFromName = path.extname(originalName || '').replace('.', '');
    if (extFromName) return extFromName.toLowerCase();
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };
    return map[mimetype] || 'bin';
  }

  async uploadAnexo(
    contractId: string,
    kind: ReuniaoKind,
    reuniaoId: string,
    tipo: 'ata' | 'video',
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number }
  ): Promise<ReuniaoAnexoInfo> {
    const ext = this.getAnexoExtension(file.originalname, file.mimetype);
    const fileName = `${tipo}-${randomUUID()}.${ext}`;
    const now = new Date().toISOString();

    if (this.useLocal || !this.s3) {
      const relativeDir = path.join('reunioes', contractId, kind, reuniaoId);
      const absoluteDir = path.join(backendUploadsRoot, relativeDir);
      fs.mkdirSync(absoluteDir, { recursive: true });
      fs.writeFileSync(path.join(absoluteDir, fileName), file.buffer);
      const key = path.join(relativeDir, fileName).replace(/\\/g, '/');
      return {
        key,
        url: `/uploads/${key}`,
        originalName: file.originalname || fileName,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size || file.buffer.length,
        uploadedAt: now,
      };
    }

    const key = `reunioes-anexos/${contractId}/${reuniaoId}/${fileName}`;
    await this.s3
      .upload({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        ACL: 'private',
      })
      .promise();

    return {
      key,
      url: await this.getAnexoUrl(key),
      originalName: file.originalname || fileName,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size || file.buffer.length,
      uploadedAt: now,
    };
  }

  async getAnexoUrl(key: string): Promise<string> {
    if (this.useLocal || !this.s3) {
      return `/uploads/${key}`;
    }
    return this.s3.getSignedUrlPromise('getObject', { Bucket: this.bucketName, Key: key, Expires: 3600 });
  }

  async deleteAnexoFile(key: string): Promise<void> {
    if (this.useLocal || !this.s3) {
      const filePath = path.join(backendUploadsRoot, key);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    }
    await this.s3!.deleteObject({ Bucket: this.bucketName, Key: key }).promise();
  }
}
