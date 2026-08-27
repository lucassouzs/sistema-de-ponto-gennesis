'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { FormStructureBuilder } from '@/components/forms/FormStructureBuilder';
import type {
  FormSection,
  FormTemplate,
} from '@/components/forms/formStructureTypes';
import api from '@/lib/api';

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saveMutation.isPending) saveMutation.mutate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, saveMutation]);

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
        <div className="relative flex h-full min-h-0 flex-col">
          {loadingTemplate ? (
            <div className="flex flex-1 items-center justify-center">
              <Loading message="Carregando formulário…" size="lg" />
            </div>
          ) : (
            <FormStructureBuilder
              name={name}
              description={description}
              sections={sections}
              onNameChange={(next) => {
                setName(next);
                setDirty(true);
              }}
              onDescriptionChange={(next) => {
                setDescription(next);
                setDirty(true);
              }}
              onChange={(next) => {
                setSections(next);
                setDirty(true);
              }}
              footer={
                <Button
                  type="button"
                  variant="primary"
                  loading={saveMutation.isPending}
                  disabled={!dirty}
                  onClick={() => saveMutation.mutate()}
                  title={
                    saveMutation.isPending
                      ? 'Salvando…'
                      : dirty
                        ? 'Salvar formulário'
                        : 'Nenhuma alteração para salvar'
                  }
                  className="!bg-red-600 hover:!bg-red-700 active:!bg-red-800"
                >
                  Salvar
                </Button>
              }
            />
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
