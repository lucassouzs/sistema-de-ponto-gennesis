'use client';

import React from 'react';
import { Input as BaseInput } from '@/components/ui/Input';
import { DEPARTMENTS_LIST } from '@/constants/payrollFilters';

export type DpFormRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO';

type PayrollEmp = { id: string; name: string };

const fieldBox =
  'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm appearance-none focus:!outline-none focus:!ring-2 focus:!ring-red-500 dark:focus:!ring-red-400 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-red-500 dark:focus-visible:!ring-red-400';
const labelCls = 'block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200';
const taCls = `${fieldBox} min-h-[100px] resize-y`;
const inputFieldCls =
  'border-gray-300 dark:border-gray-600 focus:!outline-none focus:!ring-2 focus:!ring-red-500 dark:focus:!ring-red-400 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-red-500 dark:focus-visible:!ring-red-400';
const Input = (props: React.ComponentProps<typeof BaseInput>) => (
  <BaseInput
    {...props}
    className={[inputFieldCls, props.className].filter(Boolean).join(' ')}
  />
);

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

function EmpSelect({
  value,
  onChange,
  employees,
  required,
}: {
  value: string;
  onChange: (id: string) => void;
  employees: PayrollEmp[];
  required?: boolean;
}) {
  return (
    <select
      className={fieldBox}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Selecione o colaborador...</option>
      {employees.map((em) => (
        <option key={em.id} value={em.id}>
          {em.name}
        </option>
      ))}
    </select>
  );
}

function EmployeeComboboxSingle({
  selectedId,
  onPick,
  employees,
  search,
  setSearch,
}: {
  selectedId: string;
  onPick: (id: string) => void;
  employees: PayrollEmp[];
  search: string;
  setSearch: (s: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const q = search.trim().toLowerCase();
  const filtered = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
    : employees;

  const closedSummary = React.useMemo(() => {
    if (!selectedId) return '';
    const name = employees.find((e) => e.id === selectedId)?.name ?? '';
    return name.length > 72 ? `${name.slice(0, 72)}\u2026` : name;
  }, [selectedId, employees]);

  React.useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }
    const onDocMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen, setSearch]);

  const openList = () => {
    setIsOpen((wasOpen) => {
      if (!wasOpen) setSearch('');
      return true;
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const inputCls = `${fieldBox} w-full pr-10 outline-none transition-shadow ${
    isOpen ? 'ring-2 ring-red-500 border-red-500 dark:ring-red-400 dark:border-red-400' : ''
  }`;

  return (
    <div ref={containerRef} className="relative space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          readOnly={!isOpen}
          placeholder={
            selectedId && !isOpen ? 'Clique para alterar o colaborador...' : 'Selecionar colaborador...'
          }
          className={`${inputCls} ${!isOpen ? 'cursor-pointer' : 'cursor-text'}`}
          value={isOpen ? search : closedSummary}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={openList}
          onClick={() => {
            if (!isOpen) openList();
          }}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-xs"
          aria-hidden
        >
          {isOpen ? '\u25B4' : '\u25BE'}
        </span>
      </div>
      {isOpen && (
        <div
          id={listId}
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nenhum colaborador encontrado</div>
          ) : (
            filtered.slice(0, 80).map((em) => {
              const active = em.id === selectedId;
              return (
                <button
                  key={em.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    active ? 'bg-red-50 font-medium text-red-900 dark:bg-red-950/40 dark:text-red-100' : 'text-gray-800 dark:text-gray-200'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(active ? '' : em.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  {em.name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  requestType: DpFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: PayrollEmp[];
  multiEmpSearch: string;
  setMultiEmpSearch: (s: string) => void;
  setEmployeeId: (id: string) => void;
  onAtestadoFile: (file: File | null) => void;
  onHoraExtraFile: (file: File | null) => void;
  atestadoFileName: string;
  horaExtraFileName: string;
};

export function DpSolicitacaoTypeFields({
  requestType,
  details,
  patchDetails,
  employees,
  multiEmpSearch,
  setMultiEmpSearch,
  setEmployeeId,
  onAtestadoFile,
  onHoraExtraFile,
  atestadoFileName,
  horaExtraFileName,
}: Props) {
  const employeeIds = (details.employeeIds as string[] | undefined) ?? [];
  const selectedEmployeeId = employeeIds[0] ?? '';

  switch (requestType) {
    case '':
      return null;
    case 'ADMISSAO': {
      const setorAtual = ((details.setor as string) ?? '').trim();
      const setorForaDaLista = setorAtual && !DEPARTMENTS_LIST.includes(setorAtual);
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Quantidade — Nome — Função — Contato *</label>
            <textarea
              className={taCls}
              placeholder={'Ex.: 2 pedreiros\n2 pintores\nou João — pedreiro — 61999999999'}
              value={(details.quantidadeNomeFuncaoContato as string) ?? ''}
              onChange={(e) => patchDetails({ quantidadeNomeFuncaoContato: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Função — Nome — Quantidade — Contato *</label>
            <textarea
              className={taCls}
              placeholder={'Ex.: Pedreiro — João — (99) 99999-9999'}
              value={(details.funcaoNomeQuantidadeContato as string) ?? ''}
              onChange={(e) => patchDetails({ funcaoNomeQuantidadeContato: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Motivo da contratação *</label>
            <select
              className={fieldBox}
              value={(details.motivoContratacao as string) ?? ''}
              onChange={(e) => patchDetails({ motivoContratacao: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {MOTIVO_CONTRATACAO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Setor *</label>
            <select
              className={fieldBox}
              value={(details.setor as string) ?? ''}
              onChange={(e) => patchDetails({ setor: e.target.value })}
              required
            >
              <option value="">Selecione o setor...</option>
              {setorForaDaLista ? (
                <option value={setorAtual}>{setorAtual}</option>
              ) : null}
              {DEPARTMENTS_LIST.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={taCls}
              value={(details.observacao as string) ?? ''}
              onChange={(e) => patchDetails({ observacao: e.target.value })}
            />
          </div>
        </div>
      );
    }

    case 'FERIAS':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Data inicial *</label>
              <Input
                type="date"
                value={(details.dataInicial as string) ?? ''}
                onChange={(e) => patchDetails({ dataInicial: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Data final *</label>
              <Input
                type="date"
                value={(details.dataFinal as string) ?? ''}
                onChange={(e) => patchDetails({ dataFinal: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={taCls}
              value={(details.observacao as string) ?? ''}
              onChange={(e) => patchDetails({ observacao: e.target.value })}
            />
          </div>
        </div>
      );

    case 'RESCISAO':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Tipo de aviso *</label>
            <select
              className={fieldBox}
              value={(details.tipoAviso as string) ?? ''}
              onChange={(e) => patchDetails({ tipoAviso: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {TIPO_AVISO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo de rescisão *</label>
            <select
              className={fieldBox}
              value={(details.tipoRescisao as string) ?? ''}
              onChange={(e) => patchDetails({ tipoRescisao: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {TIPO_RESCISAO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Motivo *</label>
            <Input
              value={(details.motivo as string) ?? ''}
              onChange={(e) => patchDetails({ motivo: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Observações / particularidades</label>
            <textarea
              className={taCls}
              value={(details.observacoes as string) ?? ''}
              onChange={(e) => patchDetails({ observacoes: e.target.value })}
            />
          </div>
        </div>
      );

    case 'ALTERACAO_FUNCAO_SALARIO':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Função ou/e salário — antigo *</label>
            <Input
              value={(details.funcaoSalarioAntigo as string) ?? ''}
              onChange={(e) => patchDetails({ funcaoSalarioAntigo: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Função ou/e salário — novo *</label>
            <Input
              value={(details.funcaoSalarioNovo as string) ?? ''}
              onChange={(e) => patchDetails({ funcaoSalarioNovo: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              required
            />
          </div>
        </div>
      );

    case 'ADVERTENCIA_SUSPENSAO':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Punição *</label>
            <div className="flex gap-2">
              <ButtonSeg
                active={(details.punicao as string) === 'ADVERTENCIA'}
                onClick={() => patchDetails({ punicao: 'ADVERTENCIA' })}
                label="Advertência"
              />
              <ButtonSeg
                active={(details.punicao as string) === 'SUSPENSAO'}
                onClick={() => patchDetails({ punicao: 'SUSPENSAO' })}
                label="Suspensão"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Motivo *</label>
            <textarea
              className={taCls}
              value={(details.motivo as string) ?? ''}
              onChange={(e) => patchDetails({ motivo: e.target.value })}
              required
            />
          </div>
        </div>
      );

    case 'ATESTADO_MEDICO':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Data inicial *</label>
              <Input
                type="date"
                value={(details.dataInicial as string) ?? ''}
                onChange={(e) => patchDetails({ dataInicial: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Data final *</label>
              <Input
                type="date"
                value={(details.dataFinal as string) ?? ''}
                onChange={(e) => patchDetails({ dataFinal: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Nº dias *</label>
            <Input
              type="text"
              inputMode="numeric"
              value={(details.numeroDias as string) ?? ''}
              onChange={(e) => patchDetails({ numeroDias: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Anexo do atestado (PDF ou imagem, máx. 2 MB) *</label>
            <input
              type="file"
              accept=".pdf,image/*"
              className="block w-full text-sm text-gray-600 dark:text-gray-300"
              onChange={(e) => onAtestadoFile(e.target.files?.[0] ?? null)}
            />
            {atestadoFileName ? (
              <p className="text-xs text-gray-500 mt-1">Arquivo: {atestadoFileName}</p>
            ) : null}
          </div>
        </div>
      );

    case 'RETIFICACAO_ALOCACAO':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Data *</label>
            <Input
              type="date"
              value={(details.data as string) ?? ''}
              onChange={(e) => patchDetails({ data: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              required
            />
          </div>
        </div>
      );

    case 'HORA_EXTRA':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmployeeComboboxSingle
              selectedId={selectedEmployeeId}
              onPick={setEmployeeId}
              employees={employees}
              search={multiEmpSearch}
              setSearch={setMultiEmpSearch}
            />
          </div>
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Datas *</label>
            <textarea
              className={taCls}
              placeholder="Descreva as datas ou período (ex.: 16/04/2026, 17/04/2026)"
              value={(details.datas as string) ?? ''}
              onChange={(e) => patchDetails({ datas: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Anexar autorização de hora extra (máx. 2 MB) *</label>
            <input
              type="file"
              accept=".pdf,image/*"
              className="block w-full text-sm text-gray-600 dark:text-gray-300"
              onChange={(e) => onHoraExtraFile(e.target.files?.[0] ?? null)}
            />
            {horaExtraFileName ? (
              <p className="text-xs text-gray-500 mt-1">Arquivo: {horaExtraFileName}</p>
            ) : null}
          </div>
        </div>
      );

    case 'BENEFICIOS_VIAGEM':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmpSelect
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Data de início *</label>
              <Input
                type="date"
                value={(details.dataInicial as string) ?? ''}
                onChange={(e) => patchDetails({ dataInicial: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Data final *</label>
              <Input
                type="date"
                value={(details.dataFinal as string) ?? ''}
                onChange={(e) => patchDetails({ dataFinal: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Nº de dias *</label>
            <Input
              type="text"
              inputMode="numeric"
              value={(details.numeroDias as string) ?? ''}
              onChange={(e) => patchDetails({ numeroDias: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Motivo da viagem *</label>
            <Input
              value={(details.motivoViagem as string) ?? ''}
              onChange={(e) => patchDetails({ motivoViagem: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Hotel — quantidade de dias (opcional)</label>
            <Input
              type="text"
              inputMode="numeric"
              value={details.diasHotel != null ? String(details.diasHotel) : ''}
              onChange={(e) =>
                patchDetails({ diasHotel: e.target.value === '' ? undefined : e.target.value })
              }
            />
          </div>
        </div>
      );

    case 'OUTRAS_SOLICITACOES':
      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Tipo de solicitação *</label>
            <Input
              value={(details.tipoSolicitacao as string) ?? ''}
              onChange={(e) => patchDetails({ tipoSolicitacao: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Colaborador *</label>
            <EmployeeComboboxSingle
              selectedId={selectedEmployeeId}
              onPick={setEmployeeId}
              employees={employees}
              search={multiEmpSearch}
              setSearch={setMultiEmpSearch}
            />
          </div>
          <div>
            <label className={labelCls}>Situação *</label>
            <Input
              value={(details.situacao as string) ?? ''}
              onChange={(e) => patchDetails({ situacao: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Datas</label>
            <Input
              value={(details.datas as string) ?? ''}
              onChange={(e) => patchDetails({ datas: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Valores</label>
            <Input
              value={(details.valores as string) ?? ''}
              onChange={(e) => patchDetails({ valores: e.target.value })}
              placeholder="Ex.: 1500,00"
            />
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea
              className={taCls}
              value={(details.observacoes as string) ?? ''}
              onChange={(e) => patchDetails({ observacoes: e.target.value })}
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function ButtonSeg({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
