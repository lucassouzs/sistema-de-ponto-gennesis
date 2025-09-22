import React from 'react';
import { SalaryAdjustment, AdjustmentType } from '@/types';
import { Edit, Trash2 } from 'lucide-react';

interface AdjustmentsListProps {
  adjustments: SalaryAdjustment[];
  onEdit: (adjustment: SalaryAdjustment) => void;
  onDelete: (id: string) => void;
}

const getTypeColor = (type: AdjustmentType): string => {
  const colors = {
    BONUS: 'bg-green-100 text-green-800',
    OVERTIME: 'bg-blue-100 text-blue-800',
    COMMISSION: 'bg-purple-100 text-purple-800',
    OTHER: 'bg-gray-100 text-gray-800'
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
  return (
    <div className="space-y-4">
      {adjustments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg font-medium text-gray-900 mb-2">Nenhum acréscimo adicionado</p>
          <p className="text-sm">Adicione acréscimos salariais para este funcionário.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adjustments.map((adjustment) => (
            <div key={adjustment.id} className="bg-gray-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(adjustment.type)}`}>
                      {getTypeLabel(adjustment.type)}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{adjustment.description}</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Adicionado em {formatDate(adjustment.createdAt)} por {adjustment.creator.name}
                  </p>
                </div>
                
                <div className="flex items-center space-x-4">
                  <span className="text-lg font-semibold text-green-600">
                    R$ {adjustment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onEdit(adjustment)}
                      className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar acréscimo"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(adjustment.id)}
                      className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir acréscimo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
