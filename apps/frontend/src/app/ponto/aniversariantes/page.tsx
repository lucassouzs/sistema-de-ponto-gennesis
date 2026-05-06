'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Cake, Search, Calendar, Users, Mail, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

interface BirthdayEmployee {
  id: string;
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  position: string;
  birthDate: string;
  birthMonth?: number;
  birthDay: number;
  age: number;
  daysUntilBirthday: number;
  isTodayBirthday: boolean;
}

interface BirthdayStats {
  total: number;
  todayBirthdays: number;
  byDepartment: Record<string, number>;
}

interface BirthdayResponse {
  employees: BirthdayEmployee[];
  stats: BirthdayStats;
  month: number;
  year: number;
}

export default function AniversariantesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const [selectedMonth, setSelectedMonth] = useState<string | number>(new Date().getMonth() + 1);
  const selectedYear = new Date().getFullYear(); // Sempre o ano atual
  const [searchTerm, setSearchTerm] = useState<string>('');
  const showAllBirthdays = true; // Sempre true para mostrar todos os aniversários do mês
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Listener para abrir modal de alterar senha via sidebar
  useEffect(() => {
    const handleOpenChangePasswordModal = () => {
      setIsChangePasswordOpen(true);
    };

    window.addEventListener('openChangePasswordModal', handleOpenChangePasswordModal);
    
    return () => {
      window.removeEventListener('openChangePasswordModal', handleOpenChangePasswordModal);
    };
  }, []);

  // Query para buscar aniversariantes
  const { data: birthdayData, isLoading: loadingBirthdays, error } = useQuery({
    queryKey: ['birthdays', selectedMonth, selectedYear, searchTerm, showAllBirthdays],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(selectedMonth !== 'all' && { month: selectedMonth.toString() }),
        year: selectedYear.toString(),
        ...(searchTerm && { search: searchTerm }),
        showAll: 'true' // Sempre mostrar todos os aniversários do mês
      });
      
      const res = await api.get(`/users/birthdays?${params}`);
      return res.data;
    },
    enabled: !!userData?.data
  });

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando aniversariantes..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  const birthdayResponse: BirthdayResponse = birthdayData?.data || {
    employees: [],
    stats: { total: 0, todayBirthdays: 0, byDepartment: {} },
    month: selectedMonth,
    year: selectedYear
  };

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];


  const getAgeText = (age: number) => {
    return age === 1 ? '1 ano' : `${age} anos`;
  };

  const getDaysText = (days: number, isToday: boolean) => {
    if (isToday) return 'Hoje!';
    if (days === 1) return 'Amanhã';
    return `Em ${days} dias`;
  };

  // Função para agrupar aniversariantes por mês
  const groupByMonth = (employees: BirthdayEmployee[]) => {
    const grouped: Record<number, BirthdayEmployee[]> = {};
    
    employees.forEach((employee) => {
      const month = employee.birthMonth || (selectedMonth !== 'all' && typeof selectedMonth === 'number' ? selectedMonth : new Date().getMonth() + 1);
      if (!grouped[month]) {
        grouped[month] = [];
      }
      grouped[month].push(employee);
    });

    // Ordenar por mês e dentro de cada mês por dia
    const sortedMonths = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    sortedMonths.forEach((month) => {
      grouped[month].sort((a, b) => a.birthDay - b.birthDay);
    });

    return { grouped, sortedMonths };
  };

  const sendBirthdayMessage = (employee: BirthdayEmployee) => {
    const subject = `Parabéns pelo seu aniversário! 🎉`;
    const body = `Olá ${employee.name},\n\nFeliz aniversário! Que este novo ano de vida seja repleto de alegrias, conquistas e momentos especiais.\n\nUm abraço da equipe Gennesis Engenharia!`;
    
    const mailtoLink = `mailto:${employee.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  return (
    <ProtectedRoute route="/ponto/aniversariantes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Aniversariantes</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {selectedMonth === 'all' 
                  ? `Todos os meses - ${selectedYear}` 
                  : `${months[typeof selectedMonth === 'number' ? selectedMonth - 1 : 0]} ${selectedYear}`}
              </p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Aniversariantes este mês</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {birthdayResponse.stats.total}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                  <Calendar className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Aniversariantes hoje</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {birthdayResponse.stats.todayBirthdays}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader className="border-b-0 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              </div>
              <button
                onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
              >
                {isFiltersMinimized ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </CardHeader>
          {!isFiltersMinimized && (
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                {/* Filtro Principal - Busca Geral e Mês */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="space-y-2 sm:col-span-10">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Buscar Aniversariante
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Digite o nome do funcionário ou o setor..."
                        className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Mês
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedMonth(value === 'all' ? 'all' : parseInt(value));
                      }}
                      className="w-full px-3 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="all">Todos</option>
                      {months.map((month, index) => (
                        <option key={index} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Lista de Aniversariantes */}
        <Card>
          <CardContent className="p-6">
            {loadingBirthdays ? (
              <div className="text-center py-8">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Carregando aniversariantes...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600 dark:text-red-400">Erro ao carregar aniversariantes</p>
              </div>
            ) : birthdayResponse.employees.length === 0 ? (
              <div className="text-center py-8">
                <Cake className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Nenhum aniversariante encontrado
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {selectedMonth === 'all' 
                    ? `Não há funcionários fazendo aniversário` 
                    : `Não há funcionários fazendo aniversário em ${typeof selectedMonth === 'number' ? months[selectedMonth - 1] : ''} ${selectedYear}`}
                </p>
              </div>
            ) : selectedMonth === 'all' ? (
              // Renderização agrupada por mês quando "Todos" está selecionado
              (() => {
                const { grouped, sortedMonths } = groupByMonth(birthdayResponse.employees);
                return (
                  <div className="space-y-6">
                    {sortedMonths.map((month) => (
                      <div key={month} className="space-y-4">
                        {/* Header do mês */}
                        <div className="flex items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                            {months[month - 1]}
                          </h3>
                          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                            {grouped[month].length}
                          </span>
                        </div>

                        {/* Grid de cards do mês */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {grouped[month].map((employee) => (
                            <Card
                              key={employee.id}
                              className={`relative transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
                                employee.isTodayBirthday
                                  ? 'border-blue-300 dark:border-blue-600 bg-gradient-to-br from-blue-50 dark:from-blue-900/30 to-blue-50 dark:to-blue-900/30'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600'
                              }`}
                            >
                              {/* Badge de hoje */}
                              {employee.isTodayBirthday && (
                                <div className="absolute -top-2 -right-2 bg-pink-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                                  HOJE!
                                </div>
                              )}

                              <CardContent className="p-6">
                                <div className="text-center">
                                  {/* Avatar */}
                                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-xl font-bold text-blue-500 dark:text-blue-400 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400`}>
                                    {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>

                                  {/* Nome */}
                                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                    {employee.name}
                                  </h3>

                                  {/* Departamento */}
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    {employee.department}
                                  </p>

                                  {/* Data de aniversário */}
                                  <div className="flex items-center justify-center space-x-2 mb-2">
                                    <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      {employee.birthDay} de {months[month - 1]}
                                    </span>
                                  </div>

                                  {/* Idade */}
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    {getAgeText(employee.age)}
                                  </p>

                                  {/* Dias restantes */}
                                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4 ${
                                    employee.isTodayBirthday
                                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                                  }`}>
                                    {getDaysText(employee.daysUntilBirthday, employee.isTodayBirthday)}
                                  </div>

                                  {/* Botão de parabéns */}
                                  <button
                                    onClick={() => sendBirthdayMessage(employee)}
                                    className="w-full bg-blue-500 dark:bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-all duration-200 flex items-center justify-center space-x-2"
                                  >
                                    <Mail className="w-4 h-4" />
                                    <span>Enviar Parabéns</span>
                                  </button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              // Renderização normal quando um mês específico está selecionado
              <div className="space-y-4">
                {/* Header do mês */}
                {typeof selectedMonth === 'number' && (
                  <div className="flex items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                      {months[selectedMonth - 1]}
                    </h3>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {birthdayResponse.employees.length}
                    </span>
                  </div>
                )}

                {/* Grid de cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {birthdayResponse.employees.map((employee) => (
                  <Card
                    key={employee.id}
                    className={`relative transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
                      employee.isTodayBirthday
                        ? 'border-blue-300 dark:border-blue-600 bg-gradient-to-br from-blue-50 dark:from-blue-900/30 to-blue-50 dark:to-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600'
                    }`}
                  >
                    {/* Badge de hoje */}
                    {employee.isTodayBirthday && (
                      <div className="absolute -top-2 -right-2 bg-pink-500 dark:bg-pink-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                        HOJE!
                      </div>
                    )}

                    <CardContent className="p-6">
                      <div className="text-center">
                        {/* Avatar */}
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-xl font-bold text-blue-500 dark:text-blue-400 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400`}>
                          {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>

                        {/* Nome */}
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          {employee.name}
                        </h3>

                        {/* Departamento */}
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {employee.department}
                        </p>

                        {/* Data de aniversário */}
                        <div className="flex items-center justify-center space-x-2 mb-2">
                          <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {employee.birthDay} de {employee.birthMonth ? months[employee.birthMonth - 1] : (typeof selectedMonth === 'number' ? months[selectedMonth - 1] : '')}
                          </span>
                        </div>

                        {/* Idade */}
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {getAgeText(employee.age)}
                        </p>

                        {/* Dias restantes */}
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4 ${
                          employee.isTodayBirthday
                            ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                        }`}>
                          {getDaysText(employee.daysUntilBirthday, employee.isTodayBirthday)}
                        </div>

                        {/* Botão de parabéns */}
                        <button
                          onClick={() => sendBirthdayMessage(employee)}
                          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:transition-all duration-200 flex items-center justify-center space-x-2"
                        >
                          <Mail className="w-4 h-4" />
                          <span>Enviar Parabéns</span>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

        {/* Modal de alterar senha */}
        <ChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
          onSuccess={() => setIsChangePasswordOpen(false)}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
