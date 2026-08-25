'use client';

import React from 'react';
import { Paperclip, Upload, X } from 'lucide-react';
import { Input as BaseInput } from '@/components/ui/Input';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { QuantityStepperInput } from '@/components/ui/QuantityStepperInput';
import { CARGOS_AVAILABLE } from '@/constants/cargos';
import { DEPARTMENTS_LIST } from '@/constants/payrollFilters';
import { maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';
import { formatDateBr } from '@/lib/dateTimeBr';
import { DP_SOLICITACOES_NO_FOCUS_CLS } from '@/lib/dpSolicitacoesUi';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import {
  AddMoreButton,
  RepeatableCard,
  useRepeatableList,
  parseArrayField,
  rowEmployeeOptions,
  MAX_SOLICITACAO_ITENS,
  MAX_ADMISSAO_CANDIDATOS,
  ButtonSeg,
} from './dpSolicitacaoRepeatableUi';

type PayrollEmp = {
  id: string;
  name: string;
  cpf?: string;
  profilePhotoUrl?: string | null;
  department?: string;
  position?: string;
  company?: string | null;
  polo?: string | null;
  costCenter?: string | null;
  birthDate?: string | null;
};

const fieldBox =
  `w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm appearance-none ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const labelCls = 'block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200';
const taCls = `${fieldBox} min-h-[100px] resize-y`;
const inputFieldCls = `border-gray-300 dark:border-gray-600 ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const Input = (props: React.ComponentProps<typeof BaseInput>) => (
  <BaseInput
    {...props}
    className={[inputFieldCls, props.className].filter(Boolean).join(' ')}
  />
);

function DpFileAttachmentField({
  label,
  fileName,
  accept,
  onFileSelect,
}: {
  label: string;
  fileName: string;
  accept: string;
  onFileSelect: (file: File | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const clearFile = () => {
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
      />
      {fileName ? (
        <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span
              className="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
              title={fileName}
            >
              {fileName}
            </span>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="shrink-0 border-l border-gray-300 px-3 py-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Trocar
          </button>
          <button
            type="button"
            onClick={clearFile}
            className="shrink-0 border-l border-gray-300 px-3 py-2.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            aria-label="Remover anexo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-form-field-shell="true"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center transition-colors hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:bg-gray-800/40 dark:hover:border-red-500/50 dark:hover:bg-red-950/20"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-gray-700 dark:text-gray-300">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Escolher arquivo</span>
        </button>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <DatePickerField
        value={value}
        onChange={onChange}
        placeholder="dd/mm/aaaa"
        noFocusRing
        aria-label={ariaLabel ?? label}
      />
    </div>
  );
}

function SearchSelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: MultiSelectSearchOption[];
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <SingleSelectSearchDropdown
        value={value}
        onChange={onChange}
        options={options}
        allowEmpty={allowEmpty}
        placeholder={placeholder}
        searchPlaceholder="Pesquisar..."
        noFocusRing
      />
    </div>
  );
}

function toOptions(items: { value: string; label: string }[]): MultiSelectSearchOption[] {
  return items.map((item) => ({ value: item.value, label: item.label, searchText: item.label }));
}

const MOTIVO_CONTRATACAO = [
  { value: 'AUMENTO_QUADRO', label: 'Aumento de quadro' },
  { value: 'SUBSTITUICAO', label: 'Substituição' },
  { value: 'DEMANDA_TEMPORARIA', label: 'Demanda temporária / obra' },
  { value: 'OUTRO', label: 'Outro' },
];

const TIPO_AVISO = [
  { value: 'TRABALHADO', label: 'Trabalhado' },
  { value: 'INDENIZADO', label: 'Indenizado' },
  { value: 'PEDIDO_DEMISSAO', label: 'Pedido de demissão' },
  { value: 'OUTRO', label: 'Outro' },
];

const TIPO_RESCISAO = [
  { value: 'SEM_JUSTA_CAUSA', label: 'Sem justa causa' },
  { value: 'COM_JUSTA_CAUSA', label: 'Com justa causa' },
  { value: 'ACORDO', label: 'Acordo' },
  { value: 'CONTRATO_EXPERIENCIA', label: 'Contrato de experiência' },
  { value: 'OUTRO', label: 'Outro' },
];

export const MOTIVO_CONTRATACAO_OPTIONS = toOptions(MOTIVO_CONTRATACAO);
const SETOR_OPTIONS = toOptions(DEPARTMENTS_LIST.map((setor) => ({ value: setor, label: setor })));
const TIPO_AVISO_OPTIONS = toOptions(TIPO_AVISO);
const TIPO_RESCISAO_OPTIONS = toOptions(TIPO_RESCISAO);
const CARGO_OPTIONS = toOptions(CARGOS_AVAILABLE.map((cargo) => ({ value: cargo, label: cargo })));

type RepeatableBaseProps = {
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
};

type RepeatableWithEmployeesProps = RepeatableBaseProps & {
  employees: PayrollEmp[];
};

function getEmployeeOptions(employees: PayrollEmp[]): MultiSelectSearchOption[] {
  return toPersonSelectOptions(
    employees.map((em) => ({
      value: em.id,
      name: em.name,
      cpf: em.cpf,
      profilePhotoUrl: em.profilePhotoUrl,
      extraSearchText: [em.department, em.position].filter(Boolean).join(' '),
    }))
  );
}

function toPositiveInt(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getLegacyEmployeeIds(details: Record<string, unknown>): string[] {
  if (Array.isArray(details.employeeIds)) {
    const ids = details.employeeIds.filter((id): id is string => typeof id === 'string' && !!id.trim());
    if (ids.length) return ids;
  }
  const singular = details.employeeId;
  if (typeof singular === 'string' && singular.trim()) return [singular];
  return [];
}

function splitRange(value: unknown): { inicio: string; fim: string } {
  const raw = String(value ?? '').trim();
  if (!raw) return { inicio: '', fim: '' };
  if (raw.includes(' - ')) {
    const [inicioRaw, fimRaw] = raw.split(' - ').map((part) => part.trim());
    return { inicio: inicioRaw || '', fim: fimRaw || '' };
  }
  return { inicio: raw, fim: '' };
}

function combineRange(inicio: string, fim: string): string {
  const start = inicio.trim();
  const end = fim.trim();
  if (!start && !end) return '';
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

function cargoOptionsWithCurrent(current: string): MultiSelectSearchOption[] {
  const trimmed = current.trim();
  if (trimmed && !CARGOS_AVAILABLE.includes(trimmed)) {
    return [{ value: trimmed, label: trimmed, searchText: trimmed }, ...CARGO_OPTIONS];
  }
  return CARGO_OPTIONS;
}

function setorOptionsWithCurrent(current: string): MultiSelectSearchOption[] {
  const trimmed = current.trim();
  if (trimmed && !DEPARTMENTS_LIST.includes(trimmed)) {
    return [{ value: trimmed, label: trimmed, searchText: trimmed }, ...SETOR_OPTIONS];
  }
  return SETOR_OPTIONS;
}

type AdmissaoCandidato = {
  nome: string;
  funcao: string;
  contato: string;
  motivoContratacao: string;
  setor: string;
  observacao: string;
};

function emptyAdmissaoCandidato(): AdmissaoCandidato {
  return { nome: '', funcao: '', contato: '', motivoContratacao: '', setor: '', observacao: '' };
}

function parseAdmissaoCandidatos(details: Record<string, unknown>): AdmissaoCandidato[] {
  const legacyMotivo = String(details.motivoContratacao ?? '');
  const legacySetor = String(details.setor ?? '');
  const legacyObservacao = String(details.observacao ?? '');
  const raw = details.candidatos;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      if (!item || typeof item !== 'object') return emptyAdmissaoCandidato();
      const row = item as Record<string, unknown>;
      return {
        nome: String(row.nome ?? ''),
        funcao: String(row.funcao ?? ''),
        contato: String(row.contato ?? ''),
        motivoContratacao: String(row.motivoContratacao ?? legacyMotivo),
        setor: String(row.setor ?? legacySetor),
        observacao: String(row.observacao ?? legacyObservacao),
      };
    });
  }
  const quantidade = Math.min(MAX_ADMISSAO_CANDIDATOS, toPositiveInt(details.quantidade));
  if (quantidade > 0) {
    return Array.from({ length: quantidade }, () => ({
      ...emptyAdmissaoCandidato(),
      motivoContratacao: legacyMotivo,
      setor: legacySetor,
      observacao: legacyObservacao,
    }));
  }
  return [emptyAdmissaoCandidato()];
}

type RepeatableWithDocumentoFileProps = RepeatableBaseProps & {
  documentoFileNames: Record<number, string>;
  onDocumentoFile: (index: number, file: File | null) => void;
};

export function AdmissaoCandidatosRepeatableFields({
  details,
  patchDetails,
  documentoFileNames,
  onDocumentoFile,
}: RepeatableWithDocumentoFileProps) {
  const candidatos = parseAdmissaoCandidatos(details);

  const { updateItem, addItem, removeItem } = useRepeatableList(
    candidatos,
    emptyAdmissaoCandidato,
    patchDetails,
    'candidatos',
    MAX_ADMISSAO_CANDIDATOS
  );

  return (
    <div className="space-y-4">
      {candidatos.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Pessoa ${index + 1}`}
          index={index}
          total={candidatos.length}
          onRemove={() => {
            removeItem(index);
            onDocumentoFile(index, null);
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Nome *</label>
              <Input
                value={row.nome}
                onChange={(e) => updateItem(index, { nome: e.target.value })}
                placeholder="Nome completo"
                required
              />
            </div>
            <div>
              <SearchSelectField
                label="Função *"
                value={row.funcao}
                onChange={(funcao) => updateItem(index, { funcao })}
                options={cargoOptionsWithCurrent(row.funcao)}
                allowEmpty={false}
                placeholder="Selecione a função..."
              />
            </div>
            <div>
              <label className={labelCls}>Contato *</label>
              <Input
                value={row.contato}
                onChange={(e) => updateItem(index, { contato: e.target.value })}
                placeholder="Telefone ou e-mail"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SearchSelectField
              label="Motivo da contratação *"
              value={row.motivoContratacao}
              onChange={(motivoContratacao) => updateItem(index, { motivoContratacao })}
              options={MOTIVO_CONTRATACAO_OPTIONS}
              placeholder="Selecione o motivo..."
            />
            <SearchSelectField
              label="Setor *"
              value={row.setor}
              onChange={(setor) => updateItem(index, { setor })}
              options={setorOptionsWithCurrent(row.setor)}
              allowEmpty={false}
              placeholder="Selecione o setor..."
            />
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={taCls}
              value={row.observacao}
              onChange={(e) => updateItem(index, { observacao: e.target.value })}
              placeholder="Informações complementares sobre a admissão (opcional)"
            />
          </div>
          <DpFileAttachmentField
            label="Anexar documento"
            fileName={documentoFileNames[index] ?? ''}
            accept=".pdf,image/*,.doc,.docx"
            onFileSelect={(file) => onDocumentoFile(index, file)}
          />
        </RepeatableCard>
      ))}
      <AddMoreButton
        onClick={addItem}
        disabled={candidatos.length >= MAX_ADMISSAO_CANDIDATOS}
      />
    </div>
  );
}

type MedidaDisciplinarRow = {
  employeeId: string;
  punicao: 'ADVERTENCIA' | 'SUSPENSAO' | '';
  motivo: string;
};

function emptyMedidaDisciplinarRow(): MedidaDisciplinarRow {
  return { employeeId: '', punicao: '', motivo: '' };
}

export function MedidaDisciplinarFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const medidas = parseArrayField<MedidaDisciplinarRow>(
    details,
    'medidas',
    (row) => {
      const punicaoRaw = row.punicao;
      const punicao =
        punicaoRaw === 'ADVERTENCIA' || punicaoRaw === 'SUSPENSAO' ? punicaoRaw : '';
      return {
        employeeId: String(row.employeeId ?? ''),
        punicao,
        motivo: String(row.motivo ?? ''),
      };
    },
    emptyMedidaDisciplinarRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const motivo = String(legacyDetails.motivo ?? '');
      return employeeIds.map((employeeId) => ({ employeeId, punicao: '', motivo }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    medidas,
    emptyMedidaDisciplinarRow,
    patchDetails,
    'medidas',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {medidas.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Medida ${index + 1}`}
          index={index}
          total={medidas.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, medidas, index)}
            placeholder="Selecionar colaborador..."
          />

          <div>
            <label className={labelCls}>Punição *</label>
            <div className="flex gap-2">
              <ButtonSeg
                active={row.punicao === 'ADVERTENCIA'}
                onClick={() => updateItem(index, { punicao: 'ADVERTENCIA' })}
                label="Advertência"
              />
              <ButtonSeg
                active={row.punicao === 'SUSPENSAO'}
                onClick={() => updateItem(index, { punicao: 'SUSPENSAO' })}
                label="Suspensão"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Motivo *</label>
            <textarea
              className={taCls}
              placeholder="Descreva o motivo da advertência ou suspensão..."
              value={row.motivo}
              onChange={(e) => updateItem(index, { motivo: e.target.value })}
              required
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={medidas.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type FeriasRow = {
  employeeId: string;
  dataInicial: string;
  dataFinal: string;
  observacao: string;
};

function emptyFeriasRow(): FeriasRow {
  return { employeeId: '', dataInicial: '', dataFinal: '', observacao: '' };
}

export function FeriasRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const ferias = parseArrayField<FeriasRow>(
    details,
    'ferias',
    (row) => ({
      employeeId: String(row.employeeId ?? ''),
      dataInicial: String(row.dataInicial ?? ''),
      dataFinal: String(row.dataFinal ?? ''),
      observacao: String(row.observacao ?? ''),
    }),
    emptyFeriasRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const dataInicial = String(legacyDetails.dataInicial ?? '');
      const dataFinal = String(legacyDetails.dataFinal ?? '');
      const observacao = String(legacyDetails.observacao ?? '');
      return employeeIds.map((employeeId) => ({ employeeId, dataInicial, dataFinal, observacao }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    ferias,
    emptyFeriasRow,
    patchDetails,
    'ferias',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {ferias.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Férias ${index + 1}`}
          index={index}
          total={ferias.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, ferias, index)}
            placeholder="Selecionar colaborador..."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data inicial *"
              value={row.dataInicial}
              onChange={(dataInicial) => updateItem(index, { dataInicial })}
            />
            <DateField
              label="Data final *"
              value={row.dataFinal}
              onChange={(dataFinal) => updateItem(index, { dataFinal })}
            />
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={taCls}
              value={row.observacao}
              onChange={(e) => updateItem(index, { observacao: e.target.value })}
              placeholder="Informações complementares sobre as férias (opcional)"
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={ferias.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type RescisaoRow = {
  employeeId: string;
  tipoAviso: string;
  tipoRescisao: string;
  motivo: string;
  observacoes: string;
};

function emptyRescisaoRow(): RescisaoRow {
  return { employeeId: '', tipoAviso: '', tipoRescisao: '', motivo: '', observacoes: '' };
}

export function RescisaoRepeatableFields({
  details,
  patchDetails,
  employees,
  documentoFileNames,
  onDocumentoFile,
}: RepeatableWithEmployeesProps & RepeatableWithDocumentoFileProps) {
  const rescisoes = parseArrayField<RescisaoRow>(
    details,
    'rescisoes',
    (row) => ({
      employeeId: String(row.employeeId ?? ''),
      tipoAviso: String(row.tipoAviso ?? ''),
      tipoRescisao: String(row.tipoRescisao ?? ''),
      motivo: String(row.motivo ?? ''),
      observacoes: String(row.observacoes ?? ''),
    }),
    emptyRescisaoRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const tipoAviso = String(legacyDetails.tipoAviso ?? '');
      const tipoRescisao = String(legacyDetails.tipoRescisao ?? '');
      const motivo = String(legacyDetails.motivo ?? '');
      const observacoes = String(legacyDetails.observacoes ?? '');
      return employeeIds.map((employeeId) => ({
        employeeId,
        tipoAviso,
        tipoRescisao,
        motivo,
        observacoes,
      }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    rescisoes,
    emptyRescisaoRow,
    patchDetails,
    'rescisoes',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {rescisoes.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Rescisão ${index + 1}`}
          index={index}
          total={rescisoes.length}
          onRemove={() => {
            removeItem(index);
            onDocumentoFile(index, null);
          }}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, rescisoes, index)}
            placeholder="Selecionar colaborador..."
          />
          <SearchSelectField
            label="Tipo de aviso *"
            value={row.tipoAviso}
            onChange={(tipoAviso) => updateItem(index, { tipoAviso })}
            options={TIPO_AVISO_OPTIONS}
            placeholder="Selecione o tipo de aviso..."
          />
          <SearchSelectField
            label="Tipo de rescisão *"
            value={row.tipoRescisao}
            onChange={(tipoRescisao) => updateItem(index, { tipoRescisao })}
            options={TIPO_RESCISAO_OPTIONS}
            placeholder="Selecione o tipo de rescisão..."
          />
          <div>
            <label className={labelCls}>Motivo *</label>
            <Input
              value={row.motivo}
              onChange={(e) => updateItem(index, { motivo: e.target.value })}
              placeholder="Ex.: Redução de quadro"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Observações / particularidades</label>
            <textarea
              className={taCls}
              value={row.observacoes}
              onChange={(e) => updateItem(index, { observacoes: e.target.value })}
              placeholder="Informações complementares sobre a rescisão (opcional)"
            />
          </div>
          <DpFileAttachmentField
            label="Anexar documento"
            fileName={documentoFileNames[index] ?? ''}
            accept=".pdf,image/*,.doc,.docx"
            onFileSelect={(file) => onDocumentoFile(index, file)}
          />
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={rescisoes.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type AlteracaoRow = {
  employeeId: string;
  tipoAlteracao: 'FUNCAO' | 'SALARIO';
  funcaoSalarioAntigo: string;
  funcaoSalarioNovo: string;
  justificativa: string;
};

function emptyAlteracaoRow(): AlteracaoRow {
  return {
    employeeId: '',
    tipoAlteracao: 'FUNCAO',
    funcaoSalarioAntigo: '',
    funcaoSalarioNovo: '',
    justificativa: '',
  };
}

export function AlteracaoFuncaoSalarioRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const alteracoes = parseArrayField<AlteracaoRow>(
    details,
    'alteracoes',
    (row) => {
      const tipoRaw = row.tipoAlteracao;
      const tipoAlteracao = tipoRaw === 'SALARIO' ? 'SALARIO' : 'FUNCAO';
      return {
        employeeId: String(row.employeeId ?? ''),
        tipoAlteracao,
        funcaoSalarioAntigo: String(row.funcaoSalarioAntigo ?? ''),
        funcaoSalarioNovo: String(row.funcaoSalarioNovo ?? ''),
        justificativa: String(row.justificativa ?? ''),
      };
    },
    emptyAlteracaoRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const tipoRaw = legacyDetails.tipoAlteracaoFuncaoOuSalario;
      const tipoAlteracao =
        tipoRaw === 'SALARIO'
          ? 'SALARIO'
          : typeof legacyDetails.funcaoSalarioAntigo === 'string' &&
              /R\$\s*\d/.test(legacyDetails.funcaoSalarioAntigo)
            ? 'SALARIO'
            : 'FUNCAO';
      const funcaoSalarioAntigo = String(legacyDetails.funcaoSalarioAntigo ?? '');
      const funcaoSalarioNovo = String(legacyDetails.funcaoSalarioNovo ?? '');
      const justificativa = String(legacyDetails.justificativa ?? '');
      return employeeIds.map((employeeId) => ({
        employeeId,
        tipoAlteracao,
        funcaoSalarioAntigo,
        funcaoSalarioNovo,
        justificativa,
      }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    alteracoes,
    emptyAlteracaoRow,
    patchDetails,
    'alteracoes',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {alteracoes.map((row, index) => {
        const funcaoAntiga = row.funcaoSalarioAntigo.trim();
        const funcaoNova = row.funcaoSalarioNovo.trim();
        return (
          <RepeatableCard
            key={index}
            title={`Alteração ${index + 1}`}
            index={index}
            total={alteracoes.length}
            onRemove={() => removeItem(index)}
          >
            <SearchSelectField
              label="Colaborador *"
              value={row.employeeId}
              onChange={(employeeId) => updateItem(index, { employeeId })}
              options={rowEmployeeOptions(employeeOptions, alteracoes, index)}
              placeholder="Selecionar colaborador..."
            />

            <div>
              <label className={labelCls}>Alteração de função ou salário *</label>
              <div className="flex gap-2">
                <ButtonSeg
                  active={row.tipoAlteracao === 'FUNCAO'}
                  onClick={() =>
                    updateItem(index, {
                      tipoAlteracao: 'FUNCAO',
                      funcaoSalarioAntigo: '',
                      funcaoSalarioNovo: '',
                    })
                  }
                  label="Função"
                />
                <ButtonSeg
                  active={row.tipoAlteracao === 'SALARIO'}
                  onClick={() =>
                    updateItem(index, {
                      tipoAlteracao: 'SALARIO',
                      funcaoSalarioAntigo: '',
                      funcaoSalarioNovo: '',
                    })
                  }
                  label="Salário"
                />
              </div>
            </div>

            {row.tipoAlteracao === 'FUNCAO' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SearchSelectField
                  label="Função antiga *"
                  value={funcaoAntiga}
                  onChange={(funcaoSalarioAntigo) => updateItem(index, { funcaoSalarioAntigo })}
                  options={cargoOptionsWithCurrent(funcaoAntiga)}
                  allowEmpty={false}
                  placeholder="Selecione a função..."
                />
                <SearchSelectField
                  label="Função nova *"
                  value={funcaoNova}
                  onChange={(funcaoSalarioNovo) => updateItem(index, { funcaoSalarioNovo })}
                  options={cargoOptionsWithCurrent(funcaoNova)}
                  allowEmpty={false}
                  placeholder="Selecione a função..."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Salário antigo *</label>
                  <Input
                    value={row.funcaoSalarioAntigo}
                    onChange={(e) =>
                      updateItem(index, {
                        funcaoSalarioAntigo: maskCurrencyInputBrOrEmpty(e.target.value),
                      })
                    }
                    placeholder="R$ 2.500,00"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Salário novo *</label>
                  <Input
                    value={row.funcaoSalarioNovo}
                    onChange={(e) =>
                      updateItem(index, { funcaoSalarioNovo: maskCurrencyInputBrOrEmpty(e.target.value) })
                    }
                    placeholder="R$ 2.500,00"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Justificativa *</label>
              <textarea
                className={taCls}
                value={row.justificativa}
                onChange={(e) => updateItem(index, { justificativa: e.target.value })}
                placeholder="Descreva o motivo da alteração de função ou salário..."
                required
              />
            </div>
          </RepeatableCard>
        );
      })}
      <AddMoreButton onClick={addItem} disabled={alteracoes.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type AtestadoRow = {
  employeeId: string;
  dataInicial: string;
  dataFinal: string;
  numeroDias: string;
};

function emptyAtestadoRow(): AtestadoRow {
  return { employeeId: '', dataInicial: '', dataFinal: '', numeroDias: '' };
}

export function AtestadoMedicoRepeatableFields({
  details,
  patchDetails,
  employees,
  atestadoFileNames,
  onAtestadoFile,
}: RepeatableWithEmployeesProps & {
  atestadoFileNames: Record<number, string>;
  onAtestadoFile: (index: number, file: File | null) => void;
}) {
  const atestados = parseArrayField<AtestadoRow>(
    details,
    'atestados',
    (row) => ({
      employeeId: String(row.employeeId ?? ''),
      dataInicial: String(row.dataInicial ?? ''),
      dataFinal: String(row.dataFinal ?? ''),
      numeroDias: String(row.numeroDias ?? ''),
    }),
    emptyAtestadoRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const dataInicial = String(legacyDetails.dataInicial ?? '');
      const dataFinal = String(legacyDetails.dataFinal ?? '');
      const numeroDias = String(legacyDetails.numeroDias ?? '');
      return employeeIds.map((employeeId) => ({ employeeId, dataInicial, dataFinal, numeroDias }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    atestados,
    emptyAtestadoRow,
    patchDetails,
    'atestados',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {atestados.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Atestado ${index + 1}`}
          index={index}
          total={atestados.length}
          onRemove={() => {
            removeItem(index);
            onAtestadoFile(index, null);
          }}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, atestados, index)}
            placeholder="Selecionar colaborador..."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data inicial *"
              value={row.dataInicial}
              onChange={(dataInicial) => updateItem(index, { dataInicial })}
            />
            <DateField
              label="Data final *"
              value={row.dataFinal}
              onChange={(dataFinal) => updateItem(index, { dataFinal })}
            />
          </div>
          <div className="max-w-[220px]">
            <label className={labelCls}>Número de dias *</label>
            <QuantityStepperInput
              required
              allowEmpty
              value={toPositiveInt(row.numeroDias)}
              min={1}
              max={365}
              unit="dia(s)"
              placeholder="Ex.: 3"
              onChange={(qty) => updateItem(index, { numeroDias: qty > 0 ? String(qty) : '' })}
            />
          </div>
          <DpFileAttachmentField
            label="Anexo do atestado *"
            fileName={atestadoFileNames[index] ?? ''}
            accept=".pdf,image/*"
            onFileSelect={(file) => onAtestadoFile(index, file)}
          />
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={atestados.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type RetificacaoRow = {
  employeeId: string;
  data: string;
  justificativa: string;
};

function emptyRetificacaoRow(): RetificacaoRow {
  return { employeeId: '', data: '', justificativa: '' };
}

export function RetificacaoAlocacaoRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const retificacoes = parseArrayField<RetificacaoRow>(
    details,
    'retificacoes',
    (row) => ({
      employeeId: String(row.employeeId ?? ''),
      data: String(row.data ?? ''),
      justificativa: String(row.justificativa ?? ''),
    }),
    emptyRetificacaoRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const data = String(legacyDetails.data ?? '');
      const justificativa = String(legacyDetails.justificativa ?? '');
      return employeeIds.map((employeeId) => ({ employeeId, data, justificativa }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    retificacoes,
    emptyRetificacaoRow,
    patchDetails,
    'retificacoes',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {retificacoes.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Retificação ${index + 1}`}
          index={index}
          total={retificacoes.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, retificacoes, index)}
            placeholder="Selecionar colaborador..."
          />
          <DateField
            label="Data *"
            value={row.data}
            onChange={(data) => updateItem(index, { data })}
          />
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={row.justificativa}
              onChange={(e) => updateItem(index, { justificativa: e.target.value })}
              placeholder="Descreva o motivo da retificação de alocação..."
              required
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={retificacoes.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type HoraExtraRow = {
  employeeId: string;
  justificativa: string;
  inicioPeriodo: string;
  fimPeriodo: string;
};

function emptyHoraExtraRow(): HoraExtraRow {
  return { employeeId: '', justificativa: '', inicioPeriodo: '', fimPeriodo: '' };
}

export function HoraExtraRepeatableFields({
  details,
  patchDetails,
  employees,
  horaExtraFileNames,
  onHoraExtraFile,
}: RepeatableWithEmployeesProps & {
  horaExtraFileNames: Record<number, string>;
  onHoraExtraFile: (index: number, file: File | null) => void;
}) {
  const horasExtras = parseArrayField<HoraExtraRow>(
    details,
    'horasExtras',
    (row) => {
      const range = splitRange(row.datas);
      return {
        employeeId: String(row.employeeId ?? ''),
        justificativa: String(row.justificativa ?? ''),
        inicioPeriodo: String(row.inicioPeriodo ?? range.inicio),
        fimPeriodo: String(row.fimPeriodo ?? range.fim),
      };
    },
    emptyHoraExtraRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const justificativa = String(legacyDetails.justificativa ?? '');
      const range = splitRange(legacyDetails.datas);
      return employeeIds.map((employeeId) => ({
        employeeId,
        justificativa,
        inicioPeriodo: range.inicio,
        fimPeriodo: range.fim,
      }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    horasExtras,
    emptyHoraExtraRow,
    patchDetails,
    'horasExtras',
    MAX_SOLICITACAO_ITENS
  );

  const patchRow = (index: number, patch: Partial<HoraExtraRow>) => {
    const current = horasExtras[index] ?? emptyHoraExtraRow();
    const nextRow = { ...current, ...patch };
    const next = horasExtras.map((row, i) => (i === index ? nextRow : row)).map((row) => ({
      ...row,
      datas: combineRange(row.inicioPeriodo, row.fimPeriodo),
    }));
    patchDetails({ horasExtras: next });
  };

  return (
    <div className="space-y-4">
      {horasExtras.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Hora extra ${index + 1}`}
          index={index}
          total={horasExtras.length}
          onRemove={() => {
            removeItem(index);
            onHoraExtraFile(index, null);
          }}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => patchRow(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, horasExtras, index)}
            placeholder="Selecionar colaborador..."
          />
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={row.justificativa}
              onChange={(e) => patchRow(index, { justificativa: e.target.value })}
              placeholder="Explique o motivo/justificativa da solicitação..."
              required
            />
          </div>
          <div>
            <label className={labelCls}>Período *</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <label className={labelCls}>Início do período *</label>
                <DateTimePickerField
                  value={row.inicioPeriodo}
                  onChange={(inicioPeriodo) => patchRow(index, { inicioPeriodo })}
                  placeholder="dd/mm/aaaa hh:mm"
                  noFocusRing
                  aria-label={`Início do período ${index + 1}`}
                />
              </div>
              <div>
                <label className={labelCls}>Fim do período *</label>
                <DateTimePickerField
                  value={row.fimPeriodo}
                  onChange={(fimPeriodo) => patchRow(index, { fimPeriodo })}
                  placeholder="dd/mm/aaaa hh:mm"
                  noFocusRing
                  aria-label={`Fim do período ${index + 1}`}
                />
              </div>
            </div>
          </div>
          <DpFileAttachmentField
            label="Anexar autorização de hora extra *"
            fileName={horaExtraFileNames[index] ?? ''}
            accept=".pdf,image/*"
            onFileSelect={(file) => onHoraExtraFile(index, file)}
          />
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={horasExtras.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type BeneficiosViagemRow = {
  employeeId: string;
  dataInicial: string;
  dataFinal: string;
  numeroDias: string;
  diasHotel: string;
  motivoViagem: string;
};

function emptyBeneficiosViagemRow(): BeneficiosViagemRow {
  return {
    employeeId: '',
    dataInicial: '',
    dataFinal: '',
    numeroDias: '',
    diasHotel: '',
    motivoViagem: '',
  };
}

export function BeneficiosViagemRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const viagensBeneficio = parseArrayField<BeneficiosViagemRow>(
    details,
    'viagensBeneficio',
    (row) => ({
      employeeId: String(row.employeeId ?? ''),
      dataInicial: String(row.dataInicial ?? ''),
      dataFinal: String(row.dataFinal ?? ''),
      numeroDias: String(row.numeroDias ?? ''),
      diasHotel: String(row.diasHotel ?? ''),
      motivoViagem: String(row.motivoViagem ?? ''),
    }),
    emptyBeneficiosViagemRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const dataInicial = String(legacyDetails.dataInicial ?? '');
      const dataFinal = String(legacyDetails.dataFinal ?? '');
      const numeroDias = String(legacyDetails.numeroDias ?? '');
      const diasHotel = String(legacyDetails.diasHotel ?? '');
      const motivoViagem = String(legacyDetails.motivoViagem ?? '');
      return employeeIds.map((employeeId) => ({
        employeeId,
        dataInicial,
        dataFinal,
        numeroDias,
        diasHotel,
        motivoViagem,
      }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    viagensBeneficio,
    emptyBeneficiosViagemRow,
    patchDetails,
    'viagensBeneficio',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {viagensBeneficio.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Viagem benefício ${index + 1}`}
          index={index}
          total={viagensBeneficio.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, viagensBeneficio, index)}
            placeholder="Selecionar colaborador..."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data de início *"
              value={row.dataInicial}
              onChange={(dataInicial) => updateItem(index, { dataInicial })}
            />
            <DateField
              label="Data final *"
              value={row.dataFinal}
              onChange={(dataFinal) => updateItem(index, { dataFinal })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Número de dias *</label>
              <QuantityStepperInput
                required
                allowEmpty
                value={toPositiveInt(row.numeroDias)}
                min={1}
                max={365}
                unit="dia(s)"
                placeholder="Ex.: 5"
                onChange={(qty) => updateItem(index, { numeroDias: qty > 0 ? String(qty) : '' })}
              />
            </div>
            <div>
              <label className={labelCls}>Hotel (opcional)</label>
              <QuantityStepperInput
                allowEmpty
                value={toPositiveInt(row.diasHotel)}
                min={1}
                max={365}
                unit="dia(s)"
                placeholder="Ex.: 2"
                onChange={(qty) => updateItem(index, { diasHotel: qty > 0 ? String(qty) : '' })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Motivo da viagem *</label>
            <Input
              value={row.motivoViagem}
              onChange={(e) => updateItem(index, { motivoViagem: e.target.value })}
              placeholder="Ex.: Reunião com cliente"
              required
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton
        onClick={addItem}
        disabled={viagensBeneficio.length >= MAX_SOLICITACAO_ITENS}
      />
    </div>
  );
}

type OutrasSolicitacoesRow = {
  employeeId: string;
  tipoSolicitacao: string;
  situacao: string;
  justificativa: string;
  dataInicial: string;
  dataFinal: string;
  valores: string;
  observacoes: string;
};

function emptyOutrasSolicitacoesRow(): OutrasSolicitacoesRow {
  return {
    employeeId: '',
    tipoSolicitacao: '',
    situacao: '',
    justificativa: '',
    dataInicial: '',
    dataFinal: '',
    valores: '',
    observacoes: '',
  };
}

export function OutrasSolicitacoesRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const itens = parseArrayField<OutrasSolicitacoesRow>(
    details,
    'itens',
    (row) => {
      const range = splitRange(row.datas);
      return {
        employeeId: String(row.employeeId ?? ''),
        tipoSolicitacao: String(row.tipoSolicitacao ?? ''),
        situacao: String(row.situacao ?? ''),
        justificativa: String(row.justificativa ?? ''),
        dataInicial: String(row.dataInicial ?? range.inicio),
        dataFinal: String(row.dataFinal ?? range.fim),
        valores: String(row.valores ?? ''),
        observacoes: String(row.observacoes ?? ''),
      };
    },
    emptyOutrasSolicitacoesRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const range = splitRange(legacyDetails.datas);
      const tipoSolicitacao = String(legacyDetails.tipoSolicitacao ?? '');
      const situacao = String(legacyDetails.situacao ?? '');
      const justificativa = String(legacyDetails.justificativa ?? '');
      const valores = String(legacyDetails.valores ?? '');
      const observacoes = String(legacyDetails.observacoes ?? '');
      return employeeIds.map((employeeId) => ({
        employeeId,
        tipoSolicitacao,
        situacao,
        justificativa,
        dataInicial: range.inicio,
        dataFinal: range.fim,
        valores,
        observacoes,
      }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    itens,
    emptyOutrasSolicitacoesRow,
    patchDetails,
    'itens',
    MAX_SOLICITACAO_ITENS
  );

  const patchRow = (index: number, patch: Partial<OutrasSolicitacoesRow>) => {
    const next = itens.map((row, i) => (i === index ? { ...row, ...patch } : row)).map((row) => ({
      ...row,
      datas: combineRange(row.dataInicial, row.dataFinal),
    }));
    patchDetails({ itens: next });
  };

  return (
    <div className="space-y-4">
      {itens.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Solicitação ${index + 1}`}
          index={index}
          total={itens.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => patchRow(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, itens, index)}
            placeholder="Selecionar colaborador..."
          />
          <div>
            <label className={labelCls}>Tipo de solicitação *</label>
            <Input
              value={row.tipoSolicitacao}
              onChange={(e) => patchRow(index, { tipoSolicitacao: e.target.value })}
              placeholder="Ex.: Alteração de benefício"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Situação *</label>
            <Input
              value={row.situacao}
              onChange={(e) => patchRow(index, { situacao: e.target.value })}
              placeholder="Ex.: Aguardando análise do DP"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={row.justificativa}
              onChange={(e) => patchRow(index, { justificativa: e.target.value })}
              placeholder="Descreva o motivo e os detalhes da solicitação..."
              required
            />
          </div>
          <div>
            <label className={labelCls}>Datas</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <DateField
                label="Data inicial"
                value={row.dataInicial}
                onChange={(dataInicial) => patchRow(index, { dataInicial })}
              />
              <DateField
                label="Data final"
                value={row.dataFinal}
                onChange={(dataFinal) => patchRow(index, { dataFinal })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Valores</label>
            <Input
              value={row.valores}
              onChange={(e) => patchRow(index, { valores: maskCurrencyInputBrOrEmpty(e.target.value) })}
              placeholder="R$ 1.500,00"
            />
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea
              className={taCls}
              value={row.observacoes}
              onChange={(e) => patchRow(index, { observacoes: e.target.value })}
              placeholder="Informações complementares (opcional)"
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={itens.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type AdmViagemRow = {
  employeeId: string;
  dataIda: string;
  dataVolta: string;
  cidade: string;
  motivoViagem: string;
  numeroDias: string;
  pedagio: 'SIM' | 'NAO' | '';
  observacoes: string;
};

function emptyAdmViagemRow(): AdmViagemRow {
  return {
    employeeId: '',
    dataIda: '',
    dataVolta: '',
    cidade: '',
    motivoViagem: '',
    numeroDias: '',
    pedagio: '',
    observacoes: '',
  };
}

export function AdmViagensRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const viagens = parseArrayField<AdmViagemRow>(
    details,
    'viagens',
    (row) => {
      const pedagioRaw = row.pedagio;
      const pedagio = pedagioRaw === 'SIM' || pedagioRaw === 'NAO' ? pedagioRaw : '';
      return {
        employeeId: String(row.employeeId ?? ''),
        dataIda: String(row.dataIda ?? ''),
        dataVolta: String(row.dataVolta ?? ''),
        cidade: String(row.cidade ?? ''),
        motivoViagem: String(row.motivoViagem ?? ''),
        numeroDias: String(row.numeroDias ?? ''),
        pedagio,
        observacoes: String(row.observacoes ?? ''),
      };
    },
    emptyAdmViagemRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const pedagioRaw = legacyDetails.pedagio;
      const pedagio = pedagioRaw === 'SIM' || pedagioRaw === 'NAO' ? pedagioRaw : '';
      const dataIda = String(legacyDetails.dataIda ?? '');
      const dataVolta = String(legacyDetails.dataVolta ?? '');
      const cidade = String(legacyDetails.cidade ?? '');
      const motivoViagem = String(legacyDetails.motivoViagem ?? '');
      const numeroDias = String(legacyDetails.numeroDias ?? '');
      const observacoes = String(legacyDetails.observacoes ?? '');
      return employeeIds.map((employeeId) => ({
        employeeId,
        dataIda,
        dataVolta,
        cidade,
        motivoViagem,
        numeroDias,
        pedagio,
        observacoes,
      }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    viagens,
    emptyAdmViagemRow,
    patchDetails,
    'viagens',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {viagens.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Viagem ${index + 1}`}
          index={index}
          total={viagens.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, viagens, index)}
            placeholder="Selecionar colaborador..."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data de ida *"
              value={row.dataIda}
              onChange={(dataIda) => updateItem(index, { dataIda })}
            />
            <DateField
              label="Data de volta *"
              value={row.dataVolta}
              onChange={(dataVolta) => updateItem(index, { dataVolta })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Cidade *</label>
              <Input
                value={row.cidade}
                onChange={(e) => updateItem(index, { cidade: e.target.value })}
                placeholder="Ex.: São Paulo"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Motivo da viagem *</label>
              <Input
                value={row.motivoViagem}
                onChange={(e) => updateItem(index, { motivoViagem: e.target.value })}
                placeholder="Ex.: Atendimento ao cliente"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="max-w-[220px]">
              <label className={labelCls}>Número de dias *</label>
              <QuantityStepperInput
                required
                allowEmpty
                value={toPositiveInt(row.numeroDias)}
                min={1}
                max={365}
                unit="dia(s)"
                placeholder="Ex.: 2"
                onChange={(qty) => updateItem(index, { numeroDias: qty > 0 ? String(qty) : '' })}
              />
            </div>
            <div>
              <label className={labelCls}>Pedágio *</label>
              <div className="flex gap-2">
                <ButtonSeg
                  active={row.pedagio === 'SIM'}
                  onClick={() => updateItem(index, { pedagio: 'SIM' })}
                  label="Sim"
                />
                <ButtonSeg
                  active={row.pedagio === 'NAO'}
                  onClick={() => updateItem(index, { pedagio: 'NAO' })}
                  label="Não"
                />
              </div>
            </div>
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea
              className={taCls}
              value={row.observacoes}
              onChange={(e) => updateItem(index, { observacoes: e.target.value })}
              placeholder="Informações complementares (opcional)"
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={viagens.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

type AdmSimpleRow = {
  employeeId: string;
  detalhes: string;
};

function emptyAdmSimpleRow(): AdmSimpleRow {
  return { employeeId: '', detalhes: '' };
}

export function AdmSimpleRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const itens = parseArrayField<AdmSimpleRow>(
    details,
    'itens',
    (row) => ({
      employeeId: String(row.employeeId ?? ''),
      detalhes: String(row.detalhes ?? ''),
    }),
    emptyAdmSimpleRow,
    (legacyDetails) => {
      const employeeIds = getLegacyEmployeeIds(legacyDetails);
      if (!employeeIds.length) return null;
      const detalhes = String(legacyDetails.detalhes ?? legacyDetails.observacao ?? '');
      return employeeIds.map((employeeId) => ({ employeeId, detalhes }));
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const { updateItem, addItem, removeItem } = useRepeatableList(
    itens,
    emptyAdmSimpleRow,
    patchDetails,
    'itens',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {itens.map((row, index) => (
        <RepeatableCard
          key={index}
          title={`Item ${index + 1}`}
          index={index}
          total={itens.length}
          onRemove={() => removeItem(index)}
        >
          <SearchSelectField
            label="Colaborador *"
            value={row.employeeId}
            onChange={(employeeId) => updateItem(index, { employeeId })}
            options={rowEmployeeOptions(employeeOptions, itens, index)}
            placeholder="Selecionar colaborador..."
          />
          <div>
            <label className={labelCls}>Detalhes *</label>
            <textarea
              className={taCls}
              value={row.detalhes}
              onChange={(e) => updateItem(index, { detalhes: e.target.value })}
              placeholder="Descreva os detalhes da solicitação..."
              required
            />
          </div>
        </RepeatableCard>
      ))}
      <AddMoreButton onClick={addItem} disabled={itens.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}

export const ASO_TIPO_OPTIONS: MultiSelectSearchOption[] = [
  { value: 'ADMISSIONAL', label: 'Admissional', searchText: 'Admissional' },
  { value: 'DEMISSIONAL', label: 'Demissional', searchText: 'Demissional' },
  { value: 'PERIODICO', label: 'Periódico', searchText: 'Periódico' },
  { value: 'ALTERACAO_FUNCAO', label: 'Alteração de função', searchText: 'Alteração de função' },
];

export const ASO_TIPO_LABELS: Record<string, string> = {
  ADMISSIONAL: 'Admissional',
  DEMISSIONAL: 'Demissional',
  PERIODICO: 'Periódico',
  ALTERACAO_FUNCAO: 'Alteração de função',
};

type AdmAsosRow = {
  asoTipo: string;
  employeeId: string;
  dataNascimento: string;
  cpf: string;
  setor: string;
  cargo: string;
  novoCargo: string;
  centroCusto: string;
  localTrabalho: string;
  empresa: string;
  seguirPcmso: '' | 'SIM' | 'NAO';
};

function emptyAdmAsosRow(): AdmAsosRow {
  return {
    asoTipo: '',
    employeeId: '',
    dataNascimento: '',
    cpf: '',
    setor: '',
    cargo: '',
    novoCargo: '',
    centroCusto: '',
    localTrabalho: '',
    empresa: '',
    seguirPcmso: '',
  };
}

function mapAdmAsosRow(row: Record<string, unknown>): AdmAsosRow {
  const seguir = row.seguirPcmso;
  return {
    asoTipo: String(row.asoTipo ?? ''),
    employeeId: String(row.employeeId ?? ''),
    dataNascimento: String(row.dataNascimento ?? ''),
    cpf: String(row.cpf ?? ''),
    setor: String(row.setor ?? ''),
    cargo: String(row.cargo ?? ''),
    novoCargo: String(row.novoCargo ?? ''),
    centroCusto: String(row.centroCusto ?? ''),
    localTrabalho: String(row.localTrabalho ?? ''),
    empresa: String(row.empresa ?? ''),
    seguirPcmso: seguir === 'SIM' || seguir === 'NAO' ? seguir : '',
  };
}

function employeeSnapshot(emp: PayrollEmp | undefined): Partial<AdmAsosRow> {
  if (!emp) {
    return {
      dataNascimento: '',
      cpf: '',
      setor: '',
      cargo: '',
      centroCusto: '',
      localTrabalho: '',
      empresa: '',
    };
  }
  return {
    dataNascimento: emp.birthDate ? formatDateBr(emp.birthDate, '') : '',
    cpf: emp.cpf ?? '',
    setor: emp.department ?? '',
    cargo: emp.position ?? '',
    centroCusto: emp.costCenter ?? '',
    localTrabalho: emp.polo ?? '',
    empresa: emp.company ?? '',
  };
}

const readOnlyCls = `w-full px-3 py-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-300 text-sm ${DP_SOLICITACOES_NO_FOCUS_CLS}`;

function ReadOnlyAsoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className={readOnlyCls}>{value || '—'}</div>
    </div>
  );
}

export function AdmAsosRepeatableFields({
  details,
  patchDetails,
  employees,
}: RepeatableWithEmployeesProps) {
  const asos = parseArrayField<AdmAsosRow>(
    details,
    'asos',
    mapAdmAsosRow,
    emptyAdmAsosRow,
    (legacyDetails) => {
      if (Array.isArray(legacyDetails.asos) && legacyDetails.asos.length > 0) return null;
      if (!legacyDetails.asoTipo && !legacyDetails.employeeId) return null;
      return [mapAdmAsosRow(legacyDetails)];
    }
  );

  const employeeOptions = React.useMemo(() => getEmployeeOptions(employees), [employees]);
  const employeeById = React.useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees]
  );
  const { updateItem, addItem, removeItem } = useRepeatableList(
    asos,
    emptyAdmAsosRow,
    patchDetails,
    'asos',
    MAX_SOLICITACAO_ITENS
  );

  return (
    <div className="space-y-4">
      {asos.map((row, index) => {
        const showNovoCargo = row.asoTipo === 'ALTERACAO_FUNCAO';
        return (
          <RepeatableCard
            key={index}
            title={`ASO ${index + 1}`}
            index={index}
            total={asos.length}
            onRemove={() => removeItem(index)}
          >
            <SearchSelectField
              label="Tipo de ASO *"
              value={row.asoTipo}
              onChange={(asoTipo) => {
                const patch: Partial<AdmAsosRow> = { asoTipo };
                if (asoTipo !== 'ALTERACAO_FUNCAO') patch.novoCargo = '';
                updateItem(index, patch);
              }}
              options={ASO_TIPO_OPTIONS}
              placeholder="Selecione o tipo..."
              allowEmpty
            />
            <SearchSelectField
              label="Nome *"
              value={row.employeeId}
              onChange={(employeeId) =>
                updateItem(index, { employeeId, ...employeeSnapshot(employeeById.get(employeeId)) })
              }
              options={rowEmployeeOptions(employeeOptions, asos, index)}
              placeholder="Selecione o funcionário..."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadOnlyAsoField label="Data de nascimento" value={row.dataNascimento} />
              <ReadOnlyAsoField label="CPF" value={row.cpf} />
              <ReadOnlyAsoField label="Setor" value={row.setor} />
              <ReadOnlyAsoField label="Cargo" value={row.cargo} />
              {showNovoCargo ? (
                <SearchSelectField
                  label="Novo cargo *"
                  value={row.novoCargo}
                  onChange={(novoCargo) => updateItem(index, { novoCargo })}
                  options={CARGO_OPTIONS}
                  placeholder="Selecione o novo cargo..."
                />
              ) : null}
              <ReadOnlyAsoField label="Centro de custo" value={row.centroCusto} />
              <ReadOnlyAsoField label="Local de trabalho" value={row.localTrabalho} />
              <ReadOnlyAsoField label="Empresa" value={row.empresa} />
            </div>
            <div>
              <label className={labelCls}>Seguir o PCMSO *</label>
              <div className="flex gap-2">
                <ButtonSeg
                  active={row.seguirPcmso === 'SIM'}
                  onClick={() => updateItem(index, { seguirPcmso: 'SIM' })}
                  label="Sim"
                />
                <ButtonSeg
                  active={row.seguirPcmso === 'NAO'}
                  onClick={() => updateItem(index, { seguirPcmso: 'NAO' })}
                  label="Não"
                />
              </div>
            </div>
          </RepeatableCard>
        );
      })}
      <AddMoreButton onClick={addItem} disabled={asos.length >= MAX_SOLICITACAO_ITENS} />
    </div>
  );
}
