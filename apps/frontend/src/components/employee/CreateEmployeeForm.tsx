'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, X, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface EmployeeFormData {
  // Dados do usuário
  name: string;
  email: string;
  cpf: string;
  password: string;
  role: 'EMPLOYEE' | 'HR' | 'ADMIN';
  
  // Dados do funcionário
  employeeId: string;
  sector: string;
  position: string;
  hireDate: string;
  hireTime: string;
  salary: string;
  isRemote: boolean;
  workStartTime: string;
  workEndTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
  toleranceMinutes: string;
  costCenter: string;
  client: string;
}

interface CreateEmployeeFormProps {
  onClose: () => void;
}

export function CreateEmployeeForm({ onClose }: CreateEmployeeFormProps) {
  // Lista de setores disponíveis
  const sectors = [
    'Engenharia Civil',
    'Engenharia Elétrica',
    'Engenharia Mecânica',
    'Engenharia de Software',
    'Recursos Humanos',
    'Financeiro',
    'Comercial',
    'Marketing',
    'Operações',
    'Qualidade',
    'Segurança do Trabalho',
    'Administrativo',
    'Tecnologia da Informação',
    'Projetos',
    'Manutenção',
    'Produção',
    'Vendas',
    'Atendimento ao Cliente',
    'Jurídico',
    'Contabilidade',
    'Compras',
    'Almoxarifado'
  ];

  // Lista de cargos disponíveis
  const positions = [
    'Analista',
    'Assistente',
    'Coordenador',
    'Diretor',
    'Engenheiro',
    'Especialista',
    'Estagiário',
    'Gerente',
    'Líder Técnico',
    'Operador',
    'Supervisor',
    'Técnico',
    'Consultor',
    'Desenvolvedor',
    'Designer',
    'Arquiteto',
    'Projetista',
    'Inspetor',
    'Auditor',
    'Contador',
    'Advogado',
    'Vendedor',
    'Atendente',
    'Auxiliar',
    'Secretário',
    'Recepcionista',
    'Motorista',
    'Segurança',
    'Limpeza',
    'Manutenção'
  ];

  // Função para gerar matrícula aleatória
  const generateEmployeeId = () => {
    // Gera um número de 6 dígitos com prefixo baseado no ano atual
    const currentYear = new Date().getFullYear().toString().slice(-2); // Últimos 2 dígitos do ano
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4 dígitos aleatórios
    return `${currentYear}${randomNumber}`; // Ex: 24001, 24002, etc.
  };

  const [formData, setFormData] = useState<EmployeeFormData>({
    name: '',
    email: '',
    cpf: '',
    password: '',
    role: 'EMPLOYEE',
    employeeId: generateEmployeeId(),
    sector: '',
    position: '',
    hireDate: new Date().toISOString().split('T')[0],
    hireTime: '07:00',
    salary: '',
    isRemote: false,
    workStartTime: '07:00',
    workEndTime: '17:00',
    lunchStartTime: '12:00',
    lunchEndTime: '13:00',
    toleranceMinutes: '10',
    costCenter: '',
    client: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string>('');

  const queryClient = useQueryClient();

  // Função para validar CPF
  const isValidCPF = (cpf: string): boolean => {
    if (cpf.length !== 11) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    // Calcular primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(9))) return false;
    
    // Calcular segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.charAt(10))) return false;
    
    return true;
  };

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const employeeData = {
        employeeId: data.employeeId,
        department: data.sector,
        position: data.position,
        hireDate: `${data.hireDate}T${data.hireTime}:00`,
        salary: parseFloat(data.salary),
        isRemote: data.isRemote,
        workSchedule: {
          startTime: data.workStartTime,
          endTime: data.workEndTime,
          lunchStartTime: data.lunchStartTime,
          lunchEndTime: data.lunchEndTime,
          workDays: [1, 2, 3, 4, 5], // Segunda a sexta
          toleranceMinutes: parseInt(data.toleranceMinutes)
        },
        costCenter: data.costCenter,
        client: data.client,
        allowedLocations: []
      };

      const response = await api.post('/users', {
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        password: data.password,
        role: data.role,
        employeeData
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Funcionário criado com sucesso!');
      onClose();
    },
    onError: (error: any) => {
      console.error('Erro ao criar funcionário:', error);
      
      // Limpar mensagem de aviso anterior
      setWarningMessage('');
      
      // Tratar erros específicos do backend
      if (error.response?.data?.message) {
        const message = error.response.data.message;
        
        if (message.includes('Usuário já existe com este email ou CPF')) {
          setErrors({ 
            email: 'Este email já está em uso', 
            cpf: 'Este CPF já está em uso' 
          });
          setWarningMessage('⚠️ Este email ou CPF já está cadastrado no sistema. Verifique os dados e tente novamente.');
          toast.error('Email ou CPF já cadastrado no sistema');
        } else if (message.includes('email') || message.includes('Email')) {
          setErrors({ email: 'Este email já está em uso' });
          setWarningMessage('⚠️ Este email já está cadastrado no sistema. Por favor, use um email diferente.');
          toast.error('Email já cadastrado no sistema');
        } else if (message.includes('cpf') || message.includes('CPF')) {
          setErrors({ cpf: 'Este CPF já está em uso' });
          setWarningMessage('⚠️ Este CPF já está cadastrado no sistema. Por favor, verifique o número digitado.');
          toast.error('CPF já cadastrado no sistema');
        } else if (message.includes('já existe') || message.includes('já está em uso')) {
          setWarningMessage('⚠️ Dados já cadastrados no sistema. Verifique email e CPF.');
          toast.error('Dados já cadastrados no sistema');
        } else {
          setWarningMessage(`⚠️ ${message}`);
          toast.error(message);
        }
      } else {
        setWarningMessage('⚠️ Erro ao criar funcionário. Tente novamente.');
        toast.error('Erro ao criar funcionário. Tente novamente.');
      }
    }
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';
    
    if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório';
    else {
      const cpfNumbers = formData.cpf.replace(/\D/g, '');
      if (cpfNumbers.length !== 11) {
        newErrors.cpf = 'CPF deve ter 11 dígitos';
      } else if (!isValidCPF(cpfNumbers)) {
        newErrors.cpf = 'CPF inválido';
      }
    }
    
    if (!formData.password.trim()) newErrors.password = 'Senha é obrigatória';
    else if (formData.password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    
    // Matrícula é gerada automaticamente, não precisa validar
    if (!formData.sector.trim()) newErrors.sector = 'Setor é obrigatório';
    if (!formData.position.trim()) newErrors.position = 'Cargo é obrigatório';
    if (!formData.hireDate.trim()) newErrors.hireDate = 'Data de contratação é obrigatória';
    else if (isNaN(new Date(formData.hireDate).getTime())) {
      newErrors.hireDate = 'Data de contratação inválida';
    }
    if (!formData.salary.trim()) newErrors.salary = 'Salário é obrigatório';
    else if (isNaN(parseFloat(formData.salary)) || parseFloat(formData.salary) <= 0) {
      newErrors.salary = 'Salário deve ser um valor válido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await createEmployeeMutation.mutateAsync(formData);
    } catch (error) {
      console.error('Erro ao criar funcionário:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof EmployeeFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    // Limpar mensagem de aviso quando usuário começar a digitar
    if (warningMessage) {
      setWarningMessage('');
    }
  };

  // Função para formatar CPF
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    handleInputChange('cpf', formatted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserPlus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cadastrar Novo Funcionário</h3>
              <p className="text-sm text-gray-600">Preencha os dados para cadastrar um novo funcionário</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de aviso */}
        {warningMessage && (
          <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Atenção</p>
                <p className="text-sm text-yellow-700 mt-1">{warningMessage}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Pessoais</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Nome completo do funcionário"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="email@empresa.com"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPF *
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => handleCPFChange(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.cpf ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {errors.cpf && <p className="text-red-500 text-xs mt-1">{errors.cpf}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha Temporária *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={`w-full px-3 py-2.5 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.password ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Perfil *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => handleInputChange('role', e.target.value as any)}
                  className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="EMPLOYEE">Funcionário</option>
                  <option value="HR">Recursos Humanos</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dados Profissionais */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Dados Profissionais</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matrícula (Gerada Automaticamente)
                </label>
                <input
                  type="text"
                  value={formData.employeeId}
                  readOnly
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md bg-gray-50 text-gray-700 cursor-not-allowed"
                  placeholder="Número da matrícula"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Matrícula gerada automaticamente (formato: AANNNN).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setor *
                </label>
                <select
                  value={formData.sector}
                  onChange={(e) => handleInputChange('sector', e.target.value)}
                  className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                    errors.sector ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Selecione um setor</option>
                  {sectors.map((sector) => (
                    <option key={sector} value={sector}>
                      {sector}
                    </option>
                  ))}
                </select>
                {errors.sector && <p className="text-red-500 text-xs mt-1">{errors.sector}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cargo *
                </label>
                <select
                  value={formData.position}
                  onChange={(e) => handleInputChange('position', e.target.value)}
                  className={`w-full px-3 py-2.5 pr-8 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                    errors.position ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Selecione um cargo</option>
                  {positions.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
                {errors.position && <p className="text-red-500 text-xs mt-1">{errors.position}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Admissão *
                </label>
                <input
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => handleInputChange('hireDate', e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.hireDate ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.hireDate && (
                  <p className="text-red-500 text-sm mt-1">{errors.hireDate}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Salário *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.salary}
                  onChange={(e) => handleInputChange('salary', e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.salary ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
                {errors.salary && <p className="text-red-500 text-xs mt-1">{errors.salary}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Centro de Custo
                </label>
                <select
                  value={formData.costCenter}
                  onChange={(e) => handleInputChange('costCenter', e.target.value)}
                  className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="">Selecione um centro de custo</option>
                  <option value="SEDES">SEDES</option>
                  <option value="DF - ADM LOCAL">DF - ADM LOCAL</option>
                  <option value="ITAMARATY - SERVIÇOS EVENTUAIS">ITAMARATY - SERVIÇOS EVENTUAIS</option>
                  <option value="ITAMARATY - MÃO DE OBRA">ITAMARATY - MÃO DE OBRA</option>
                  <option value="SES GDF - LOTE 14">SES GDF - LOTE 14</option>
                  <option value="SES GDF - LOTE 10">SES GDF - LOTE 10</option>
                  <option value="ADM CENTRAL ENGPAC">ADM CENTRAL ENGPAC</option>
                  <option value="DIRETOR">DIRETOR</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tomador
                </label>
                <select
                  value={formData.client}
                  onChange={(e) => handleInputChange('client', e.target.value)}
                  className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="">Selecione um tomador</option>
                  <option value="004 - ADMINISTRATIVO DF">004 - ADMINISTRATIVO DF</option>
                  <option value="017 - CODEVASF">017 - CODEVASF</option>
                  <option value="022 - UFRN 2">022 - UFRN 2</option>
                  <option value="056 - SUPERINTENDENCIA REGIONAL DA RFB NA 4A R">056 - SUPERINTENDENCIA REGIONAL DA RFB NA 4A R</option>
                  <option value="058 - INCRA NATAL">058 - INCRA NATAL</option>
                  <option value="064 - UFRN PINTURA">064 - UFRN PINTURA</option>
                  <option value="068 - PARQUE 3 RUAS - JOÃO PESSOA">068 - PARQUE 3 RUAS- JOÃO PESSOA</option>
                  <option value="069 - SUBSECAO JUDICIARIA ANAPOLIS-GO">069 - SUBSECAO JUDICIARIA ANAPOLIS -GO</option>
                  <option value="070 - SUBSECAO JUDICIARIA RIO VERDE-GO">070 - SUBSECAO JUDICIARIA RIO VERDE -GO</option>
                  <option value="071 - SUBSECAO JUDICIARIA ITUMBIARA-GO">071 - SUBSECAO JUDICIARIA ITUMBIARA -GO</option>
                  <option value="072 - SUBSECAO JUDICIARIA LUZIANIA-GO">072 - SUBSECAO JUDICIARIA LUZIANIA -GO</option>
                  <option value="073 - SUBSECAO JUDICIARIA URUACU-GO">073 - SUBSECAO JUDICIARIA URUACU-GO</option>
                  <option value="074 - SUBSECAO JUDICIARIA FORMOSA-GO">074 - SUBSECAO JUDICIARIA FORMOSA-GO</option>
                  <option value="075 - SUBSECAO JUDICIARIA JATAI-GO">075 - SUBSECAO JUDICIARIA JATAI-GO</option>
                  <option value="076 - MIN DAS RELAÇÕES EXTERIORES -ITAMARATY">076 - MIN DAS RELAÇÕES EXTERIORES -ITAMARATY</option>
                  <option value="077 - SEDES - SEC EST DESENVOLVIMENTO SOCIAL DF">077 - SEDES -SEC EST DESENVOLVIMENTO SOCIAL DF</option>
                  <option value="078 - SES - SEC ESTADO DE SAUDE -TAGUATINGA">078 - SES - SEC ESTADO DE SAUDE -TAGUATINGA</option>
                  <option value="079 - SES - SEC ESTADO DE SAUDE -CEILANDIA">079 - SES - SEC ESTADO DE SAUDE -CEILANDIA</option>
                  <option value="080 - SES - SEC ESTADO DE SAUDE -SAMAMBAIA/REC">080 - SES - SEC ESTADO DE SAUDE -SAMAMBAIA/REC</option>
                  <option value="085 - ADMINISTRATIVO RS">085 - ADMINISTRATIVO RS</option>
                  <option value="086 - CORREIOS E TELEGRAFOS 824 SE/RS">086 - CORREIOS E TELEGRAFOS 824 SE/RS</option>
                  <option value="087 - TRE RIO GRANDE DO SUL">087 - TRE RIO GRANDE DO SUL</option>
                  <option value="088 - BANRISUL">088 - BANRISUL</option>
                  <option value="090 - INMETRO RS">090 - INMETRO RS</option>
                  <option value="092 - TJGO RETROFIT ITAJA">092 - TJGO RETROFIT ITAJA</option>
                  <option value="093 - TJGO RETROFIT CAÇU">093 - TJGO RETROFIT CAÇU</option>
                  <option value="094 - TJGO RETROFIT PARANAIGUARA">094 - TJGO RETROFIT PARANAIGUARA</option>
                  <option value="096 - BANCO DO BRASIL GOIAS">096 - BANCO DO BRASIL GOIAS</option>
                  <option value="097 - SEINFRA PAVIMENTACAO PB">097 - SEINFRA PAVIMENTACAO PB</option>
                  <option value="098 - UFPE IMPERMEABILIZAÇÃO">098 - UFPE IMPERMEABILIZAÇÃO</option>
                  <option value="099 - TRIBUNAL DE JUSTICA DE GOIAS - RIO VERDE">099 - TRIBUNAL DE JUSTICA DE GOIAS - RIO VERDE</option>
                  <option value="100 - TRIBUNAL DE JUSTICA DE GOIAS - CALDAS NOVAS">100 - TRIBUNAL DE JUSTICA DE GOIAS - CALDAS NOVAS</option>
                  <option value="102 - TJ GO RETROFIT LOTE 05">102 - TJ GO RETROFIT LOTE 05</option>
                  <option value="103 - TJ GO RETROFIT LOTE 04">103 - TJ GO RETROFIT LOTE 04</option>
                  <option value="106 - SMED RS 17/2023 LOTE 01 - REGIAO NORTE">106 - SMED RS 17/2023 LOTE 01 -REGIAO NORTE</option>
                  <option value="107 - BANCO DO BRASIL JARDIM AMERICA">107 - BANCO DO BRASIL JARDIM AMERICA</option>
                  <option value="108 - BANCO DO BRASIL FORMOSA">108 - BANCO DO BRASIL FORMOSA</option>
                  <option value="109 - CORREIOS DA SE/RS">109 - CORREIOS DA SE/RS</option>
                  <option value="110 - NOVO PROGRESSO">110 - NOVO PROGRESSO</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isRemote"
                  checked={formData.isRemote}
                  onChange={(e) => handleInputChange('isRemote', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isRemote" className="text-sm font-medium text-gray-700">
                  Trabalho Remoto
                </label>
              </div>
            </div>
          </div>

          {/* Horário de Trabalho */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Horário de Trabalho</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Início
                </label>
                <input
                  type="time"
                  value={formData.workStartTime}
                  onChange={(e) => handleInputChange('workStartTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fim
                </label>
                <input
                  type="time"
                  value={formData.workEndTime}
                  onChange={(e) => handleInputChange('workEndTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Início Almoço
                </label>
                <input
                  type="time"
                  value={formData.lunchStartTime}
                  onChange={(e) => handleInputChange('lunchStartTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fim Almoço
                </label>
                <input
                  type="time"
                  value={formData.lunchEndTime}
                  onChange={(e) => handleInputChange('lunchEndTime', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tolerância (minutos)
              </label>
              <input
                type="number"
                value={formData.toleranceMinutes}
                onChange={(e) => handleInputChange('toleranceMinutes', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                max="60"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Criando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Criar Funcionário</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
