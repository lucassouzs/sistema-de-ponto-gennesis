import React from 'react';
import { X, Calendar, User, Building, DollarSign, Clock, AlertTriangle, CreditCard } from 'lucide-react';
import { PayrollEmployee } from '@/types';

interface PayrollDetailModalProps {
  employee: PayrollEmployee;
  month: number;
  year: number;
  isOpen: boolean;
  onClose: () => void;
}

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function PayrollDetailModal({ employee, month, year, isOpen, onClose }: PayrollDetailModalProps) {
  if (!isOpen) return null;

  const monthName = monthNames[month - 1];
  
  // Cálculos
  const salarioBase = employee.salary;
  const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
  const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
  const salarioFamilia = employee.familySalary || 0;
  const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
  const descontoPorFaltas = ((salarioBase + periculosidade + insalubridade) / 30) * faltas;
  const totalProventos = salarioBase + periculosidade + insalubridade + salarioFamilia + employee.totalAdjustments;
  const totalDescontos = employee.totalDiscounts + descontoPorFaltas;
  const liquidoReceber = totalProventos - totalDescontos;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2">
                <img 
                  src="/logo.png" 
                  alt="Logo da Empresa" 
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Folha de Pagamento</h2>
                <p className="text-sm text-gray-600">{monthName} de {year}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Employee Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-900 border-b pb-2">
                Dados do Funcionário
              </h4>
              <div className="rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Nome:</span>
                  <span className="text-sm font-medium">{employee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">CPF:</span>
                  <span className="text-sm font-medium">{employee.cpf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Matrícula:</span>
                  <span className="text-sm font-medium">{employee.employeeId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Função:</span>
                  <span className="text-sm font-medium">{employee.position}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Setor:</span>
                  <span className="text-sm font-medium">{employee.department}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-900 border-b pb-2">
                Dados da Empresa
              </h4>
              <div className="rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Empresa:</span>
                  <span className="text-sm font-medium">{employee.company || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Modalidade:</span>
                  <span className="text-sm font-medium">{employee.modality || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Centro de Custo:</span>
                  <span className="text-sm font-medium">{employee.costCenter || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Contrato:</span>
                  <span className="text-sm font-medium">{employee.currentContract || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tomador:</span>
                  <span className="text-sm font-medium">{employee.client || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Banking Info */}
          <div className="space-y-4 mb-6">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">
              Dados Bancários
            </h4>
            <div className="rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Banco:</span>
                    <span className="text-sm font-medium">{employee.bank || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Tipo de Conta:</span>
                    <span className="text-sm font-medium">{employee.accountType || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Agência:</span>
                    <span className="text-sm font-medium">{employee.agency || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Operação:</span>
                    <span className="text-sm font-medium">{employee.operation || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Conta:</span>
                    <span className="text-sm font-medium">{employee.account || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Dígito:</span>
                    <span className="text-sm font-medium">{employee.digit || 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tipo de Chave:</span>
                  <span className="text-sm font-medium">{employee.pixKeyType || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Chave PIX:</span>
                  <span className="text-sm font-medium">{employee.pixKey || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payroll Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              Detalhamento da Folha
            </h3>
            
            <div className="overflow-x-auto shadow-sm border border-gray-200 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Cód.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Descrição
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Referência
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Proventos
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Descontos
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Salário Base */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      001
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      SALÁRIO BASE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      {employee.daysWorked} dias
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 border-r border-gray-200">
                      R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      -
                    </td>
                  </tr>

                  {/* Periculosidade */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      002
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      PERICULOSIDADE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      {employee.dangerPay || 0}%
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 border-r border-gray-200">
                      R$ {periculosidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      -
                    </td>
                  </tr>

                  {/* Insalubridade */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      003
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      INSALUBRIDADE
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      {employee.unhealthyPay || 0}%
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 border-r border-gray-200">
                      R$ {insalubridade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      -
                    </td>
                  </tr>

                  {/* Salário Família */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      004
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      SALÁRIO FAMÍLIA
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 border-r border-gray-200">
                      R$ {salarioFamilia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      -
                    </td>
                  </tr>

                  {/* Acréscimos */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      005
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      ACRÉSCIMOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 border-r border-gray-200">
                      R$ {(employee.totalAdjustments || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      -
                    </td>
                  </tr>

                  {/* Descontos */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      006
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      DESCONTOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 border-r border-gray-200">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700">
                      R$ {(employee.totalDiscounts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Desconto por Faltas */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      007
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      FALTAS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      {faltas || 0} faltas
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400 border-r border-gray-200">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-700">
                      R$ {(descontoPorFaltas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* VA/VT */}
                  <tr className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      008
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      BENEFÍCIOS
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 border-r border-gray-200">
                      {employee.daysWorked} dias
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-700 border-r border-gray-200">
                      R$ {(employee.totalFoodVoucher + employee.totalTransportVoucher).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      -
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-8">
              <h4 className="text-xl font-bold text-gray-900 mb-6 text-center">
                Resumo Financeiro
              </h4>
              <div className="rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Total dos Vencimentos */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Proventos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      R$ {totalProventos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600">
                      Total dos Proventos
                    </div>
                  </div>

                  {/* Total dos Descontos */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descontos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      R$ {totalDescontos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-gray-600">
                      Total dos Descontos
                    </div>
                  </div>

                  {/* Líquido a Receber */}
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <span className="text-xs font-medium text-blue-100 uppercase tracking-wide">Líquido</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      R$ {liquidoReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-blue-100">
                      Valor a Receber
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Info */}
          <div className="mt-6">
            <h4 className="text-xl font-bold text-gray-900 mb-6 text-center">
              Informações de Presença
            </h4>
            <div className="rounded-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Total de Dias Úteis */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Úteis</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {employee.totalWorkingDays}
                  </div>
                  <div className="text-sm text-gray-600">
                    Dias Úteis
                  </div>
                </div>
                
                {/* Dias Trabalhados */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trabalhados</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {employee.daysWorked}
                  </div>
                  <div className="text-sm text-gray-600">
                    Dias Trabalhados
                  </div>
                </div>

                {/* Faltas */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Faltas</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0}
                  </div>
                  <div className="text-sm text-gray-600">
                    Total de Faltas
                  </div>
                </div>

                {/* Percentual de Presença */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                    <span className="text-xs font-medium text-indigo-100 uppercase tracking-wide">Presença</span>
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">
                    {employee.totalWorkingDays ? 
                      ((employee.daysWorked / employee.totalWorkingDays) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm text-indigo-100">
                    Taxa de Presença
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">
              Gênnesis Engenharia - Folha de Pagamento de {monthName} de {year}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
