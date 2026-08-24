'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { ListPagination } from '@/components/ui/ListPagination';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  EMPTY_AJUSTE_FORM,
  type ExtratoCaixaAjuste,
  type ExtratoCaixaAjusteForm,
  ajusteToForm,
  buildCcSelectOptions,
  buildFornecedorSelectOptions,
  buildNatureSelectOptions,
  resolveCcFromSelect,
  resolveFornecedorFromSelect,
  resolveNatureFromSelect,
  parseAjusteValorInput,
  maskAjusteValorInput
} from '@/lib/extratoCaixaAjuste';
import type { ExtratoCaixaItem } from './extratoCaixaTypes';

const FILIAL_UF_POR_CODIGO: Record<number, string> = {
  1: 'DF',
  2: 'RS',
  3: 'RN',
  4: 'PB',
  5: 'GO'
};

function formatFilialLabel(codFilial: number | null): string {
  if (codFilial == null) return 'Sem filial';
  const uf = FILIAL_UF_POR_CODIGO[codFilial];
  if (uf) return `FILIAL ${codFilial} - ${uf}`;
  return `Filial ${codFilial}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-red-400';

const LABEL_CLASS = 'mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400';

const AJUSTES_ITEMS_PER_PAGE = 20;

const AJUSTE_TH =
  'px-3 sm:px-6 py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400';
const AJUSTE_TD = 'px-3 sm:px-6 py-3 text-sm';

function AjustesBlockIcon() {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30 sm:p-3">
      <SlidersHorizontal
        className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6"
        aria-hidden
      />
    </div>
  );
}

type ApiListResponse = { success: boolean; data: ExtratoCaixaAjuste[]; message?: string };
type ApiOneResponse = { success: boolean; data: ExtratoCaixaAjuste; message?: string };

function formToPayload(form: ExtratoCaixaAjusteForm, sourceItems: ExtratoCaixaItem[]) {
  const cc = resolveCcFromSelect(form.codCCusto, sourceItems);
  const nature = resolveNatureFromSelect(form.codNatFinanceira, sourceItems);
  return {
    dataCompensacao: form.dataCompensacao,
    codCCusto: cc.codCCusto,
    ccusto: cc.ccusto,
    codNatFinanceira: nature.codNatFinanceira,
    natureza: nature.natureza,
    codFilial: form.codFilial === '' ? null : Number(form.codFilial),
    fornecedor: resolveFornecedorFromSelect(form.fornecedor),
    valor: parseAjusteValorInput(form.valor),
    observacao: form.observacao.trim() || null
  };
}

function ensureSelectOption(
  options: { value: string; label: string }[],
  value: string,
  label: string
): { value: string; label: string }[] {
  if (!value) return options;
  if (options.some((o) => o.value === value)) return options;
  return [{ value, label: label || value }, ...options];
}

export function ExtratoCaixaAjustesPanel({
  enabled,
  sourceItems,
  ajustesVisiveis,
  totalAjustesCadastrados
}: {
  enabled: boolean;
  sourceItems: ExtratoCaixaItem[];
  /** Recorte conforme filtros do balanço; quando omitido, exibe todos do cadastro. */
  ajustesVisiveis?: ExtratoCaixaAjuste[];
  totalAjustesCadastrados?: number;
}) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExtratoCaixaAjuste | null>(null);
  const [form, setForm] = useState<ExtratoCaixaAjusteForm>(EMPTY_AJUSTE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExtratoCaixaAjuste | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState(false);

  const ccOptionsBase = useMemo(() => buildCcSelectOptions(sourceItems), [sourceItems]);
  const natureOptionsBase = useMemo(() => buildNatureSelectOptions(sourceItems), [sourceItems]);
  const fornecedorOptionsBase = useMemo(
    () => buildFornecedorSelectOptions(sourceItems),
    [sourceItems]
  );

  const ccOptions = useMemo(
    () => ensureSelectOption(ccOptionsBase, form.codCCusto, form.ccusto),
    [ccOptionsBase, form.codCCusto, form.ccusto]
  );
  const natureOptions = useMemo(
    () => ensureSelectOption(natureOptionsBase, form.codNatFinanceira, form.natureza),
    [natureOptionsBase, form.codNatFinanceira, form.natureza]
  );
  const fornecedorOptions = useMemo(
    () => ensureSelectOption(fornecedorOptionsBase, form.fornecedor, form.fornecedor),
    [fornecedorOptionsBase, form.fornecedor]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['extrato-caixa-ajustes'],
    queryFn: async () => {
      const res = await api.get<ApiListResponse>('/extrato-caixa/ajustes');
      return res.data;
    },
    enabled
  });

  const ajustesCadastrados = data?.data ?? [];
  const ajustes = ajustesVisiveis ?? ajustesCadastrados;
  const totalCadastrados = totalAjustesCadastrados ?? ajustesCadastrados.length;
  const recorteParcial = totalCadastrados > 0 && ajustes.length < totalCadastrados;

  const totalPages = Math.max(1, Math.ceil(ajustes.length / AJUSTES_ITEMS_PER_PAGE));
  const showPagination = ajustes.length > AJUSTES_ITEMS_PER_PAGE;

  useEffect(() => {
    setCurrentPage(1);
  }, [ajustes.length]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedAjustes = useMemo(() => {
    const start = (currentPage - 1) * AJUSTES_ITEMS_PER_PAGE;
    return ajustes.slice(start, start + AJUSTES_ITEMS_PER_PAGE);
  }, [ajustes, currentPage]);

  const rangeStart =
    ajustes.length === 0 ? 0 : (currentPage - 1) * AJUSTES_ITEMS_PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * AJUSTES_ITEMS_PER_PAGE, ajustes.length);

  const refetchAjustes = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: ['extrato-caixa-ajustes'] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form, sourceItems);
      if (editing) {
        const res = await api.put<ApiOneResponse>(`/extrato-caixa/ajustes/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post<ApiOneResponse>('/extrato-caixa/ajustes', payload);
      return res.data;
    },
    onSuccess: async (result) => {
      if (result.success === false) {
        setFormError(result.message || 'Não foi possível salvar o ajuste.');
        return;
      }
      await refetchAjustes();
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_AJUSTE_FORM);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Erro ao salvar ajuste.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/extrato-caixa/ajustes/${id}`);
    },
    onSuccess: async () => {
      await refetchAjustes();
      setDeleteTarget(null);
    }
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_AJUSTE_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (ajuste: ExtratoCaixaAjuste) => {
    setEditing(ajuste);
    setForm(ajusteToForm(ajuste));
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saveMutation.isPending) return;
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_AJUSTE_FORM);
    setFormError(null);
  };

  const listsReady = sourceItems.length > 0 || ccOptions.length > 0;

  const ccSelectOptions = useMemo(
    () => [
      {
        value: '',
        label: listsReady ? 'Selecione o centro de custo' : 'Carregue o balanço para listar opções',
        searchText: '',
      },
      ...ccOptions,
    ],
    [ccOptions, listsReady]
  );

  const natureSelectOptions = useMemo(
    () => [
      {
        value: '',
        label: listsReady
          ? 'Selecione a natureza financeira'
          : 'Carregue o balanço para listar opções',
        searchText: '',
      },
      ...natureOptions,
    ],
    [natureOptions, listsReady]
  );

  const filialSelectOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Sem filial' },
        ...Object.entries(FILIAL_UF_POR_CODIGO).map(([code, uf]) => ({
          value: code,
          label: `FILIAL ${code} - ${uf}`,
        })),
      ]),
    []
  );

  const fornecedorSelectOptions = useMemo(
    () => [
      {
        value: '',
        label: listsReady ? 'Selecione o fornecedor' : 'Carregue o balanço para listar opções',
        searchText: '',
      },
      ...fornecedorOptions,
    ],
    [fornecedorOptions, listsReady]
  );

  if (!enabled) return null;

  return (
    <>
      <Card className="w-full overflow-hidden">
        <CardHeader className={expanded ? 'border-b-0 pb-1' : 'border-b-0 pb-4'}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <AjustesBlockIcon />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold leading-tight text-gray-900 dark:text-gray-100">
                  Ajustes Manuais
                </h3>
                {expanded ? (
                  <p className="text-sm leading-snug text-gray-600 dark:text-gray-400">
                    Correções permanentes somadas ao balanço do TOTVS (resumos e listagem).
                    {recorteParcial
                      ? ' A listagem abaixo segue os filtros aplicados.'
                      : null}
                  </p>
                ) : (
                  <p className="text-sm leading-snug text-gray-500 dark:text-gray-400">
                    {isLoading
                      ? 'Carregando...'
                      : ajustes.length === 0
                        ? recorteParcial && totalCadastrados > 0
                          ? `Nenhum no recorte (${totalCadastrados} cadastrado${totalCadastrados !== 1 ? 's' : ''})`
                          : 'Nenhum cadastrado'
                        : recorteParcial
                          ? `${ajustes.length} de ${totalCadastrados} no recorte`
                          : `${ajustes.length} ${ajustes.length === 1 ? 'ajuste cadastrado' : 'ajustes cadastrados'}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {expanded ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex h-10 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Novo ajuste</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-expanded={expanded}
                aria-controls="extrato-ajustes-panel-content"
                title={expanded ? 'Minimizar' : 'Maximizar'}
              >
                {expanded ? (
                  <ChevronUp className="h-5 w-5" aria-hidden />
                ) : (
                  <ChevronDown className="h-5 w-5" aria-hidden />
                )}
                <span className="sr-only">{expanded ? 'Minimizar seção' : 'Maximizar seção'}</span>
              </button>
            </div>
          </div>
        </CardHeader>
        {expanded ? (
        <CardContent id="extrato-ajustes-panel-content">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando ajustes...
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2 py-8 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {(error as Error)?.message || 'Erro ao carregar ajustes.'}
            </div>
          ) : ajustes.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                {recorteParcial && totalCadastrados > 0
                  ? 'Nenhum ajuste manual neste recorte de filtros'
                  : 'Nenhum ajuste manual cadastrado'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                {recorteParcial && totalCadastrados > 0
                  ? 'Altere os filtros para ver outros ajustes ou cadastre um novo no recorte atual'
                  : 'Clique em "Novo ajuste" para incluir uma correção'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span>
                  Mostrando {rangeStart} a {rangeEnd} de {ajustes.length} ajustes
                </span>
                {showPagination ? (
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                ) : null}
              </div>
              <div className="table-scroll">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={`${AJUSTE_TH} text-left`}>Data</th>
                      <th className={`${AJUSTE_TH} text-left`}>Centro de custo</th>
                      <th className={`${AJUSTE_TH} text-left`}>Natureza</th>
                      <th className={`${AJUSTE_TH} text-left`}>Filial</th>
                      <th className={`${AJUSTE_TH} text-left`}>Observação</th>
                      <th className={`${AJUSTE_TH} text-right`}>Valor</th>
                      <th className={`${AJUSTE_TH} text-right`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedAjustes.map((ajuste) => (
                      <tr
                        key={ajuste.id}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td
                          className={`${AJUSTE_TD} whitespace-nowrap text-gray-900 dark:text-gray-100`}
                        >
                          {formatDateBr(ajuste.dataCompensacao)}
                        </td>
                        <td
                          className={`${AJUSTE_TD} max-w-[12rem] truncate text-gray-900 dark:text-gray-100`}
                          title={ajuste.ccusto || undefined}
                        >
                          {ajuste.ccusto || '—'}
                        </td>
                        <td
                          className={`${AJUSTE_TD} max-w-[12rem] truncate text-gray-900 dark:text-gray-100`}
                          title={ajuste.natureza || undefined}
                        >
                          {ajuste.natureza || '—'}
                        </td>
                        <td
                          className={`${AJUSTE_TD} whitespace-nowrap text-gray-900 dark:text-gray-100`}
                        >
                          {formatFilialLabel(ajuste.codFilial)}
                        </td>
                        <td
                          className={`${AJUSTE_TD} max-w-[14rem] truncate text-gray-700 dark:text-gray-300`}
                          title={ajuste.observacao || undefined}
                        >
                          {ajuste.observacao?.trim() || '—'}
                        </td>
                        <td
                          className={`${AJUSTE_TD} whitespace-nowrap text-right tabular-nums font-medium ${
                            ajuste.valor >= 0
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatCurrency(ajuste.valor)}
                        </td>
                        <td className={`${AJUSTE_TD} whitespace-nowrap text-right`}>
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(ajuste)}
                              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                              title="Editar"
                              aria-label="Editar ajuste"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(ajuste)}
                              className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              title="Excluir"
                              aria-label="Excluir ajuste"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </CardContent>
        ) : null}
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar ajuste manual' : 'Novo ajuste manual'}
        size="lg"
        contentOverflowVisible
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            const valorNum = parseAjusteValorInput(form.valor);
            if (Number.isNaN(valorNum)) {
              setFormError('Informe um valor válido para a correção.');
              return;
            }
            saveMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="ajuste-data" className={LABEL_CLASS}>
              Data de compensação *
            </label>
            <input
              id="ajuste-data"
              type="date"
              required
              value={form.dataCompensacao}
              onChange={(e) => setForm((f) => ({ ...f, dataCompensacao: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="ajuste-cc" className={LABEL_CLASS}>
              Centro de custo
            </label>
            <StringSingleSelectDropdown
              value={form.codCCusto}
              onChange={(v) => {
                const cc = resolveCcFromSelect(v, sourceItems);
                setForm((f) => ({
                  ...f,
                  codCCusto: v,
                  ccusto: cc.ccusto,
                }));
              }}
              options={ccSelectOptions}
              disabled={!listsReady}
              allowEmpty={false}
            />
          </div>

          <div>
            <label htmlFor="ajuste-natureza" className={LABEL_CLASS}>
              Natureza financeira
            </label>
            <StringSingleSelectDropdown
              value={form.codNatFinanceira}
              onChange={(v) => {
                const nat = resolveNatureFromSelect(v, sourceItems);
                setForm((f) => ({
                  ...f,
                  codNatFinanceira: v,
                  natureza: nat.natureza,
                }));
              }}
              options={natureSelectOptions}
              disabled={!listsReady}
              allowEmpty={false}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ajuste-filial" className={LABEL_CLASS}>
                Filial
              </label>
              <StringSingleSelectDropdown
                value={form.codFilial}
                onChange={(v) => setForm((f) => ({ ...f, codFilial: v }))}
                options={filialSelectOptions}
                allowEmpty={false}
              />
            </div>
            <div>
              <label htmlFor="ajuste-fornecedor" className={LABEL_CLASS}>
                Fornecedor
              </label>
              <StringSingleSelectDropdown
                value={form.fornecedor}
                onChange={(v) => setForm((f) => ({ ...f, fornecedor: resolveFornecedorFromSelect(v) }))}
                options={fornecedorSelectOptions}
                disabled={!listsReady}
                allowEmpty={false}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ajuste-valor" className={LABEL_CLASS}>
              Valor da correção * (positivo = entrada, negativo = saída)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                R$
              </span>
              <input
                id="ajuste-valor"
                type="text"
                inputMode="decimal"
                required
                value={form.valor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valor: maskAjusteValorInput(e.target.value) }))
                }
                placeholder="0,00"
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ajuste-obs" className={LABEL_CLASS}>
              Observação (histórico)
            </label>
            <input
              id="ajuste-obs"
              type="text"
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              className={INPUT_CLASS}
              placeholder="Ajuste manual"
            />
          </div>

          {formError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={closeModal}
              disabled={saveMutation.isPending}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending || !listsReady}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Salvar alterações' : 'Cadastrar ajuste'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteTarget != null}
        onClose={() => !deleteMutation.isPending && setDeleteTarget(null)}
        confirmBeforeClose={false}
      title="Excluir ajuste"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Excluir este ajuste manual? A alteração será removida permanentemente do balanço.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleteMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Excluir
          </button>
        </div>
      </Modal>
    </>
  );
}
