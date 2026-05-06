import React from 'react';
import { SalaryDiscount, UpdateDiscountData } from '@/types';
import { Edit, Trash2, AlertTriangle } from 'lucide-react';

interface DiscountsListProps {
  discounts: SalaryDiscount[];
  onEdit?: (discount: SalaryDiscount) => void;
  onDelete?: (id: string) => void;
}

const discountTypeLabels = {
  FINE: 'Multa',
  CONSIGNED: 'Consignado',
  OTHER: 'Outros'
};

const discountTypeColors = {
  FINE: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
  CONSIGNED: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30',
  OTHER: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50'
};

export function DiscountsList({ discounts, onEdit, onDelete }: DiscountsListProps) {
  if (discounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
        Nenhum desconto registrado
      </div>
    );
  }

  const total = discounts.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="text-xs text-gray-500 dark:text-gray-400">{discounts.length} registro{discounts.length > 1 ? 's' : ''}</div>
        <div className="text-xs"><span className="text-gray-500 dark:text-gray-400 mr-1">Total:</span><span className="font-semibold text-red-600 dark:text-red-400">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      </div>

      {discounts.map((discount) => (
        <div key={discount.id} className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <div
            className={`grid items-center gap-3 ${onEdit || onDelete ? 'grid-cols-[auto,1fr,auto,auto]' : 'grid-cols-[auto,1fr,auto]'}`}
          >
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${discountTypeColors[discount.type]}`}>{discountTypeLabels[discount.type]}</span>
            <div className="min-w-0">
              <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{discount.description}</p>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{`Criado por ${discount.creator.name} • ${new Date(discount.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</div>
            </div>
            <div className="text-sm font-semibold text-red-600 dark:text-red-400">-R$ {discount.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            {(onEdit || onDelete) && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {onEdit && (
                  <button onClick={() => onEdit(discount)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md" title="Editar">
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(discount.id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md" title="Excluir">
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
