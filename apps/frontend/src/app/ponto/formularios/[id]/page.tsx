'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardHeader } from '@/components/ui/Card';
import { FormStructureBuilder } from '@/components/forms/FormStructureBuilder';
import type {
  FormSection,
  FormTemplate,
} from '@/components/forms/formStructureTypes';
import api from '@/lib/api';

const inputClasse =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition ' +
  'placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 ' +
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

export default function FormularioEditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const rawId = params?.id;
  const formId =
    typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<FormSection[]>([]);
  const [dirty, setDirty] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: templateRes, isLoading: loadingTemplate, isError } = useQuery({
    queryKey: ['formulario-template', formId],
    queryFn: async () => (await api.get(`/formularios/${formId}`)).data,
    enabled: !!formId,
  });

  useEffect(() => {
    const tpl = templateRes?.data as FormTemplate | undefined;
    if (!tpl) return;
    setName(tpl.name || '');
    setDescription(tpl.description || '');
    setSections(JSON.parse(JSON.stringify(tpl.sections || [])));
    setDirty(false);
  }, [templateRes]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/formularios/${formId}`, {
        name,
        description,
        sections,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formulario-template', formId] });
      queryClient.invalidateQueries({ queryKey: ['formularios-templates'] });
      setDirty(false);
      toast.success('Formulário salvo!');
    },
    onError: () => toast.error('Erro ao salvar formulário.'),
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (!formId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  if (isError) {
    return (
      <ProtectedRoute route="/ponto/formularios">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              Formulário não encontrado.
            </p>
            <Link
              href="/ponto/formularios"
              className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar à lista
            </Link>
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/formularios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6 pb-10">
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            <Link
              href="/ponto/formularios"
              aria-label="Voltar"
              className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Voltar
            </Link>
            <div className="w-full px-14 text-center sm:px-20">
              <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {name.trim() || 'Formulário'}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Configurar estrutura do formulário
              </p>
            </div>
          </div>

          <Card padding="none" className="shadow-sm">
            <CardHeader className="border-b-0 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <Settings2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Estrutura do formulário
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {dirty
                        ? 'Alterações não salvas.'
                        : 'Crie seções e perguntas para este formulário.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !dirty}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar formulário'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                    className={inputClasse}
                    placeholder="Nome do formulário"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Descrição (opcional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setDirty(true);
                    }}
                    className={inputClasse}
                    placeholder="Breve descrição"
                  />
                </div>
              </div>
            </CardHeader>
          </Card>

          {loadingTemplate ? (
            <Loading message="Carregando formulário…" size="lg" />
          ) : (
            <>
              <FormStructureBuilder
                sections={sections}
                onChange={(next) => {
                  setSections(next);
                  setDirty(true);
                }}
              />
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !dirty}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar formulário'}
                </button>
              </div>
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
