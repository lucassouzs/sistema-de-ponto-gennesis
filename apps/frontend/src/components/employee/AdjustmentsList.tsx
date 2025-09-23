import React from 'react';
import { SalaryAdjustment, AdjustmentType } from '@/types';
import { Edit, Trash2, AlertTriangle } from 'lucide-react';

interface AdjustmentsListProps {
  adjustments: SalaryAdjustment[];
  onEdit: (adjustment: SalaryAdjustment) => void;
  onDelete: (id: string) => void;
}

const getTypeColor = (type: AdjustmentType): string => {
  const colors = {
    BONUS: 'text-green-600 bg-green-50',
    OVERTIME: 'text-blue-600 bg-blue-50',
    COMMISSION: 'text-purple-600 bg-purple-50',
    OTHER: 'text-gray-600 bg-gray-50'
  };
  return colors[type] || colors.OTHER;
};

const getTypeLabel = (type: AdjustmentType): string => {
  const labels = {
    BONUS: 'Bônus/Prêmio',
    OVERTIME: 'Horas Extras',
    COMMISSION: 'Comissão',
    OTHER: 'Outros'
  };
  return labels[type] || 'Outros';
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export function AdjustmentsList({ adjustments, onEdit, onDelete }: AdjustmentsListProps) {
  if (adjustments.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>Nenhum acréscimo registrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {adjustments.map((adjustment) => (
        <div
          key={adjustment.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(adjustment.type)}`}>
                  {getTypeLabel(adjustment.type)}
                </span>
                <span className="text-lg font-semibold text-green-600">
                  +R$ {adjustment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <p className="text-sm text-gray-700 mb-2">
                {adjustment.description}
              </p>
              
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Criado por: {adjustment.creator.name}</span>
                <span>•</span>
                <span>
                  {new Date(adjustment.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => onEdit(adjustment)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Editar acréscimo"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(adjustment.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover acréscimo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
