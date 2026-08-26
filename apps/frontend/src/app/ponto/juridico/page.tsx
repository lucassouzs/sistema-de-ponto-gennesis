'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent } from '@/components/ui/Card';
import api from '@/lib/api';
import {
  FileText,
  DollarSign,
  Archive,
  Clock,
  PauseCircle,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Briefcase,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BarChart3,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const JURIDICO_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'todos', label: 'Todos os status' },
  { value: 'ARQUIVADO', label: 'Arquivados' },
  { value: 'ANDAMENTO PROCESSUAL', label: 'Em Andamento' },
  { value: 'SUSPENSO', label: 'Suspensos' },
  { value: 'ACORDO', label: 'Acordos' },
  { value: 'AUDIÊNCIA INSTRUÇÃO', label: 'Em Instrução' },
]);
import { processosJuridicos, calcularEstatisticas, ProcessoJuridico } from '@/data/juridico-processos';

const COLORS = {
  arquivado: '#10B981',
  andamento: '#3B82F6',
  suspenso: '#F59E0B',
  acordo: '#8B5CF6',
  instrucao: '#EF4444',
};

const PIE_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#6366F1'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return formatCurrency(value);
}

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconBgClass: string;
}

function KpiCard({ title, value, subtitle, icon, iconBgClass }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center">
          <div className={`p-2 sm:p-3 ${iconBgClass} rounded-lg flex-shrink-0`}>
            {icon}
          </div>
          <div className="ml-3 sm:ml-4 min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
              {title}
            </p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProcessoRow({ processo }: { processo: ProcessoJuridico }) {
  const [expanded, setExpanded] = useState(false);
  
  const statusColor = {
    'ARQUIVADO': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    'ANDAMENTO PROCESSUAL': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'SUSPENSO': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    'ACORDO': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    'AUDIÊNCIA INSTRUÇÃO': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }[processo.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{processo.numeroProcesso.slice(0, 25)}...</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
              {processo.status}
            </span>
          </div>
          <p className="font-medium text-gray-900 dark:text-gray-100 mt-1 truncate">{processo.reclamante}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{processo.tribunal} • {processo.polo}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(processo.valorCausa)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Valor da causa</p>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </div>
      
      {expanded && (
        <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-800/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Objeto</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{processo.objeto.slice(0, 50)}...</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Acordo</p>
              <p className={`font-medium ${processo.acordo === 'SIM' ? 'text-green-600' : 'text-gray-900 dark:text-gray-100'}`}>
                {processo.acordo}
                {processo.valorAcordo && processo.acordo === 'SIM' && ` • ${formatCurrency(processo.valorAcordo)}`}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Valor Sentença</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                {processo.valorSentenca ? formatCurrency(processo.valorSentenca) : '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Data Abertura</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{processo.dataAbertura || '-'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JuridicoPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  
  const estatisticas = useMemo(() => calcularEstatisticas(processosJuridicos), []);
  
  const processosFiltrados = useMemo(() => {
    return processosJuridicos.filter(p => {
      const matchSearch = searchTerm === '' || 
        p.reclamante.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.numeroProcesso.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.objeto.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchStatus = statusFilter === 'todos' || p.status === statusFilter;
      
      return matchSearch && matchStatus;
    });
  }, [searchTerm, statusFilter]);

  const statusChartData = useMemo(() => [
    { name: 'Arquivados', value: estatisticas.arquivados, color: COLORS.arquivado },
    { name: 'Em Andamento', value: estatisticas.emAndamento, color: COLORS.andamento },
    { name: 'Suspensos', value: estatisticas.suspensos, color: COLORS.suspenso },
    { name: 'Acordos', value: estatisticas.acordos, color: COLORS.acordo },
    { name: 'Instrução', value: estatisticas.instrucao, color: COLORS.instrucao },
  ].filter(d => d.value > 0), [estatisticas]);

  const tribunalChartData = useMemo(() => 
    Object.entries(estatisticas.tribunalCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  , [estatisticas]);

  const objetoChartData = useMemo(() => 
    Object.entries(estatisticas.objetoCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  , [estatisticas]);

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/juridico">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/juridico">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          {/* Header */}
          <div className="relative flex flex-col items-center gap-4 md:block md:min-h-[4.5rem]">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Processos Trabalhistas</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Acompanhe status, acordos e valores dos processos
              </p>
            </div>
            <a
              href="https://app.powerbi.com/view?r=eyJrIjoiYWJmNzI0ZDQtOTRiMC00YmVlLTg4OTEtNzk1N2IxYmE5YmVkIiwidCI6IjRhOTU2YmJhLTU0ZWItNDk0NS1hNTgzLTdiNWNjMTMwMDA4ZiJ9"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm shrink-0 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2"
            >
              <BarChart3 className="w-5 h-5" />
              Dashboard Jurídico
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* KPIs Grid */}
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <KpiCard
                title="Total de Processos"
                value={estatisticas.totalProcessos}
                icon={<FileText className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />}
                iconBgClass="bg-indigo-100 dark:bg-indigo-900/30"
              />
              <KpiCard
                title="Em Andamento"
                value={estatisticas.emAndamento}
                icon={<Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />}
                iconBgClass="bg-blue-100 dark:bg-blue-900/30"
              />
              <KpiCard
                title="Suspensos"
                value={estatisticas.suspensos}
                icon={<PauseCircle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />}
                iconBgClass="bg-amber-100 dark:bg-amber-900/30"
              />
              <KpiCard
                title="Em Instrução"
                value={estatisticas.instrucao}
                icon={<AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />}
                iconBgClass="bg-red-100 dark:bg-red-900/30"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <KpiCard
                title="Arquivados"
                value={estatisticas.arquivados}
                subtitle={`${((estatisticas.arquivados / estatisticas.totalProcessos) * 100).toFixed(0)}% do total`}
                icon={<Archive className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />}
                iconBgClass="bg-green-100 dark:bg-green-900/30"
              />
              <KpiCard
                title="Taxa de Acordo"
                value={`${estatisticas.taxaAcordo.toFixed(0)}%`}
                subtitle={`${estatisticas.processosComAcordo} processos`}
                icon={<CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />}
                iconBgClass="bg-purple-100 dark:bg-purple-900/30"
              />
            </div>
          </div>

          {/* Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-6">
            <KpiCard
              title="Total Valor das Causas"
              value={formatCompactCurrency(estatisticas.totalValorCausa)}
              subtitle={`Média: ${formatCurrency(estatisticas.totalValorCausa / estatisticas.totalProcessos)}`}
              icon={<DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />}
              iconBgClass="bg-red-100 dark:bg-red-900/30"
            />
            <KpiCard
              title="Total em Acordos"
              value={formatCompactCurrency(estatisticas.totalValorAcordo)}
              subtitle={`${((estatisticas.totalValorAcordo / estatisticas.totalValorCausa) * 100).toFixed(1)}% do valor das causas`}
              icon={<CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />}
              iconBgClass="bg-green-100 dark:bg-green-900/30"
            />
            <KpiCard
              title="Total em Sentenças"
              value={formatCompactCurrency(estatisticas.totalValorSentenca)}
              subtitle={`${((estatisticas.totalValorSentenca / estatisticas.totalValorCausa) * 100).toFixed(1)}% do valor das causas`}
              icon={<Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />}
              iconBgClass="bg-blue-100 dark:bg-blue-900/30"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Pie Chart */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Distribuição por Status
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [value, 'Processos']}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tribunal Bar Chart */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Processos por Tribunal
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tribunalChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" tick={{ fill: '#6b7280', fontSize: 12 }} width={80} />
                      <Tooltip
                        formatter={(value: number) => [value, 'Processos']}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                        }}
                      />
                      <Bar dataKey="value" fill="#6366F1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Objeto Chart */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Principais Objetos dos Processos
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={objetoChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [value, 'Processos']}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {objetoChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Process List */}
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Lista de Processos ({processosFiltrados.length})
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar processos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <StringSingleSelectDropdown
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={JURIDICO_STATUS_FILTER_OPTIONS}
                      allowEmpty={false}
                    />
                  </div>
                </div>
              </div>
              
              <div className="max-h-[500px] overflow-y-auto">
                {processosFiltrados.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    Nenhum processo encontrado com os filtros selecionados.
                  </div>
                ) : (
                  processosFiltrados.slice(0, 20).map(processo => (
                    <ProcessoRow key={processo.id} processo={processo} />
                  ))
                )}
                {processosFiltrados.length > 20 && (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50">
                    Mostrando 20 de {processosFiltrados.length} processos. Use os filtros para refinar a busca.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
