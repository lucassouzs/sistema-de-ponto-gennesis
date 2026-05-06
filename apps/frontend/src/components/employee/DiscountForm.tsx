import React, { useState, useEffect } from 'react';
import { SalaryDiscount, CreateDiscountData, UpdateDiscountData, DiscountType, DiscountTypeOption } from '@/types';
import { X } from 'lucide-react';

interface DiscountFormProps {
  employeeId: string;
  discount?: SalaryDiscount;
  onSave: (data: CreateDiscountData | UpdateDiscountData) => void;
  onCancel: () => void;
}

const discountTypeOptions: DiscountTypeOption[] = [
  { value: 'FINE', label: 'Multa', color: 'text-red-600' },
  { value: 'CONSIGNED', label: 'Consignado', color: 'text-orange-600' },
  { value: 'OTHER', label: 'Outros', color: 'text-gray-600' }
];

export function DiscountForm({ employeeId, discount, onSave, onCancel }: DiscountFormProps) {
  const [formData, setFormData] = useState({
    type: 'FINE' as DiscountType,
    description: '',
    amount: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (discount) {
      setFormData({
        type: discount.type,
        description: discount.description,
        amount: discount.amount.toString()
      });
    }
  }, [discount]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.type) {
      newErrors.type = 'Tipo do desconto é obrigatório';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Descrição é obrigatória';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Valor é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const data = {
      type: formData.type,
      description: formData.description.trim(),
      amount: parseFloat(formData.amount)
    };

    if (discount) {
      // Editando desconto existente
      onSave(data as UpdateDiscountData);
    } else {
      // Criando novo desconto
      onSave({
        employeeId,
        ...data
      } as CreateDiscountData);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {discount ? 'Editar Desconto' : 'Adicionar Desconto'}
        </h4>
        <button
          onClick={onCancel}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tipo de Desconto *
          </label>
          <select
            value={formData.type}
            onChange={(e) => handleInputChange('type', e.target.value as DiscountType)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
              errors.type ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {discountTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.type && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
              {errors.type}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Descrição *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Descreva o motivo do desconto..."
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
              errors.description ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors.description && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
              {errors.description}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Valor (R$) *
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={formData.amount}
            onChange={(e) => handleInputChange('amount', e.target.value)}
            placeholder="0,00"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
              errors.amount ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors.amount && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center">
              {errors.amount}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
          >
            {discount ? 'Atualizar' : 'Adicionar'} Desconto
          </button>
        </div>
      </form>
    </div>
  );
}
