import React from 'react';
import { SalaryAdjustment, AdjustmentType } from '@/types';
import { Edit, Trash2, AlertTriangle } from 'lucide-react';

interface AdjustmentsListProps {
  adjustments: SalaryAdjustment[];
  onEdit?: (adjustment: SalaryAdjustment) => void;
  onDelete?: (id: string) => void;
}

const getTypeColor = (type: AdjustmentType): string => {
  const colors = {
    BONUS: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30',
    OVERTIME: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
    COMMISSION: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30',
    OTHER: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50'
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
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
        Nenhum acréscimo registrado
      </div>
    );
  }

  const total = adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="text-xs text-gray-500 dark:text-gray-400">{adjustments.length} registro{adjustments.length > 1 ? 's' : ''}</div>
        <div className="text-xs"><span className="text-gray-500 dark:text-gray-400 mr-1">Total:</span><span className="font-semibold text-green-600 dark:text-green-400">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      </div>

      {adjustments.map((adjustment) => (
        <div key={adjustment.id} className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <div
            className={`grid items-center gap-3 ${onEdit || onDelete ? 'grid-cols-[auto,1fr,auto,auto]' : 'grid-cols-[auto,1fr,auto]'}`}
          >
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeColor(adjustment.type)}`}>{getTypeLabel(adjustment.type)}</span>
            <div className="min-w-0">
              <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{adjustment.description}</p>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{`Criado por ${adjustment.creator.name} • ${new Date(adjustment.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</div>
            </div>
            <div className="text-sm font-semibold text-green-600 dark:text-green-400">+R$ {adjustment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            {(onEdit || onDelete) && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {onEdit && (
                  <button onClick={() => onEdit(adjustment)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md" title="Editar">
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(adjustment.id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
