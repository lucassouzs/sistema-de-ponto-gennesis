'use client';

import React, { useCallback, useState } from 'react';
import { X, Plus, List, FileText } from 'lucide-react';
import { PointCorrectionCard } from './PointCorrectionCard';
import { PointCorrectionList } from './PointCorrectionList';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalTabButton } from '@/components/ui/AppTabButton';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

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
    <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
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
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <AppModalTabButton
              accent="blue"
              active={activeTab === 'list'}
              onClick={() => setActiveTab('list')}
              className="flex items-center gap-2 whitespace-nowrap px-1 py-3 text-sm"
            >
              <List className="w-4 h-4" />
              Minhas Solicitações
            </AppModalTabButton>
            <AppModalTabButton
              accent="blue"
              active={activeTab === 'new'}
              onClick={() => setActiveTab('new')}
              className="flex items-center gap-2 whitespace-nowrap px-1 py-3 text-sm"
            >
              <Plus className="w-4 h-4" />
              Nova Solicitação
            </AppModalTabButton>
          </nav>
        </div>

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
    </AppModalOverlay>
    {confirmUi}
    </>
  );
};
