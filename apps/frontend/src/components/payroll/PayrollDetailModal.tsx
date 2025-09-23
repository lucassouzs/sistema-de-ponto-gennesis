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
                <h2 className="text-xl font-bold text-gray-900">Recibo de Pagamento de Salário</h2>
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
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700 text-center">Cód.</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Descrição</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Referência</th>
                    <th className="border border-gray-300 px-4 py-2 text-right text-sm font-medium text-gray-700">Proventos</th>
                    <th className="border border-gray-300 px-4 py-2 text-right text-sm font-medium text-gray-700">Descontos</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Salário Base */}
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-center">001</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">SALÁRIO BASE</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">{employee.daysWorked} dias</td>
                     <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-green-600">
                       R$ {salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                  </tr>

                  {/* Periculosidade */}
                  {periculosidade > 0 && (
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-center">002</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">ADICIONAL DE PERICULOSIDADE</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">{employee.dangerPay}%</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-green-600">
                         R$ {periculosidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                    </tr>
                  )}

                  {/* Insalubridade */}
                  {insalubridade > 0 && (
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-center">003</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">ADICIONAL DE INSALUBRIDADE</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">{employee.unhealthyPay}%</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-green-600">
                         R$ {insalubridade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                    </tr>
                  )}

                  {/* Salário Família */}
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-center">004</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">SALÁRIO FAMÍLIA</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">-</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-green-600">
                      R$ {salarioFamilia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                  </tr>

                  {/* Acréscimos */}
                  {employee.totalAdjustments > 0 && (
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-center">005</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">ACRÉSCIMOS</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">-</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-green-600">
                         R$ {employee.totalAdjustments.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                    </tr>
                  )}

                   {/* Descontos */}
                   {employee.totalDiscounts > 0 && (
                     <tr>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-center">006</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm">DESCONTOS</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm">-</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-red-600">
                         R$ {employee.totalDiscounts.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </td>
                     </tr>
                   )}

                   {/* Desconto por Faltas */}
                   {descontoPorFaltas > 0 && (
                     <tr>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-center">007</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm">DESCONTO POR FALTAS</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm">{faltas} faltas</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                       <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-red-600">
                         R$ {descontoPorFaltas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </td>
                     </tr>
                   )}

                  {/* VA/VT */}
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-center">008</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">VALE ALIMENTAÇÃO + TRANSPORTE</td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">{employee.daysWorked} dias</td>
                     <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium text-green-600">
                       R$ {(employee.totalFoodVoucher + employee.totalTransportVoucher).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-right">-</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                Resumo Financeiro
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total dos Vencimentos */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-700 mb-2">
                      R$ {totalProventos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-green-600 font-medium">
                      Total dos Vencimentos
                    </div>
                  </div>
                </div>

                {/* Total dos Descontos */}
                <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-xl border border-red-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-700 mb-2">
                      R$ {totalDescontos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-red-600 font-medium">
                      Total dos Descontos
                    </div>
                  </div>
                </div>

                {/* Líquido a Receber */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 md:col-span-1">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-700 mb-2">
                      R$ {liquidoReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-blue-600 font-medium">
                      Líquido a Receber
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Info */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              Informações de Presença
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total de Dias Úteis */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700 mb-1">
                    {employee.totalWorkingDays}
                  </div>
                  <div className="text-sm text-blue-600 font-medium">
                    Dias Úteis
                  </div>
                </div>
              </div>
              
              {/* Dias Trabalhados */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700 mb-1">
                    {employee.daysWorked}
                  </div>
                  <div className="text-sm text-green-600 font-medium">
                    Dias Trabalhados
                  </div>
                </div>
              </div>

              {/* Faltas */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl border border-red-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-700 mb-1">
                    {employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0}
                  </div>
                  <div className="text-sm text-red-600 font-medium">
                    Faltas
                  </div>
                </div>
              </div>

              {/* Percentual de Presença */}
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-xl border border-indigo-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-700 mb-1">
                    {employee.totalWorkingDays ? 
                      ((employee.daysWorked / employee.totalWorkingDays) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm text-indigo-600 font-medium">
                    Presença
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
              Documento gerado automaticamente pelo sistema
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
