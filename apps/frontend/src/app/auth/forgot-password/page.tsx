'use client';

// Desabilitar prerendering
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, AlertCircle, Moon, Sun, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { authService } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { useTheme } from '@/context/ThemeContext';
import { Loading } from '@/components/ui/Loading';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSubmit chamado, email:', email);
    
    // Validação básica do email
    if (!email || !email.trim()) {
      setError('Por favor, digite um email válido');
      return;
    }

    // Validação de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Por favor, digite um email válido');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      console.log('Enviando requisição de recuperação de senha para:', email.trim());
      await authService.forgotPassword(email.trim());
      console.log('Requisição bem-sucedida');
      setSuccess(true);
      toast.success('Email de recuperação enviado!');
    } catch (error: any) {
      console.error('Erro ao solicitar recuperação de senha:', error);
      const errorMessage = error.message || 'Erro ao solicitar recuperação de senha';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
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
              message="Enviando email..."
              size="lg"
            />
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
              Aguarde enquanto processamos sua solicitação
            </p>
          </div>
        </div>
      )}

      {/* Formulário de Recuperação de Senha - Centralizado */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <button
            onClick={() => router.push('/auth/login')}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Voltar para login</span>
          </button>

          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
            Recuperar senha
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-center">
            Digite seu email e enviaremos instruções para redefinir sua senha
          </p>

          {success ? (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-6">
                Email enviado com sucesso!
              </p>
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800 text-white py-4 text-base font-medium rounded-lg transition-colors"
              >
                Voltar para login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    required
                    placeholder="Email"
                    className="w-full pl-12 pr-4 py-4 text-base bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">Erro</p>
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
                {loading ? 'Enviando...' : 'Enviar instruções'}
              </button>
            </form>
          )}
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

