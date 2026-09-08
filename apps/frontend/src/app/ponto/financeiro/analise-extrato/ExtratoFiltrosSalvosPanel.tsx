'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import {
  compactExtratoFiltroPayload,
  describeExtratoFiltroPreset,
  expandExtratoFiltroPayload,
  type ExtratoCaixaFiltroPayload,
  type ExtratoCaixaFiltroSalvo,
  type ExtratoFiltroAllValues
} from '@/lib/extratoCaixaFiltrosSalvos';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

type ExtratoFiltrosSalvosPanelProps = {
  filterDraft: ExtratoCaixaFiltroPayload;
  onLoadDraft: (draft: ExtratoCaixaFiltroPayload) => void;
  allValues: ExtratoFiltroAllValues;
  disabled?: boolean;
};

export function ExtratoFiltrosSalvosPanel({
  filterDraft,
  onLoadDraft,
  allValues,
  disabled = false
}: ExtratoFiltrosSalvosPanelProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [saveName, setSaveName] = useState('');

  const { data: filtrosSalvos = [], isLoading } = useQuery({
    queryKey: ['extrato-caixa-filtros-salvos'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ExtratoCaixaFiltroSalvo[] }>(
        '/extrato-caixa/filtros-salvos'
      );
      return res.data?.data ?? [];
    }
  });

  const selectedPreset = useMemo(
    () => filtrosSalvos.find((f) => f.id === selectedId) ?? null,
    [filtrosSalvos, selectedId]
  );

  const presetSelectOptions = useMemo(
    () => labeledToSelectOptions(filtrosSalvos.map((f) => ({ value: f.id, label: f.nome }))),
    [filtrosSalvos]
  );

  const saveMutation = useMutation({
    mutationFn: async ({ id, nome, payload }: { id?: string; nome: string; payload: ExtratoCaixaFiltroPayload }) => {
      const body = { nome, payload };
      if (id) {
        const res = await api.put(`/extrato-caixa/filtros-salvos/${id}`, body);
        return res.data?.data as ExtratoCaixaFiltroSalvo;
      }
      const res = await api.post('/extrato-caixa/filtros-salvos', body);
      return res.data?.data as ExtratoCaixaFiltroSalvo;
    },
    onSuccess: (row, variables) => {
      queryClient.invalidateQueries({ queryKey: ['extrato-caixa-filtros-salvos'] });
      setSelectedId(row.id);
      setSaveName(row.nome);
      toast.success(
        variables.id ? 'Filtro atualizado com sucesso.' : 'Filtro salvo com sucesso.'
      );
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao salvar filtro.';
      toast.error(msg);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/extrato-caixa/filtros-salvos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extrato-caixa-filtros-salvos'] });
      setSelectedId('');
      toast.success('Filtro removido.');
    },
    onError: () => toast.error('Erro ao excluir filtro.')
  });

  const handleLoad = () => {
    if (!selectedPreset) {
      toast.error('Selecione um filtro salvo para carregar.');
      return;
    }
    const expanded = expandExtratoFiltroPayload(selectedPreset.payload, allValues);
    onLoadDraft(expanded);
    toast.success(`Filtro "${selectedPreset.nome}" carregado. Clique em Aplicar para usar.`);
  };

  const handleSave = () => {
    const nome = saveName.trim();
    if (!nome) {
      toast.error('Informe um nome para salvar o filtro.');
      return;
    }
    const payload = compactExtratoFiltroPayload(filterDraft, allValues);
    const existing = filtrosSalvos.find(
      (f) => f.nome.localeCompare(nome, 'pt-BR', { sensitivity: 'accent' }) === 0
    );
    if (existing?.id) {
      const ok = window.confirm(
        `O filtro salvo "${existing.nome}" já existe.\n\n` +
          'Os critérios atuais do formulário vão substituir a configuração salva anteriormente. ' +
          'Deseja continuar?'
      );
      if (!ok) return;
    }
    saveMutation.mutate({ id: existing?.id, nome, payload });
  };

  const handleDelete = () => {
    if (!selectedPreset) {
      toast.error('Selecione um filtro para excluir.');
      return;
    }
    if (!window.confirm(`Excluir o filtro salvo "${selectedPreset.nome}"?`)) return;
    deleteMutation.mutate(selectedPreset.id);
  };

  const busy = disabled || isLoading || saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Filtros salvos</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="extrato-filtro-salvo-select"
            className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Selecionar filtro
          </label>
          <StringSingleSelectDropdown
            value={selectedId}
            onChange={(id) => {
              setSelectedId(id);
              const preset = filtrosSalvos.find((f) => f.id === id);
              if (preset) setSaveName(preset.nome);
            }}
            options={presetSelectOptions}
            disabled={busy || filtrosSalvos.length === 0}
            placeholder={
              isLoading
                ? 'Carregando…'
                : filtrosSalvos.length === 0
                  ? 'Nenhum filtro salvo ainda'
                  : 'Escolha um filtro…'
            }
            className="w-full"
          />
          {selectedPreset ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" title={describeExtratoFiltroPreset(selectedPreset.payload)}>
              {describeExtratoFiltroPreset(selectedPreset.payload)}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleLoad}
          disabled={busy || !selectedPreset}
          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Carregar
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={busy || !selectedPreset}
          title="Excluir filtro selecionado"
          aria-label="Excluir filtro selecionado"
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-300"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-700 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="extrato-filtro-salvo-nome"
            className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Nome para salvar
          </label>
          <input
            id="extrato-filtro-salvo-nome"
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            maxLength={80}
            disabled={busy}
            placeholder="Ex.: Polo DF — saídas"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="inline-flex h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          {filtrosSalvos.some(
            (f) => f.nome.localeCompare(saveName.trim(), 'pt-BR', { sensitivity: 'accent' }) === 0
          )
            ? 'Atualizar filtro'
            : 'Salvar filtro atual'}
        </button>
      </div>
    </div>
  );
}
