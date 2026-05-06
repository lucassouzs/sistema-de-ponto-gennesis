'use client';

// Desabilitar prerendering
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Moon, Sun, ArrowRight } from 'lucide-react';
import { authService } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDark, toggleTheme } = useTheme();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loginResponse = await authService.login(formData, rememberMe);
      // Limpar cache do React Query
      queryClient.clear();
      toast.success('Login realizado com sucesso!');
      
      // Verificar se o token foi salvo antes de fazer a chamada (localStorage ou sessionStorage)
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        // Se não tem token, redirecionar para /ponto por padrão
        setTimeout(() => {
          router.push('/ponto');
        }, 500);
        return;
      }
      
      // Buscar dados do usuário para verificar cargo e se precisa bater ponto
      // Usar um pequeno delay para garantir que o token está disponível
      setTimeout(async () => {
        try {
          const userRes = await api.get('/auth/me');
          const userData = userRes.data?.data;
          const userPosition = userData?.employee?.position;
          const requiresTimeClock = userData?.employee?.requiresTimeClock !== false;
          
          // Se for Administrador, redirecionar para dashboard
          if (userPosition === 'Administrador') {
            router.push('/ponto/dashboard');
          } else {
            // Outros funcionários vão para /ponto (a página mostra mensagem se não precisa bater ponto)
            router.push('/ponto');
          }
        } catch (userError: any) {
          console.error('Erro ao buscar dados do usuário:', userError);
          // Se não conseguir buscar dados do usuário, redirecionar para /ponto por padrão
          router.push('/ponto');
        }
      }, 300);
    } catch (error: any) {
      // Verificar se é erro de credenciais inválidas
      if (error.message?.includes('Credenciais inválidas') || 
          error.message?.includes('incorreta') ||
          error.message?.includes('inválidas')) {
        setError('Email ou senha incorretos. Verifique suas credenciais e tente novamente.');
      } else {
        setError(error.message || 'Erro ao fazer login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    // Limpar erro quando usuário começar a digitar
    if (error) {
      setError('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-24 relative">
            {/* Botão de trocar tema (esquerda) */}
            <div className="flex items-center w-1/3 justify-start">
              <button
                onClick={toggleTheme}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={isDark ? 'Modo Claro' : 'Modo Escuro'}
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDark ? 'Modo Claro' : 'Modo Escuro'}
                </span>
              </button>
            </div>

            {/* Logo (centro) */}
            <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
              <img 
                src={isDark ? "/logobranca.png" : "/logopv.png"} 
                alt="Logo Gennesis Engenharia" 
                className="h-14 w-auto object-contain"
              />
            </div>

            {/* Link para o site da empresa (direita) */}
            <div className="flex items-center w-1/3 justify-end">
              <a
                href="https://gennesisengenharia.com.br/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center space-x-1"
              >
                <span>Visite nosso site</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Overlay de carregamento */}
      {loading && (
        <div className="absolute inset-0 bg-white dark:bg-gray-900 bg-opacity-95 dark:bg-opacity-95 flex flex-col items-center justify-center z-50">
          <div className="text-center">
            <Loading 
              message="Processando login..."
              size="lg"
            />
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
              Aguarde enquanto validamos suas credenciais
            </p>
          </div>
        </div>
      )}

      {/* Formulário de Login - Centralizado */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
            Entrar na sua conta
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-center">
            Digite suas credenciais para acessar o sistema
          </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="Email"
                className="w-full pl-12 pr-4 py-4 text-base bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Senha"
                className="w-full pl-12 pr-12 py-4 text-base bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                    rememberMe 
                      ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500' 
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                  }`}>
                    {rememberMe && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                  Permanecer conectado
                </span>
              </label>
              <button
                type="button"
                onClick={() => router.push('/auth/forgot-password')}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 font-medium transition-colors"
              >
                Esqueceu a senha?
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">Erro no login</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800 text-white py-4 text-base font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-base text-gray-600 dark:text-gray-400">
            Ao acessar sua conta, você reconhece que leu, entendeu e concorda integralmente com os{' '}
            <a 
              href="https://gennesisattendance.blogspot.com/p/termos-e-condicoes-gennesis-attendance.html" 
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 underline"
            >
              Termos e Condições
            </a>
            {' '}e{' '}
            <a 
              href="https://gennesisattendance.blogspot.com/p/politica-de-privacidade-gennesis.html" 
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 underline"
            >
              Política de Privacidade
            </a>
            {' '}da Gennesis Engenharia.
          </p>
        </div>
      </footer>
    </div>
  );
}
