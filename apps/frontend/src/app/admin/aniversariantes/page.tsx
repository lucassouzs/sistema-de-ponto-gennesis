'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Cake, Search, Calendar, Users, Mail, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
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

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAllBirthdays, setShowAllBirthdays] = useState<boolean>(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

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
        month: selectedMonth.toString(),
        year: selectedYear.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(showAllBirthdays && { showAll: 'true' })
      });
      
      const res = await api.get(`/users/birthdays?${params}`);
      return res.data;
    },
    enabled: !!userData?.data
  });

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'ADMIN'
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

  const sendBirthdayMessage = (employee: BirthdayEmployee) => {
    const subject = `Parabéns pelo seu aniversário! 🎉`;
    const body = `Olá ${employee.name},\n\nFeliz aniversário! Que este novo ano de vida seja repleto de alegrias, conquistas e momentos especiais.\n\nUm abraço da equipe Gennesis Engenharia!`;
    
    const mailtoLink = `mailto:${employee.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  return (
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
              <h1 className="text-3xl font-bold text-gray-900">Aniversariantes</h1>
              <p className="mt-2 text-gray-600">
                {months[selectedMonth - 1]} {selectedYear}
              </p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Aniversariantes este mês</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {birthdayResponse.stats.total}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <Calendar className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Aniversariantes hoje</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {birthdayResponse.stats.todayBirthdays}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Mês */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mês
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {months.map((month, index) => (
                    <option key={index} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ano */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ano
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Busca */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buscar por nome
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nome do funcionário..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Opção para mostrar todos os aniversários */}
            <div className="mt-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showAllBirthdays}
                  onChange={(e) => setShowAllBirthdays(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Mostrar todos os aniversários do mês (incluindo os que já passaram)
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Aniversariantes */}
        <Card>
          <CardContent className="p-6">
            {loadingBirthdays ? (
              <div className="text-center py-8">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                <p className="text-gray-600">Carregando aniversariantes...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600">Erro ao carregar aniversariantes</p>
              </div>
            ) : birthdayResponse.employees.length === 0 ? (
              <div className="text-center py-8">
                <Cake className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Nenhum aniversariante encontrado
                </h3>
                <p className="text-gray-600">
                  Não há funcionários fazendo aniversário em {months[selectedMonth - 1]} {selectedYear}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {birthdayResponse.employees.map((employee) => (
                  <Card
                    key={employee.id}
                    className={`relative transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
                      employee.isTodayBirthday
                        ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-blue-50'
                        : 'border-gray-200 hover:border-blue-200'
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
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-xl font-bold text-blue-500 bg-white-500 border-2 border-blue-500`}>
                          {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>

                        {/* Nome */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {employee.name}
                        </h3>

                        {/* Departamento */}
                        <p className="text-sm text-gray-600 mb-3">
                          {employee.department}
                        </p>

                        {/* Data de aniversário */}
                        <div className="flex items-center justify-center space-x-2 mb-2">
                          <Calendar className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium text-gray-700">
                            {employee.birthDay} de {months[selectedMonth - 1]}
                          </span>
                        </div>

                        {/* Idade */}
                        <p className="text-sm text-gray-600 mb-3">
                          {getAgeText(employee.age)}
                        </p>

                        {/* Dias restantes */}
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4 ${
                          employee.isTodayBirthday
                            ? 'bg-pink-100 text-pink-800'
                            : 'bg-blue-100 text-blue-800'
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
  );
}