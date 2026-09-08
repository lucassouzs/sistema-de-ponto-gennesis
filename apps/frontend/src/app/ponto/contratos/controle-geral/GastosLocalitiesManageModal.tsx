'use client';

import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  createGastosLocality,
  deleteGastosLocality,
  loadGastosLocalitiesCatalog,
  renameGastosLocality,
  type GastosLocalityItem
} from './gastosOperacionaisLocalitiesStore';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCatalogChanged: () => void;
};

export function GastosLocalitiesManageModal({ isOpen, onClose, onCatalogChanged }: Props) {
  const [items, setItems] = useState<GastosLocalityItem[]>([]);
  const [draftLabel, setDraftLabel] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const refresh = () => {
    setItems(loadGastosLocalitiesCatalog());
  };

  useEffect(() => {
    if (!isOpen) return;
    refresh();
    setDraftLabel('');
    setEditingKey(null);
    setEditingLabel('');
  }, [isOpen]);

  const handleCreate = () => {
    try {
      createGastosLocality(draftLabel);
      setDraftLabel('');
      refresh();
      onCatalogChanged();
      toast.success('Localidade criada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a localidade.');
    }
  };

  const handleStartEdit = (item: GastosLocalityItem) => {
    setEditingKey(item.key);
    setEditingLabel(item.label);
  };

  const handleSaveEdit = () => {
    if (!editingKey) return;
    try {
      renameGastosLocality(editingKey, editingLabel);
      setEditingKey(null);
      setEditingLabel('');
      refresh();
      onCatalogChanged();
      toast.success('Localidade atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível editar a localidade.');
    }
  };

  const handleDelete = (item: GastosLocalityItem) => {
    const confirmed = window.confirm(
      `Remover a localidade "${item.label}"?\n\nTodos os contratos dessa localidade vão para Sem localidade.`
    );
    if (!confirmed) return;

    try {
      const result = deleteGastosLocality(item.key);
      refresh();
      onCatalogChanged();
      toast.success(
        result.movedContracts > 0
          ? `Localidade removida. ${result.movedContracts} contrato(s) movido(s) para Sem localidade.`
          : 'Localidade removida.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a localidade.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar localidades" size="md" confirmBeforeClose>
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nova localidade
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Ex.: Bahia"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <Button type="button" onClick={handleCreate} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              Criar
            </Button>
          </div>
        </div>

        <div className="max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma localidade cadastrada.
            </p>
          ) : (
            items.map((item) => {
              const isEditing = editingKey === item.key;
              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center"
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveEdit();
                        }
                        if (e.key === 'Escape') {
                          setEditingKey(null);
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      autoFocus
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.label}
                      </p>
                      {item.builtIn ? (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">Padrão do sistema</p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <Button type="button" size="sm" onClick={handleSaveEdit}>
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingKey(null)}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                          title="Editar"
                          aria-label={`Editar ${item.label}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          title="Remover"
                          aria-label={`Remover ${item.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Ao remover uma localidade, os contratos dela passam para <strong>Sem localidade</strong>.
        </p>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
