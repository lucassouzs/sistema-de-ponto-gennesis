'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  FD_PURCHASE_STATUS_OPTIONS,
  formatCurrencyDisplay,
  purchaseStatusLabel,
  type DemandSheetPurchaseStatus,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

interface FichaDemandaPurchaseStatusModalProps {
  record: FichaDemandaApprovalRecord | null;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (purchaseStatus: DemandSheetPurchaseStatus) => void;
}

const fieldClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

type DropdownPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUp: boolean;
};

function computeDropdownPos(trigger: HTMLElement): DropdownPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const margin = 12;
  const maxHeight = 240;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;

  if (openUp) {
    return {
      left: rect.left,
      width: rect.width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight: Math.min(maxHeight, spaceAbove - gap),
      openUp: true,
    };
  }

  return {
    left: rect.left,
    width: rect.width,
    top: rect.bottom + gap,
    maxHeight: Math.min(maxHeight, spaceBelow - gap),
    openUp: false,
  };
}

export function FichaDemandaPurchaseStatusModal({
  record,
  isOpen,
  isSaving = false,
  onClose,
  onSave,
}: FichaDemandaPurchaseStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<DemandSheetPurchaseStatus | ''>('');
  const [searchValue, setSearchValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncDropdownPos = () => {
    if (!inputRef.current) return;
    setDropdownPos(computeDropdownPos(inputRef.current));
  };

  useLayoutEffect(() => {
    if (!showDropdown) {
      setDropdownPos(null);
      return;
    }
    syncDropdownPos();
    const onReposition = () => syncDropdownPos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [showDropdown, searchValue]);

  useEffect(() => {
    if (!record) {
      setSelectedStatus('');
      setSearchValue('');
      return;
    }
    const status = record.purchaseStatus ?? '';
    setSelectedStatus(status);
    setSearchValue(status ? purchaseStatusLabel(status) : '');
  }, [record]);

  const filteredOptions = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return FD_PURCHASE_STATUS_OPTIONS;
    return FD_PURCHASE_STATUS_OPTIONS.filter((o) => o.label.toLowerCase().includes(q));
  }, [searchValue]);

  const selectOption = (value: DemandSheetPurchaseStatus) => {
    setSelectedStatus(value);
    setSearchValue(purchaseStatusLabel(value));
    setShowDropdown(false);
  };

  const handleSave = () => {
    if (!selectedStatus) return;
    onSave(selectedStatus);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Status de compras — Ficha de Demanda"
      size="lg"
      contentOverflowVisible
    >
      {record ? (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Cód. ficha de demanda</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.codFichaDemanda}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Código do pedido</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.codigoPedido}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Contrato</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.contratoNome}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Obra</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.obra}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.solicitanteNome}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Polo</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.polo}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento estimado</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrencyDisplay(record.faturamentoEstimado)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Custo estimado</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrencyDisplay(record.custoEstimado)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Observação</p>
            <p className="text-gray-900 dark:text-gray-100">{record.observacao}</p>
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <label className="mb-1 block text-xs font-medium text-red-600 dark:text-red-400">
              Aprovação<span className="text-red-500"> *</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value.trim()) setSelectedStatus('');
                }}
                onFocus={() => {
                  syncDropdownPos();
                  setShowDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                placeholder="Selecione o status..."
                className={fieldClass}
              />
              {mounted && showDropdown && dropdownPos
                ? createPortal(
                    <div
                      className="overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
                      style={{
                        position: 'fixed',
                        zIndex: 99999,
                        left: dropdownPos.left,
                        width: dropdownPos.width,
                        maxHeight: dropdownPos.maxHeight,
                        ...(dropdownPos.openUp
                          ? { bottom: dropdownPos.bottom }
                          : { top: dropdownPos.top }),
                      }}
                    >
                      {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectOption(option.value)}
                            className={`block w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                              selectedStatus === option.value
                                ? 'bg-red-50 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          Nenhuma opção encontrada
                        </p>
                      )}
                    </div>,
                    document.body
                  )
                : null}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selecione um único status de compras para esta ficha.
            </p>
            {record.purchaseStatusUpdatedAt ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Última atualização: {record.purchaseStatusUpdatedAt}
                {record.purchaseStatusUpdaterNome
                  ? ` — ${record.purchaseStatusUpdaterNome}`
                  : ''}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={!selectedStatus || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar status'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
