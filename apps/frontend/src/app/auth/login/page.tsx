'use client';

// Desabilitar prerendering

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Moon, Sun, ArrowRight, MessageCircle, X } from 'lucide-react';
import { authService } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { Loading } from '@/components/ui/Loading';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';
import { persistUnbBranding } from '@/lib/unbBranding';
import { APP_TITLE } from '@/lib/pageTitle';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDark, toggleTheme } = useTheme();
  const { logoSrc, logoAlt } = useBrandingLogo();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const supportWhatsAppDigits = '5561981622021';
  const supportWhatsAppUrl = `https://wa.me/${supportWhatsAppDigits}?text=${encodeURIComponent(
    `Olá! Esqueci minha senha do ${APP_TITLE} e preciso de ajuda para alterar.`
  )}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loginResponse = await authService.login(formData, rememberMe);
      persistUnbBranding(loginResponse.user?.employee?.costCenter);
      // Limpa permissões/listas da sessão anterior (evita flash de admin → funcionário)
      queryClient.removeQueries({ queryKey: ['me-permissions'] });
      queryClient.removeQueries({ queryKey: ['contracts'] });
      queryClient.removeQueries({ queryKey: ['permission-contracts-list'] });
      queryClient.removeQueries({ queryKey: ['permission-users'] });
      // Hidrata o cache com o user do login — evita tela de loading esperando /auth/me
      queryClient.setQueryData(['user'], {
        success: true,
        data: loginResponse.user,
      });
      toast.success('Login realizado com sucesso!');
      router.push('/ponto/home');
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

  const loginInputClassName =
    'login-form-field w-full py-4 text-base rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500';

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
                src={logoSrc}
                alt={logoAlt}
                width={220}
                height={56}
                className="h-14 w-auto max-w-[220px] object-contain"
                style={{ maxHeight: 56, maxWidth: 220, width: 'auto', height: 'auto' }}
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

        <form onSubmit={handleSubmit} method="post" action="#" className="space-y-6">
          <div>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="username"
                placeholder="Email"
                className={`${loginInputClassName} pl-12 pr-4`}
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
                autoComplete="current-password"
                placeholder="Senha"
                className={`${loginInputClassName} pl-12 pr-12`}
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
                onClick={() => setShowHelpModal(true)}
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

      {showHelpModal && (
        <div
          className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-password-help-title"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="forgot-password-help-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Esqueceu a senha?
              </h3>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              A recuperação automática foi desativada. Solicite a alteração de senha pelo WhatsApp:
            </p>

            <div className="mt-5">
              <a
                href={supportWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-3 text-sm font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Solicitar via WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

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
