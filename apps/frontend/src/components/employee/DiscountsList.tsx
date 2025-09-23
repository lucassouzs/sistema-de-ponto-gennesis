import React from 'react';
import { SalaryDiscount, UpdateDiscountData } from '@/types';
import { Edit, Trash2, AlertTriangle } from 'lucide-react';

interface DiscountsListProps {
  discounts: SalaryDiscount[];
  onEdit: (discount: SalaryDiscount) => void;
  onDelete: (id: string) => void;
}

const discountTypeLabels = {
  FINE: 'Multa',
  CONSIGNED: 'Consignado',
  OTHER: 'Outros'
};

const discountTypeColors = {
  FINE: 'text-red-600 bg-red-50',
  CONSIGNED: 'text-orange-600 bg-orange-50',
  OTHER: 'text-gray-600 bg-gray-50'
};

export function DiscountsList({ discounts, onEdit, onDelete }: DiscountsListProps) {
  if (discounts.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>Nenhum desconto registrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {discounts.map((discount) => (
        <div
          key={discount.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${discountTypeColors[discount.type]}`}>
                  {discountTypeLabels[discount.type]}
                </span>
                <span className="text-lg font-semibold text-red-600">
                  -R$ {discount.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <p className="text-sm text-gray-700 mb-2">
                {discount.description}
              </p>
              
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Criado por: {discount.creator.name}</span>
                <span>•</span>
                <span>
                  {new Date(discount.createdAt).toLocaleDateString('pt-BR', {
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
                onClick={() => onEdit(discount)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Editar desconto"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(discount.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover desconto"
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
