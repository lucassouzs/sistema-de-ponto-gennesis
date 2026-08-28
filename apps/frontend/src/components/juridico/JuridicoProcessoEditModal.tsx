'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import api from '@/lib/api';
import { JURIDICO_CONTRATOS, resolveContratoNome } from '@/data/juridico-contratos';
import type { JuridicoProcesso } from '@/data/juridico-processos-ativos';

type Props = {
  isOpen: boolean;
  processoId: string | null;
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

function moneyToInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return String(value);
  return String(n);
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
    dataAbertura: textToInput(processo.dataAbertura),
    dataAudiencia: textToInput(processo.dataAudiencia),
    horario: textToInput(processo.horario),
    dataAcordo: textToInput(processo.dataAcordo),
    periodo: textToInput(processo.periodo),
    periodoInicio: textToInput(processo.periodoInicio),
    periodoFim: textToInput(processo.periodoFim),
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function JuridicoProcessoEditModal({ isOpen, processoId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['juridico-processos', processoId, 'edit'],
    enabled: isOpen && !!processoId,
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
    if (data) {
      setForm(processoToForm(data));
      setDirty(false);
    }
  }, [isOpen, data]);

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
    if (!processoId) return;
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
      const res = await api.put(`/juridico-processos/${processoId}`, form);
      const updated = res.data?.data as JuridicoProcesso;
      toast.success(res.data?.message || 'Processo atualizado com sucesso.');
      setDirty(false);
      onSaved?.(updated);
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

  const title = data?.numeroProcesso
    ? `Editar processo ${data.numeroProcesso}`
    : 'Editar processo';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="2xl"
      confirmBeforeClose={dirty && !saving}
      confirmCloseMessage="Há alterações não salvas. Deseja sair sem salvar?"
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando processo…
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-300">
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Não foi possível carregar o processo.'}
        </p>
      ) : (
        <div className="space-y-6">
          <Section title="Identificação">
            <Field label="Reclamante" className="sm:col-span-2">
              <input
                className={inputClass}
                value={form.reclamante}
                onChange={(e) => setField('reclamante')(e.target.value)}
              />
            </Field>
            <Field label="Nº Processo">
              <input
                className={inputClass}
                value={form.numeroProcesso}
                onChange={(e) => setField('numeroProcesso')(e.target.value)}
              />
            </Field>
            <Field label="Tribunal">
              <input
                className={inputClass}
                value={form.tribunal}
                onChange={(e) => setField('tribunal')(e.target.value)}
              />
            </Field>
            <Field label="Vara">
              <input
                className={inputClass}
                value={form.vara}
                onChange={(e) => setField('vara')(e.target.value)}
              />
            </Field>
            <Field label="Polo">
              <input
                className={inputClass}
                value={form.polo}
                onChange={(e) => setField('polo')(e.target.value)}
              />
            </Field>
            <Field label="Empresa">
              <input
                className={inputClass}
                value={form.empresa}
                onChange={(e) => setField('empresa')(e.target.value)}
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
              <input
                className={inputClass}
                value={form.funcao}
                onChange={(e) => setField('funcao')(e.target.value)}
              />
            </Field>
            <Field label="Regime">
              <input
                className={inputClass}
                value={form.regimeContratacao}
                onChange={(e) => setField('regimeContratacao')(e.target.value)}
              />
            </Field>
            <Field label="Presencial">
              <input
                className={inputClass}
                value={form.presencial}
                onChange={(e) => setField('presencial')(e.target.value)}
              />
            </Field>
            <Field label="Representante do autor" className="sm:col-span-2">
              <input
                className={inputClass}
                value={form.representanteAutor}
                onChange={(e) => setField('representanteAutor')(e.target.value)}
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
              <input
                className={inputClass}
                value={form.statusSentenca}
                onChange={(e) => setField('statusSentenca')(e.target.value)}
              />
            </Field>
            <Field label="Status processo" className="sm:col-span-2 lg:col-span-3">
              <input
                className={inputClass}
                value={form.statusProcesso}
                onChange={(e) => setField('statusProcesso')(e.target.value)}
              />
            </Field>
            <Field label="Data da abertura">
              <input
                className={inputClass}
                placeholder="dd/mm/aaaa"
                value={form.dataAbertura}
                onChange={(e) => setField('dataAbertura')(e.target.value)}
              />
            </Field>
            <Field label="Data audiência">
              <input
                className={inputClass}
                placeholder="dd/mm/aaaa"
                value={form.dataAudiencia}
                onChange={(e) => setField('dataAudiencia')(e.target.value)}
              />
            </Field>
            <Field label="Horário">
              <input
                className={inputClass}
                value={form.horario}
                onChange={(e) => setField('horario')(e.target.value)}
              />
            </Field>
            <Field label="Data do acordo">
              <input
                className={inputClass}
                placeholder="dd/mm/aaaa"
                value={form.dataAcordo}
                onChange={(e) => setField('dataAcordo')(e.target.value)}
              />
            </Field>
            <Field label="Período">
              <input
                className={inputClass}
                value={form.periodo}
                onChange={(e) => setField('periodo')(e.target.value)}
              />
            </Field>
            <Field label="Início trabalhado">
              <input
                className={inputClass}
                placeholder="dd/mm/aaaa"
                value={form.periodoInicio}
                onChange={(e) => setField('periodoInicio')(e.target.value)}
              />
            </Field>
            <Field label="Fim trabalhado">
              <input
                className={inputClass}
                placeholder="dd/mm/aaaa"
                value={form.periodoFim}
                onChange={(e) => setField('periodoFim')(e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Valores">
            <Field label="Valor da causa">
              <input
                className={inputClass}
                value={form.valorCausa}
                onChange={(e) => setField('valorCausa')(e.target.value)}
              />
            </Field>
            <Field label="Valor sentença">
              <input
                className={inputClass}
                value={form.valorSentenca}
                onChange={(e) => setField('valorSentenca')(e.target.value)}
              />
            </Field>
            <Field label="Valor do acordo">
              <input
                className={inputClass}
                value={form.valorAcordo}
                onChange={(e) => setField('valorAcordo')(e.target.value)}
              />
            </Field>
            <Field label="Valor pago">
              <input
                className={inputClass}
                value={form.valorPago}
                onChange={(e) => setField('valorPago')(e.target.value)}
              />
            </Field>
            <Field label="Valor da parcela">
              <input
                className={inputClass}
                value={form.valorParcela}
                onChange={(e) => setField('valorParcela')(e.target.value)}
              />
            </Field>
            <Field label="Nº parcelas">
              <input
                className={inputClass}
                value={form.numParcelas}
                onChange={(e) => setField('numParcelas')(e.target.value)}
              />
            </Field>
            <Field label="Valor de RO">
              <input
                className={inputClass}
                value={form.valorRO}
                onChange={(e) => setField('valorRO')(e.target.value)}
              />
            </Field>
            <Field label="Valor de RR">
              <input
                className={inputClass}
                value={form.valorRR}
                onChange={(e) => setField('valorRR')(e.target.value)}
              />
            </Field>
            <Field label="Valor custas">
              <input
                className={inputClass}
                value={form.valorCustas}
                onChange={(e) => setField('valorCustas')(e.target.value)}
              />
            </Field>
            <Field label="Custas">
              <input
                className={inputClass}
                value={form.custas}
                onChange={(e) => setField('custas')(e.target.value)}
              />
            </Field>
            <Field label="Previdência">
              <input
                className={inputClass}
                value={form.previdencia}
                onChange={(e) => setField('previdencia')(e.target.value)}
              />
            </Field>
            <Field label="Outros gastos / honorários">
              <input
                className={inputClass}
                value={form.outrosGastos}
                onChange={(e) => setField('outrosGastos')(e.target.value)}
              />
            </Field>
            <Field label="Valor pago sentenciado">
              <input
                className={inputClass}
                value={form.valorPagoSentenciado}
                onChange={(e) => setField('valorPagoSentenciado')(e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Objetos e observações">
            <Field label="Objeto" className="sm:col-span-2 lg:col-span-3">
              <textarea
                className={textareaClass}
                value={form.objeto}
                onChange={(e) => setField('objeto')(e.target.value)}
              />
            </Field>
            <Field label="Objetos vinculados" className="sm:col-span-2 lg:col-span-3">
              <textarea
                className={textareaClass}
                value={form.objeto2}
                onChange={(e) => setField('objeto2')(e.target.value)}
              />
            </Field>
            <Field label="Decisão do STF" className="sm:col-span-2">
              <input
                className={inputClass}
                value={form.decisaoStf}
                onChange={(e) => setField('decisaoStf')(e.target.value)}
              />
            </Field>
            <Field label="Agravo de instrumento">
              <input
                className={inputClass}
                value={form.agravoInstrumento}
                onChange={(e) => setField('agravoInstrumento')(e.target.value)}
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
              Salvar alterações
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
