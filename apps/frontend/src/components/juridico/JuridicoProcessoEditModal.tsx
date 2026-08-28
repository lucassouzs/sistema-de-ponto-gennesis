'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
} from '@/lib/maskCurrencyBr';
import api from '@/lib/api';
import { JURIDICO_CONTRATOS, resolveContratoNome } from '@/data/juridico-contratos';
import { parseBrDate } from '@/data/juridico-processos-dashboard';
import type { JuridicoProcesso } from '@/data/juridico-processos-ativos';

type Props = {
  isOpen: boolean;
  processoId?: string | null;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSaved?: (processo: JuridicoProcesso) => void;
};

type FormState = {
  reclamante: string;
  numeroProcesso: string;
  tribunal: string;
  vara: string;
  polo: string;
  empresa: string;
  contrato: string;
  funcao: string;
  regimeContratacao: string;
  presencial: string;
  status: string;
  statusProcesso: string;
  acordo: string;
  statusSentenca: string;
  dataAbertura: string;
  dataAudiencia: string;
  horario: string;
  dataAcordo: string;
  periodo: string;
  periodoInicio: string;
  periodoFim: string;
  representanteAutor: string;
  decisaoStf: string;
  agravoInstrumento: string;
  objeto: string;
  objeto2: string;
  valorCausa: string;
  valorSentenca: string;
  valorAcordo: string;
  valorPago: string;
  valorParcela: string;
  numParcelas: string;
  valorRO: string;
  valorRR: string;
  valorCustas: string;
  custas: string;
  previdencia: string;
  outrosGastos: string;
  valorPagoSentenciado: string;
};

const EMPTY_FORM: FormState = {
  reclamante: '',
  numeroProcesso: '',
  tribunal: '',
  vara: '',
  polo: '',
  empresa: '',
  contrato: '',
  funcao: '',
  regimeContratacao: '',
  presencial: '',
  status: '',
  statusProcesso: '',
  acordo: '',
  statusSentenca: '',
  dataAbertura: '',
  dataAudiencia: '',
  horario: '',
  dataAcordo: '',
  periodo: '',
  periodoInicio: '',
  periodoFim: '',
  representanteAutor: '',
  decisaoStf: '',
  agravoInstrumento: '',
  objeto: '',
  objeto2: '',
  valorCausa: '',
  valorSentenca: '',
  valorAcordo: '',
  valorPago: '',
  valorParcela: '',
  numParcelas: '',
  valorRO: '',
  valorRR: '',
  valorCustas: '',
  custas: '',
  previdencia: '',
  outrosGastos: '',
  valorPagoSentenciado: '',
};

const STATUS_OPTIONS = [
  'ARQUIVADO',
  'ANDAMENTO PROCESSUAL',
  'AUDIÊNCIA INSTRUÇÃO',
  'AUDIÊNCIA INICIAL',
  'SUSPENSO',
  'AGUARDANDO ARQUIVAMENTO',
  'ACORDO',
];

const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const textareaClass =
  'min-h-[72px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const DATE_FIELDS: Array<keyof FormState> = [
  'dataAbertura',
  'dataAudiencia',
  'dataAcordo',
  'periodoInicio',
  'periodoFim',
];

function dateToPickerValue(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = parseBrDate(raw);
  if (!parsed) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromPickerValue(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function moneyToInput(value: string | number | null | undefined): string {
  return formatCurrencyInputBrFromNumber(value);
}

function textToInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function processoToForm(processo: JuridicoProcesso): FormState {
  return {
    reclamante: textToInput(processo.reclamante),
    numeroProcesso: textToInput(processo.numeroProcesso),
    tribunal: textToInput(processo.tribunal),
    vara: textToInput(processo.vara),
    polo: textToInput(processo.polo),
    empresa: textToInput(processo.empresa),
    contrato: textToInput(processo.contrato),
    funcao: textToInput(processo.funcao),
    regimeContratacao: textToInput(processo.regimeContratacao),
    presencial: textToInput(processo.presencial),
    status: textToInput(processo.status),
    statusProcesso: textToInput(processo.statusProcesso),
    acordo: textToInput(processo.acordo),
    statusSentenca: textToInput(processo.statusSentenca),
    dataAbertura: dateToPickerValue(processo.dataAbertura),
    dataAudiencia: dateToPickerValue(processo.dataAudiencia),
    horario: textToInput(processo.horario),
    dataAcordo: dateToPickerValue(processo.dataAcordo),
    periodo: textToInput(processo.periodo),
    periodoInicio: dateToPickerValue(processo.periodoInicio),
    periodoFim: dateToPickerValue(processo.periodoFim),
    representanteAutor: textToInput(processo.representanteAutor),
    decisaoStf: textToInput(processo.decisaoStf),
    agravoInstrumento: textToInput(processo.agravoInstrumento),
    objeto: textToInput(processo.objeto),
    objeto2: textToInput(processo.objeto2),
    valorCausa: moneyToInput(processo.valorCausa),
    valorSentenca: moneyToInput(processo.valorSentenca),
    valorAcordo: moneyToInput(processo.valorAcordo),
    valorPago: moneyToInput(processo.valorPago),
    valorParcela: moneyToInput(processo.valorParcela),
    numParcelas: textToInput(processo.numParcelas),
    valorRO: moneyToInput(processo.valorRO),
    valorRR: moneyToInput(processo.valorRR),
    valorCustas: moneyToInput(processo.valorCustas),
    custas: moneyToInput(processo.custas),
    previdencia: moneyToInput(processo.previdencia),
    outrosGastos: moneyToInput(processo.outrosGastos),
    valorPagoSentenciado: moneyToInput(processo.valorPagoSentenciado),
  };
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`min-w-0 space-y-1.5 ${className || ''}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className={inputClass}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function MoneyInput({
  value,
  onChange,
  placeholder = 'R$ 0,00',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(maskCurrencyInputBrOrEmpty(e.target.value))}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function JuridicoProcessoEditModal({
  isOpen,
  processoId,
  mode = 'edit',
  onClose,
  onSaved,
}: Props) {
  const isCreate = mode === 'create';
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['juridico-processos', processoId, 'edit'],
    enabled: isOpen && !isCreate && !!processoId,
    queryFn: async () => {
      const res = await api.get(`/juridico-processos/${processoId}`);
      return res.data?.data as JuridicoProcesso;
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setForm(EMPTY_FORM);
      setDirty(false);
      setSaving(false);
      return;
    }
    if (isCreate) {
      setForm(EMPTY_FORM);
      setDirty(false);
      return;
    }
    if (data) {
      setForm(processoToForm(data));
      setDirty(false);
    }
  }, [isOpen, isCreate, data]);

  const contratoOptions = useMemo(() => {
    const options = Object.entries(JURIDICO_CONTRATOS).map(([value, label]) => ({
      value,
      label,
      searchText: `${value} ${label}`,
    }));
    const current = form.contrato.trim();
    if (current && !options.some((o) => o.value === current)) {
      options.unshift({
        value: current,
        label: resolveContratoNome(current) || current,
        searchText: current,
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [form.contrato]);

  const setField =
    (key: keyof FormState) =>
    (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    };

  const handleSave = async () => {
    if (!isCreate && !processoId) return;
    if (!form.reclamante.trim()) {
      toast.error('Informe o reclamante.');
      return;
    }
    if (!form.numeroProcesso.trim()) {
      toast.error('Informe o número do processo.');
      return;
    }

    setSaving(true);
    try {
      const payload: FormState = { ...form };
      for (const key of DATE_FIELDS) {
        payload[key] = dateFromPickerValue(form[key]);
      }

      const res = isCreate
        ? await api.post('/juridico-processos', payload)
        : await api.put(`/juridico-processos/${processoId}`, payload);
      const saved = res.data?.data as JuridicoProcesso;
      toast.success(
        res.data?.message ||
          (isCreate ? 'Processo cadastrado com sucesso.' : 'Processo atualizado com sucesso.'),
      );
      setDirty(false);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        'Não foi possível salvar o processo.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const title = isCreate
    ? 'Novo processo'
    : data?.numeroProcesso
      ? `Editar processo ${data.numeroProcesso}`
      : 'Editar processo';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="2xl"
      contentOverflowVisible
      confirmBeforeClose={dirty && !saving}
      confirmCloseMessage="Há alterações não salvas. Deseja sair sem salvar?"
    >
      {isLoading && !isCreate ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando processo…
        </div>
      ) : isError && !isCreate ? (
        <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-300">
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Não foi possível carregar o processo.'}
        </p>
      ) : (
        <div className="space-y-6">
          <Section title="Identificação">
            <Field label="Reclamante" className="sm:col-span-2">
              <TextInput
                value={form.reclamante}
                onChange={setField('reclamante')}
                placeholder="Nome do reclamante"
              />
            </Field>
            <Field label="Nº Processo">
              <TextInput
                value={form.numeroProcesso}
                onChange={setField('numeroProcesso')}
                placeholder="Ex: 0001234-12.2024.5.03.0001"
              />
            </Field>
            <Field label="Tribunal">
              <TextInput
                value={form.tribunal}
                onChange={setField('tribunal')}
                placeholder="Ex: TRT-3"
              />
            </Field>
            <Field label="Vara">
              <TextInput
                value={form.vara}
                onChange={setField('vara')}
                placeholder="Ex: 1ª Vara do Trabalho"
              />
            </Field>
            <Field label="Polo">
              <TextInput
                value={form.polo}
                onChange={setField('polo')}
                placeholder="Ex: Passivo"
              />
            </Field>
            <Field label="Empresa">
              <TextInput
                value={form.empresa}
                onChange={setField('empresa')}
                placeholder="Ex: GENNESIS"
              />
            </Field>
            <Field label="Contrato">
              <StringSingleSelectDropdown
                value={form.contrato}
                onChange={setField('contrato')}
                options={contratoOptions}
                placeholder="Selecionar contrato"
                emptyOptionLabel="Sem contrato"
                matchTriggerWidth
              />
            </Field>
            <Field label="Função">
              <TextInput
                value={form.funcao}
                onChange={setField('funcao')}
                placeholder="Ex: Pedreiro"
              />
            </Field>
            <Field label="Regime">
              <TextInput
                value={form.regimeContratacao}
                onChange={setField('regimeContratacao')}
                placeholder="Ex: CLT"
              />
            </Field>
            <Field label="Presencial">
              <TextInput
                value={form.presencial}
                onChange={setField('presencial')}
                placeholder="Ex: Sim, Não ou Remoto"
              />
            </Field>
            <Field label="Representante do autor" className="sm:col-span-2">
              <TextInput
                value={form.representanteAutor}
                onChange={setField('representanteAutor')}
                placeholder="Nome do advogado ou representante"
              />
            </Field>
          </Section>

          <Section title="Status e datas">
            <Field label="Status">
              <StringSingleSelectDropdown
                value={form.status}
                onChange={setField('status')}
                options={STATUS_OPTIONS}
                placeholder="Selecionar"
                emptyOptionLabel="Sem status"
                disableSearch
                matchTriggerWidth
              />
            </Field>
            <Field label="Acordo">
              <StringSingleSelectDropdown
                value={form.acordo}
                onChange={setField('acordo')}
                options={['SIM', 'NÃO']}
                placeholder="Selecionar"
                emptyOptionLabel="—"
                disableSearch
                matchTriggerWidth
              />
            </Field>
            <Field label="Status da sentença">
              <TextInput
                value={form.statusSentenca}
                onChange={setField('statusSentenca')}
                placeholder="Ex: Procedente parcial"
              />
            </Field>
            <Field label="Status processo" className="sm:col-span-2 lg:col-span-3">
              <TextInput
                value={form.statusProcesso}
                onChange={setField('statusProcesso')}
                placeholder="Descrição do andamento processual"
              />
            </Field>
            <Field label="Data da abertura">
              <DatePickerField
                value={form.dataAbertura}
                onChange={setField('dataAbertura')}
                placeholder="dd/mm/aaaa"
                className="w-full"
                aria-label="Data da abertura"
              />
            </Field>
            <Field label="Data audiência">
              <DatePickerField
                value={form.dataAudiencia}
                onChange={setField('dataAudiencia')}
                placeholder="dd/mm/aaaa"
                className="w-full"
                aria-label="Data audiência"
              />
            </Field>
            <Field label="Horário">
              <TimePickerField
                value={form.horario}
                onChange={setField('horario')}
                placeholder="Selecionar horário"
                className="w-full"
                allowEmpty
                aria-label="Horário da audiência"
              />
            </Field>
            <Field label="Data do acordo">
              <DatePickerField
                value={form.dataAcordo}
                onChange={setField('dataAcordo')}
                placeholder="dd/mm/aaaa"
                className="w-full"
                aria-label="Data do acordo"
              />
            </Field>
            <Field label="Período">
              <TextInput
                value={form.periodo}
                onChange={setField('periodo')}
                placeholder="Ex: 12 meses"
              />
            </Field>
            <Field label="Início trabalhado">
              <DatePickerField
                value={form.periodoInicio}
                onChange={setField('periodoInicio')}
                placeholder="dd/mm/aaaa"
                className="w-full"
                aria-label="Início trabalhado"
              />
            </Field>
            <Field label="Fim trabalhado">
              <DatePickerField
                value={form.periodoFim}
                onChange={setField('periodoFim')}
                placeholder="dd/mm/aaaa"
                className="w-full"
                aria-label="Fim trabalhado"
              />
            </Field>
          </Section>

          <Section title="Valores">
            <Field label="Valor da causa">
              <MoneyInput value={form.valorCausa} onChange={setField('valorCausa')} />
            </Field>
            <Field label="Valor sentença">
              <MoneyInput value={form.valorSentenca} onChange={setField('valorSentenca')} />
            </Field>
            <Field label="Valor do acordo">
              <MoneyInput value={form.valorAcordo} onChange={setField('valorAcordo')} />
            </Field>
            <Field label="Valor pago">
              <MoneyInput value={form.valorPago} onChange={setField('valorPago')} />
            </Field>
            <Field label="Valor da parcela">
              <MoneyInput value={form.valorParcela} onChange={setField('valorParcela')} />
            </Field>
            <Field label="Nº parcelas">
              <TextInput
                value={form.numParcelas}
                onChange={setField('numParcelas')}
                placeholder="Ex: 6"
              />
            </Field>
            <Field label="Valor de RO">
              <MoneyInput value={form.valorRO} onChange={setField('valorRO')} />
            </Field>
            <Field label="Valor de RR">
              <MoneyInput value={form.valorRR} onChange={setField('valorRR')} />
            </Field>
            <Field label="Valor custas">
              <MoneyInput value={form.valorCustas} onChange={setField('valorCustas')} />
            </Field>
            <Field label="Custas">
              <MoneyInput value={form.custas} onChange={setField('custas')} />
            </Field>
            <Field label="Previdência">
              <MoneyInput value={form.previdencia} onChange={setField('previdencia')} />
            </Field>
            <Field label="Outros gastos / honorários">
              <MoneyInput value={form.outrosGastos} onChange={setField('outrosGastos')} />
            </Field>
            <Field label="Valor pago sentenciado">
              <MoneyInput
                value={form.valorPagoSentenciado}
                onChange={setField('valorPagoSentenciado')}
              />
            </Field>
          </Section>

          <Section title="Objetos e observações">
            <Field label="Objeto" className="sm:col-span-2 lg:col-span-3">
              <textarea
                className={textareaClass}
                value={form.objeto}
                placeholder="Descreva o objeto principal do processo"
                onChange={(e) => setField('objeto')(e.target.value)}
              />
            </Field>
            <Field label="Objetos vinculados" className="sm:col-span-2 lg:col-span-3">
              <textarea
                className={textareaClass}
                value={form.objeto2}
                placeholder="Outros objetos ou pedidos vinculados"
                onChange={(e) => setField('objeto2')(e.target.value)}
              />
            </Field>
            <Field label="Decisão do STF" className="sm:col-span-2">
              <TextInput
                value={form.decisaoStf}
                onChange={setField('decisaoStf')}
                placeholder="Ex: Não aplicável"
              />
            </Field>
            <Field label="Agravo de instrumento">
              <TextInput
                value={form.agravoInstrumento}
                onChange={setField('agravoInstrumento')}
                placeholder="Ex: Sim ou Não"
              />
            </Field>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isCreate ? 'Cadastrar processo' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
