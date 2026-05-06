'use client';

import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import api from '@/lib/api';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

interface PointCorrectionCardProps {
  onSuccess?: () => void;
}

const pointTypes = [
  { value: 'ENTRY', label: 'Entrada' },
  { value: 'LUNCH_START', label: 'Início do Almoço' },
  { value: 'LUNCH_END', label: 'Fim do Almoço' },
  { value: 'EXIT', label: 'Saída' }
];

export const PointCorrectionCard: React.FC<PointCorrectionCardProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    justification: '',
    originalDate: '',
    originalTime: '',
    originalType: 'ENTRY',
    correctedDate: '',
    correctedTime: '',
    correctedType: 'ENTRY'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOriginalRecord, setSelectedOriginalRecord] = useState<string | null>(null);
  const [originalTimeFromRecord, setOriginalTimeFromRecord] = useState<string>(''); // Horário original do ponto selecionado
  const [selectedDate, setSelectedDate] = useState(() => {
    // Por padrão, mostrar pontos de hoje
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Buscar registros de ponto dos últimos 30 dias (apenas pontos batidos, excluindo ausências)
  const { data: timeRecordsData } = useQuery({
    queryKey: ['time-records-for-correction'],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Últimos 30 dias
      
      const response = await api.get('/time-records/my-records', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          limit: 100
        }
      });
      const allRecords = response.data.data || [];
      
      // Filtrar apenas pontos batidos (excluir ausências)
      const validPointTypes = ['ENTRY', 'EXIT', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END'];
      return allRecords.filter((record: any) => validPointTypes.includes(record.type));
    }
  });

  // Filtrar e ordenar pontos pela data selecionada
  const timeRecords = (timeRecordsData || []).filter((record: any) => {
    if (!selectedDate) return false;
    const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
    return recordDate === selectedDate;
  }).sort((a: any, b: any) => {
    // Ordem: ENTRY primeiro, depois LUNCH_START, LUNCH_END, BREAK_START, BREAK_END, EXIT por último
    const order: Record<string, number> = {
      'ENTRY': 1,
      'LUNCH_START': 2,
      'LUNCH_END': 3,
      'BREAK_START': 4,
      'BREAK_END': 5,
      'EXIT': 6
    };
    return (order[a.type] || 99) - (order[b.type] || 99);
  });

  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/solicitacoes', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-corrections'] });
      setFormData({
        title: '',
        justification: '',
        originalDate: '',
        originalTime: '',
        originalType: 'ENTRY',
        correctedDate: '',
        correctedTime: '',
        correctedType: 'ENTRY'
      });
      setSelectedOriginalRecord(null);
      setOriginalTimeFromRecord('');
      toast.success('Solicitação enviada com sucesso!');
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('Erro ao enviar solicitação:', error);
      toast.error(error.response?.data?.error || 'Erro ao enviar solicitação');
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.justification) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!selectedOriginalRecord || !formData.originalDate || !formData.originalTime) {
      toast.error('Selecione um ponto batido para corrigir');
      return;
    }

    if (!formData.originalTime) {
      toast.error('Informe o horário corrigido');
      return;
    }

    if (formData.justification.length < 20) {
      toast.error('A justificativa deve ter pelo menos 20 caracteres');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Preparar dados para envio: 
      // - originalTime deve ser o horário original do ponto (não editado)
      // - correctedTime é o horário editado pelo usuário
      const submitData = {
        ...formData,
        originalTime: originalTimeFromRecord, // Horário original do ponto selecionado
        correctedTime: formData.originalTime, // O horário editado pelo usuário
        correctedDate: formData.originalDate, // Mesma data
        correctedType: formData.originalType // Mesmo tipo
      };
      await submitMutation.mutateAsync(submitData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectOriginalRecord = (record: any) => {
    const recordDate = new Date(record.timestamp);
    // Usar UTC para evitar conversão de timezone
    const year = recordDate.getUTCFullYear();
    const month = String(recordDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(recordDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Extrair horário em UTC para manter o horário exato do banco
    const hours = String(recordDate.getUTCHours()).padStart(2, '0');
    const minutes = String(recordDate.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    // Salvar o horário original do ponto selecionado
    setOriginalTimeFromRecord(timeStr);
    
    setFormData(prev => ({
      ...prev,
      originalDate: dateStr,
      originalTime: timeStr, // Inicialmente igual ao original, mas pode ser editado
      originalType: record.type,
      // Preencher dados corrigidos: mesma data e tipo, horário pode ser alterado
      correctedDate: dateStr,
      correctedTime: timeStr,
      correctedType: record.type
    }));
    setSelectedOriginalRecord(record.id);
  };

  const getTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'ENTRY': 'Entrada',
      'EXIT': 'Saída',
      'LUNCH_START': 'Início do Almoço',
      'LUNCH_END': 'Fim do Almoço',
      'BREAK_START': 'Início Pausa',
      'BREAK_END': 'Fim Pausa'
    };
    return typeMap[type] || type;
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações básicas */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Título da Solicitação *
              </label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Ex: Correção de entrada do dia 15/10"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Justificativa Detalhada *
              </label>
              <textarea
                value={formData.justification}
                onChange={(e) => handleInputChange('justification', e.target.value)}
                placeholder="Descreva o problema e explique detalhadamente por que a correção é necessária..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                rows={4}
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.justification.length}/20 caracteres mínimos
              </p>
            </div>
          </div>

          {/* Dados originais (incorretos) */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
                Dados Originais (Incorretos)
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Selecione o dia e o ponto batido que deseja corrigir
              </p>
            </div>
            
            {/* Seletor de data */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-900 dark:text-gray-300 mb-2">
                Data do Ponto *
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedOriginalRecord(null);
                }}
                max={new Date().toISOString().split('T')[0]}
                required
                fullWidth
              />
            </div>

            {/* Lista de pontos batidos */}
            {selectedDate && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 dark:text-gray-300 mb-3">
                  Selecione o Ponto Batido *
                </label>
                {timeRecords.length === 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
                    <Clock className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Nenhum registro de ponto encontrado para esta data
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {timeRecords.map((record: any) => {
                      const isSelected = selectedOriginalRecord === record.id;
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => handleSelectOriginalRecord(record)}
                          className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                            isSelected
                              ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                          )}
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-md ${
                              isSelected 
                                ? 'bg-blue-100 dark:bg-blue-900/40' 
                                : 'bg-gray-100 dark:bg-gray-700'
                            }`}>
                              <Clock className={`w-4 h-4 ${
                                isSelected 
                                  ? 'text-blue-600 dark:text-blue-400' 
                                  : 'text-gray-600 dark:text-gray-400'
                              }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm mb-1 ${
                                isSelected
                                  ? 'text-blue-900 dark:text-blue-100'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}>
                                {getTypeLabel(record.type)}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                {new Date(record.timestamp).toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Resumo do ponto selecionado */}
            {selectedOriginalRecord && formData.originalDate && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    Ponto Selecionado
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Tipo
                    </label>
                    <div className="bg-white dark:bg-gray-800 rounded-md p-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {getTypeLabel(formData.originalType)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Data
                    </label>
                    <div className="bg-white dark:bg-gray-800 rounded-md p-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {new Date(formData.originalDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Horário Corrigido *
                    </label>
                    <Input
                      type="time"
                      value={formData.originalTime}
                      onChange={(e) => {
                        const newTime = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          originalTime: newTime,
                          correctedTime: newTime // Sincronizar com correctedTime
                        }));
                      }}
                      required
                      className="bg-white dark:bg-gray-800"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  title: '',
                  justification: '',
                  originalDate: '',
                  originalTime: '',
                  originalType: 'ENTRY',
                  correctedDate: '',
                  correctedTime: '',
                  correctedType: 'ENTRY'
                });
                setSelectedOriginalRecord(null);
                setOriginalTimeFromRecord('');
              }}
            >
              Limpar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </div>
        </form>
  );
};
