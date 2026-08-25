'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';

interface RegisterAbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Employee {
  id: string;
  employeeId: string;
  position?: string | null;
  department?: string | null;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export function RegisterAbsenceModal({ isOpen, onClose }: RegisterAbsenceModalProps) {
  const [formData, setFormData] = useState({
    employeeId: '',
    date: '',
    startDate: '',
    endDate: '',
    reason: '',
    observation: '',
    isMultiple: false
  });

  const queryClient = useQueryClient();

  // Buscar lista de funcionários
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-for-absence'],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: {
          page: 1,
          limit: 10000,
          status: 'all'
        }
      });
      const users = res.data?.data || [];
      
      // Filtrar apenas usuários que têm employee associado, excluindo cargo de Administrador
      const employees = users
        .filter((user: any) => {
          if (!user.employee || !user.employee.id) {
            return false;
          }
          if (user.employee.position === 'Administrador') {
            return false;
          }
          return true;
        })
        .map((user: any) => ({
          id: user.employee.id,
          employeeId: user.employee.employeeId || '',
          position: user.employee.position || null,
          department: user.employee.department || null,
          cpf: user.cpf || null,
          profilePhotoUrl: user.profilePhotoUrl || null,
          user: {
            id: user.id,
            name: user.name || '',
            email: user.email || ''
          }
        }))
        .sort((a: Employee, b: Employee) => a.user.name.localeCompare(b.user.name));
      
      return employees;
    },
    enabled: isOpen
  });

  const employees: Employee[] = employeesData || [];

  const employeeSelectOptions = useMemo(
    () =>
      toPersonSelectOptions(
        employees.map((emp) => ({
          value: emp.id,
          name: emp.user.name,
          cpf: emp.cpf,
          profilePhotoUrl: emp.profilePhotoUrl,
          extraSearchText: [emp.position, emp.department, emp.employeeId].filter(Boolean).join(' '),
        }))
      ),
    [employees]
  );

  // Mutation para registrar falta única
  const registerSingleAbsence = useMutation({
    mutationFn: async (data: { employeeId: string; date: string; reason?: string; observation?: string }) => {
      const res = await api.post('/time-records/absence', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Falta registrada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['time-records'] });
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      handleClose();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erro ao registrar falta';
      toast.error(message);
    }
  });

  // Mutation para registrar múltiplas faltas
  const registerMultipleAbsences = useMutation({
    mutationFn: async (data: { employeeId: string; startDate: string; endDate: string; reason?: string; observation?: string }) => {
      const res = await api.post('/time-records/absence/multiple', data);
      return res.data;
    },
    onSuccess: (data) => {
      const message = data.message || 'Faltas registradas com sucesso!';
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ['time-records'] });
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      handleClose();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erro ao registrar faltas';
      toast.error(message);
    }
  });

  const handleClose = useCallback(() => {
    setFormData({
      employeeId: '',
      date: '',
      startDate: '',
      endDate: '',
      reason: '',
      observation: '',
      isMultiple: false
    });
    onClose();
  }, [onClose]);

  const { requestClose, confirmUi } = useModalCloseConfirm(handleClose, { isParentOpen: isOpen });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employeeId) {
      toast.error('Selecione um funcionário');
      return;
    }

    if (formData.isMultiple) {
      if (!formData.startDate || !formData.endDate) {
        toast.error('Preencha as datas de início e fim');
        return;
      }

      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      if (end < start) {
        toast.error('Data de fim deve ser posterior à data de início');
        return;
      }

      registerMultipleAbsences.mutate({
        employeeId: formData.employeeId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason || undefined,
        observation: formData.observation || undefined
      });
    } else {
      if (!formData.date) {
        toast.error('Selecione uma data');
        return;
      }

      registerSingleAbsence.mutate({
        employeeId: formData.employeeId,
        date: formData.date,
        reason: formData.reason || undefined,
        observation: formData.observation || undefined
      });
    }
  };

  if (!isOpen) return null;

  const isLoading = registerSingleAbsence.isPending || registerMultipleAbsences.isPending;

  return (
    <>
    <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="absolute inset-0" onClick={requestClose} aria-hidden />
      <Card className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Registrar Falta
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Registre faltas para funcionários
              </p>
            </div>
            <button
              onClick={requestClose}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seleção de funcionário */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Funcionário *
              </label>
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <SingleSelectSearchDropdown
                  value={formData.employeeId}
                  onChange={(employeeId) => setFormData((current) => ({ ...current, employeeId }))}
                  options={employeeSelectOptions}
                  placeholder="Selecionar funcionário..."
                  searchPlaceholder="Nome ou CPF..."
                  emptyOptionsMessage="Nenhum funcionário disponível."
                  allowEmpty
                  emptyOptionLabel="Nenhum"
                />
              )}
            </div>

            {/* Tipo de registro */}
            <div>
              <label className="flex items-center space-x-3 cursor-pointer">
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isMultiple}
                    onChange={(e) => setFormData({ ...formData, isMultiple: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Registrar múltiplas faltas (período)
                </span>
              </label>
            </div>

            {/* Data única ou período */}
            {formData.isMultiple ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data de Início *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data de Fim *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    required
                    max={new Date().toISOString().split('T')[0]}
                    min={formData.startDate}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Data da Falta *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>
            )}

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Motivo
              </label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Ex: Falta sem justificativa, Falta por motivo pessoal..."
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            {/* Observação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Observação
              </label>
              <textarea
                value={formData.observation}
                onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
                placeholder="Observações adicionais (opcional)"
                rows={3}
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              />
            </div>

            {/* Botões */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={requestClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Registrar Falta</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AppModalOverlay>
    {confirmUi}
    </>
  );
}

