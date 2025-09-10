'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, CheckCircle, XCircle, AlertCircle, User, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { PunchCard } from '@/components/ponto/PunchCard';
import { TimeRecordsList } from '@/components/ponto/TimeRecordsList';
import api from '@/lib/api';

type UserInfoPanelProps = {
  name: string;
  cpf: string;
  onLogout: () => void;
};

export function UserInfoPanel({ name, cpf, onLogout }: UserInfoPanelProps) {
  return (
    <Card className="bg-white shadow-sm border-gray-200 mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
              <p className="text-sm text-gray-600">CPF: {cpf}</p>
            </div>
          </div>
          
          <button
            onClick={onLogout}
            className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: dashboardData, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/dashboard');
      return res.data;
    }
  });

  const { data: todayRecords, isLoading: loadingToday } = useQuery({
    queryKey: ['today-records'],
    queryFn: async () => {
      const res = await api.get('/time-records/my-records/today');
      return res.data;
    }
  });

  const handleLogout = () => {
    // Remove token de autenticação (ajuste conforme seu projeto)
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    // Redireciona para a tela de login
    window.location.href = '/auth/login';
  };

  if (loadingDashboard || loadingToday || loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00'
  };

  const stats = dashboardData?.data || {
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    pendingVacations: 0,
    pendingOvertime: 0,
    attendanceRate: 0,
  };

  const widthPercent = Math.min(100, Math.max(0, Number(stats.attendanceRate || 0)));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 text-center">Gennesis Engenharia</h1>
          <p className="mt-2 text-gray-600 text-center">Visão geral do sistema de controle de ponto</p>
        </div>

        <UserInfoPanel name={user.name} cpf={user.cpf} onLogout={handleLogout} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Funcionários</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Presentes Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.presentToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-red-100 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Ausentes Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.absentToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Atrasos Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.lateToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader className="pb-4">
            <h3 className="text-lg font-semibold text-gray-900">Taxa de Frequência</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-6">
              <div className="flex-1">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${widthPercent}%` }} 
                  />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 min-w-[60px] text-right">
                {widthPercent}%
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-500">
              {stats.presentToday} de {stats.totalEmployees} funcionários presentes hoje
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Bater Ponto</h2>
            <PunchCard />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Registros de Hoje</h2>
            <TimeRecordsList records={todayRecords?.data?.records || []} />
          </div>
        </div>
      </div>
    </div>
  );
}