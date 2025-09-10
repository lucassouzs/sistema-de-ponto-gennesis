'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { authService } from '@/lib/auth';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authService.login(formData);
      toast.success('Login realizado com sucesso!');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Sistema de Ponto
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Gennesis Engenharia
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card>
          <CardHeader>
            <h2 className="text-center text-2xl font-bold text-gray-900">
              Entrar na sua conta
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Digite suas credenciais para acessar o sistema
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                leftIcon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com"
              />

              <Input
                label="Senha"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                required
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                placeholder="Sua senha"
              />

              <Button
                type="submit"
                loading={loading}
                className="w-full"
                size="lg"
              >
                Entrar
              </Button>
            </form>

            {/* <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Dados de teste
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-gray-500">
                <p><strong>Admin:</strong> admin@engenharia.com.br / admin123</p>
                <p><strong>RH:</strong> rh@engenharia.com.br / rh123</p>
                <p><strong>Funcionário:</strong> joao.silva@engenharia.com.br / func123</p>
              </div>
            </div> */}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Não tem uma conta?{' '}
            <Link href="/auth/register" className="font-medium text-blue-600 hover:text-blue-500">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
