import React, { useState, useEffect } from 'react';
import { SalaryAdjustment, AdjustmentType, CreateAdjustmentData, UpdateAdjustmentData } from '@/types';
import { X } from 'lucide-react';

interface AdjustmentFormProps {
  employeeId: string;
  adjustment?: SalaryAdjustment;
  onSave: (data: CreateAdjustmentData | UpdateAdjustmentData) => void;
  onCancel: () => void;
}

const adjustmentTypes: { value: AdjustmentType; label: string }[] = [
  { value: 'BONUS', label: 'Bônus/Prêmio' },
  { value: 'OVERTIME', label: 'Horas Extras' },
  { value: 'COMMISSION', label: 'Comissão' },
  { value: 'OTHER', label: 'Outros' }
];

export function AdjustmentForm({ employeeId, adjustment, onSave, onCancel }: AdjustmentFormProps) {
  const [formData, setFormData] = useState({
    type: 'BONUS' as AdjustmentType,
    description: '',
    amount: '',
    isFixed: false
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (adjustment) {
      setFormData({
        type: adjustment.type,
        description: adjustment.description,
        amount: adjustment.amount.toString(),
        isFixed: adjustment.isFixed || false
      });
    }
  }, [adjustment]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Descrição é obrigatória';
    } else if (formData.description.trim().length < 3) {
      newErrors.description = 'Descrição deve ter pelo menos 3 caracteres';
    }

    if (!formData.amount) {
      newErrors.amount = 'Valor é obrigatório';
    } else {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Valor deve ser maior que zero';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const amount = parseFloat(formData.amount);
    
    if (adjustment) {
      // Atualizar acréscimo existente
      const updateData: UpdateAdjustmentData = {
        type: formData.type,
        description: formData.description.trim(),
        amount: amount,
        isFixed: formData.isFixed
      };
      onSave(updateData);
    } else {
      // Criar novo acréscimo
      const createData: CreateAdjustmentData = {
        employeeId,
        type: formData.type,
        description: formData.description.trim(),
        amount: amount,
        isFixed: formData.isFixed
      };
      onSave(createData);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpar erro do campo quando usuário começar a digitar
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {adjustment ? 'Editar Acréscimo' : 'Adicionar Acréscimo'}
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tipo de Acréscimo *
          </label>
          <select
            value={formData.type}
            onChange={(e) => handleInputChange('type', e.target.value as AdjustmentType)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {adjustmentTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Descrição *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Descreva o motivo do acréscimo..."
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
              errors.description ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Valor (R$) *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.amount}
            onChange={(e) => handleInputChange('amount', e.target.value)}
            placeholder="0,00"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
              errors.amount ? 'border-red-300 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {errors.amount && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.amount}</p>
          )}
        </div>

        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isFixed}
              onChange={(e) => handleInputChange('isFixed', e.target.checked)}
              className="w-4 h-4 text-blue-600 dark:text-blue-500 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-700"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Acréscimo Fixo
            </span>
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Se marcado, este acréscimo será aplicado automaticamente na folha de pagamento de todos os meses
          </p>
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
            className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
          >
            {adjustment ? 'Atualizar' : 'Adicionar'} Acréscimo
          </button>
        </div>
      </form>
    </div>
  );
}
