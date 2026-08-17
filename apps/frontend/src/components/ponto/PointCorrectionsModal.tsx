'use client';

import React, { useCallback, useState } from 'react';
import { X, Plus, List, FileText } from 'lucide-react';
import { PointCorrectionCard } from './PointCorrectionCard';
import { PointCorrectionList } from './PointCorrectionList';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppTabButton } from '@/components/ui/AppTabButton';

interface PointCorrectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PointCorrectionsModal: React.FC<PointCorrectionsModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');

  const closeModal = useCallback(() => {
    onClose();
  }, [onClose]);

  const { requestClose, confirmUi } = useModalCloseConfirm(closeModal, { isParentOpen: isOpen });

  if (!isOpen) return null;

  const handleSuccess = () => {
    setActiveTab('list');
  };

  return (
    <>
    <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={requestClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Solicitações de Correção de Ponto
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Gerencie suas solicitações de correção de ponto
            </p>
          </div>
          <button
            onClick={requestClose}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <nav className="-mb-px flex flex-wrap gap-1 overflow-x-auto px-6 py-1">
          <AppTabButton
            active={activeTab === 'list'}
            onClick={() => setActiveTab('list')}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium"
          >
            <List className="w-4 h-4" />
            Minhas Solicitações
          </AppTabButton>
          <AppTabButton
            active={activeTab === 'new'}
            onClick={() => setActiveTab('new')}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova Solicitação
          </AppTabButton>
        </nav>

        {/* Conteúdo */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6">
            {activeTab === 'list' ? (
              <PointCorrectionList />
            ) : (
              <PointCorrectionCard onSuccess={handleSuccess} />
            )}
          </div>
        </div>
      </div>
    </div>
    {confirmUi}
    </>
  );
};
