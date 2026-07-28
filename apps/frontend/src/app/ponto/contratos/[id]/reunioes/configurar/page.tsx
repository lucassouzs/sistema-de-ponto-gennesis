'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type FieldType = 'text' | 'textarea' | 'sim_nao' | 'pills' | 'rating';

interface FollowUp {
  whenValue: string;
  type: 'text' | 'textarea' | 'pills';
  placeholder?: string;
  options?: string[];
}

interface Question {
  id: string;
  title: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  followUp?: FollowUp | null;
}

interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

interface Template {
  sections: Section[];
  updatedAt: string;
}

interface Contract {
  id: string;
  name: string;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  sim_nao: 'Sim / Não',
  pills: 'Opções (botões)',
  rating: 'Nota 1 a 5',
};

const inputClasse =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition ' +
  'placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 ' +
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function newQuestion(): Question {
  return {
    id: uid(),
    title: 'Nova pergunta',
    type: 'textarea',
    required: false,
    followUp: null,
  };
}

function newSection(): Section {
  return {
    id: uid(),
    title: 'Nova seção',
    description: '',
    questions: [newQuestion()],
  };
}

export default function ConfigurarFormularioReuniaoPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const [sections, setSections] = useState<Section[]>([]);
  const [dirty, setDirty] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });

  const { data: templateRes, isLoading: loadingTemplate } = useQuery({
    queryKey: ['reuniao-template'],
    queryFn: async () => (await api.get('/reunioes/template')).data,
  });

  useEffect(() => {
    const tpl = templateRes?.data as Template | undefined;
    if (!tpl?.sections) return;
    setSections(JSON.parse(JSON.stringify(tpl.sections)));
    setDirty(false);
  }, [templateRes]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put('/reunioes/template', { data: { sections } });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reuniao-template'] });
      setDirty(false);
      toast.success('Formulário atualizado!');
    },
    onError: () => toast.error('Erro ao salvar formulário.'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => (await api.post('/reunioes/template/reset')).data,
    onSuccess: (res) => {
      setSections(JSON.parse(JSON.stringify(res.data.sections)));
      queryClient.invalidateQueries({ queryKey: ['reuniao-template'] });
      setDirty(false);
      toast.success('Formulário restaurado ao padrão.');
    },
    onError: () => toast.error('Erro ao restaurar padrão.'),
  });

  const mark = () => setDirty(true);

  const updateSection = (sectionId: string, patch: Partial<Section>) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
    mark();
  };

  const updateQuestion = (sectionId: string, questionId: string, patch: Partial<Question>) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              questions: s.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
            }
      )
    );
    mark();
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    setSections((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
    mark();
  };

  const moveQuestion = (sectionId: string, index: number, dir: -1 | 1) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const next = index + dir;
        if (next < 0 || next >= s.questions.length) return s;
        const copy = [...s.questions];
        const [item] = copy.splice(index, 1);
        copy.splice(next, 0, item);
        return { ...s, questions: copy };
      })
    );
    mark();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const contract = contractData?.data as Contract | undefined;

  if (!contractId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            <Link
              href={`/ponto/contratos/${contractId}/reunioes`}
              aria-label="Voltar"
              className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Voltar
            </Link>
            <div className="w-full max-w-3xl px-14 text-center sm:px-20">
              <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {contract?.name || 'Histórico de Reuniões'}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Configurar formulário de reunião
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
                        ? 'Alterações não salvas — valem para todas as novas reuniões.'
                        : 'Crie seções e perguntas. Vale para todos os contratos.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Restaurar o formulário padrão? Suas perguntas personalizadas serão substituídas.'
                        )
                      ) {
                        resetMutation.mutate();
                      }
                    }}
                    disabled={resetMutation.isPending}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restaurar padrão
                  </button>
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
              </div>
            </CardHeader>
          </Card>

          {loadingTemplate ? (
            <Loading message="Carregando formulário…" size="lg" />
          ) : (
            <div className="space-y-4">
              {sections.map((section, sIdx) => (
                <Card key={section.id} className="shadow-sm">
                  <CardHeader className="border-b border-gray-100 dark:border-gray-700/70">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-2 flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveSection(sIdx, -1)}
                            disabled={sIdx === 0}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                            title="Subir seção"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(sIdx, 1)}
                            disabled={sIdx === sections.length - 1}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                            title="Descer seção"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => updateSection(section.id, { title: e.target.value })}
                            className={inputClasse + ' font-semibold uppercase tracking-wide'}
                            placeholder="Título da seção"
                          />
                          <input
                            type="text"
                            value={section.description || ''}
                            onChange={(e) => updateSection(section.id, { description: e.target.value })}
                            className={inputClasse}
                            placeholder="Descrição / frase opcional (ex.: citação)"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Remover esta seção e todas as perguntas dela?')) {
                              setSections((prev) => prev.filter((s) => s.id !== section.id));
                              mark();
                            }
                          }}
                          className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Remover seção"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {section.questions.map((question, qIdx) => {
                      const isOpen = expandedQuestion === question.id;
                      return (
                        <div
                          key={question.id}
                          className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/30"
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-2 flex flex-col gap-0.5 text-gray-400">
                              <GripVertical className="h-4 w-4" />
                              <button
                                type="button"
                                onClick={() => moveQuestion(section.id, qIdx, -1)}
                                disabled={qIdx === 0}
                                className="rounded p-0.5 hover:text-gray-700 disabled:opacity-30"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveQuestion(section.id, qIdx, 1)}
                                disabled={qIdx === section.questions.length - 1}
                                className="rounded p-0.5 hover:text-gray-700 disabled:opacity-30"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                  {qIdx + 1}.
                                </span>
                                <input
                                  type="text"
                                  value={question.title}
                                  onChange={(e) =>
                                    updateQuestion(section.id, question.id, { title: e.target.value })
                                  }
                                  className={inputClasse + ' flex-1'}
                                  placeholder="Texto da pergunta"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-[180px] flex-1">
                                  <StringSingleSelectDropdown
                                    value={question.type}
                                    onChange={(v) => {
                                      const type = v as FieldType;
                                      const patch: Partial<Question> = { type };
                                      if (type === 'sim_nao') patch.options = ['SIM', 'NÃO'];
                                      if (type === 'pills' && !question.options?.length) {
                                        patch.options = ['Opção 1', 'Opção 2'];
                                      }
                                      updateQuestion(section.id, question.id, patch);
                                    }}
                                    options={Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => ({
                                      value,
                                      label,
                                    }))}
                                    allowEmpty={false}
                                    disableSearch
                                    placeholder="Tipo"
                                  />
                                </div>
                                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                                  <input
                                    type="checkbox"
                                    checked={!!question.required}
                                    onChange={(e) =>
                                      updateQuestion(section.id, question.id, {
                                        required: e.target.checked,
                                      })
                                    }
                                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                  />
                                  Obrigatória
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedQuestion((id) => (id === question.id ? null : question.id))
                                  }
                                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                >
                                  {isOpen ? 'Menos opções' : 'Mais opções'}
                                </button>
                              </div>

                              {isOpen && (
                                <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                                  {(question.type === 'pills' || question.type === 'sim_nao') && (
                                    <div>
                                      <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                        Opções (uma por linha)
                                      </label>
                                      <textarea
                                        value={(question.options || []).join('\n')}
                                        onChange={(e) =>
                                          updateQuestion(section.id, question.id, {
                                            options: e.target.value
                                              .split('\n')
                                              .map((l) => l.trim())
                                              .filter(Boolean),
                                          })
                                        }
                                        rows={3}
                                        className={inputClasse + ' resize-none font-mono text-xs'}
                                      />
                                    </div>
                                  )}
                                  {(question.type === 'text' || question.type === 'textarea') && (
                                    <div>
                                      <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                        Placeholder
                                      </label>
                                      <input
                                        type="text"
                                        value={question.placeholder || ''}
                                        onChange={(e) =>
                                          updateQuestion(section.id, question.id, {
                                            placeholder: e.target.value,
                                          })
                                        }
                                        className={inputClasse}
                                        placeholder="Texto de ajuda no campo"
                                      />
                                    </div>
                                  )}

                                  <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
                                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={!!question.followUp}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            updateQuestion(section.id, question.id, {
                                              followUp: {
                                                whenValue:
                                                  question.options?.[0] ||
                                                  (question.type === 'sim_nao' ? 'SIM' : ''),
                                                type: 'textarea',
                                                placeholder: 'Detalhe adicional...',
                                              },
                                            });
                                          } else {
                                            updateQuestion(section.id, question.id, { followUp: null });
                                          }
                                        }}
                                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                      />
                                      Campo extra condicional (aparece conforme a resposta)
                                    </label>
                                    {question.followUp && (
                                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div>
                                          <label className="mb-1 block text-xs text-gray-500">
                                            Aparece quando a resposta for
                                          </label>
                                          <input
                                            type="text"
                                            value={question.followUp.whenValue}
                                            onChange={(e) =>
                                              updateQuestion(section.id, question.id, {
                                                followUp: {
                                                  ...question.followUp!,
                                                  whenValue: e.target.value,
                                                },
                                              })
                                            }
                                            className={inputClasse}
                                            placeholder="Ex: SIM"
                                          />
                                        </div>
                                        <div>
                                          <label className="mb-1 block text-xs text-gray-500">
                                            Tipo do campo extra
                                          </label>
                                          <StringSingleSelectDropdown
                                            value={question.followUp.type}
                                            onChange={(v) =>
                                              updateQuestion(section.id, question.id, {
                                                followUp: {
                                                  ...question.followUp!,
                                                  type: v as FollowUp['type'],
                                                },
                                              })
                                            }
                                            options={[
                                              { value: 'text', label: 'Texto curto' },
                                              { value: 'textarea', label: 'Texto longo' },
                                              { value: 'pills', label: 'Opções' },
                                            ]}
                                            allowEmpty={false}
                                            disableSearch
                                          />
                                        </div>
                                        <div className="sm:col-span-2">
                                          <label className="mb-1 block text-xs text-gray-500">
                                            Placeholder do campo extra
                                          </label>
                                          <input
                                            type="text"
                                            value={question.followUp.placeholder || ''}
                                            onChange={(e) =>
                                              updateQuestion(section.id, question.id, {
                                                followUp: {
                                                  ...question.followUp!,
                                                  placeholder: e.target.value,
                                                },
                                              })
                                            }
                                            className={inputClasse}
                                          />
                                        </div>
                                        {question.followUp.type === 'pills' && (
                                          <div className="sm:col-span-2">
                                            <label className="mb-1 block text-xs text-gray-500">
                                              Opções do campo extra (uma por linha)
                                            </label>
                                            <textarea
                                              value={(question.followUp.options || []).join('\n')}
                                              onChange={(e) =>
                                                updateQuestion(section.id, question.id, {
                                                  followUp: {
                                                    ...question.followUp!,
                                                    options: e.target.value
                                                      .split('\n')
                                                      .map((l) => l.trim())
                                                      .filter(Boolean),
                                                  },
                                                })
                                              }
                                              rows={2}
                                              className={inputClasse + ' resize-none font-mono text-xs'}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Remover esta pergunta?')) {
                                  setSections((prev) =>
                                    prev.map((s) =>
                                      s.id !== section.id
                                        ? s
                                        : {
                                            ...s,
                                            questions: s.questions.filter((q) => q.id !== question.id),
                                          }
                                    )
                                  );
                                  mark();
                                }
                              }}
                              className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Remover pergunta"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        updateSection(section.id, {
                          questions: [...section.questions, newQuestion()],
                        });
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 transition-colors hover:border-red-400 hover:text-red-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-red-400/60 dark:hover:text-red-400"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar pergunta nesta seção
                    </button>
                  </CardContent>
                </Card>
              ))}

              <button
                type="button"
                onClick={() => {
                  setSections((prev) => [...prev, newSection()]);
                  mark();
                }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
              >
                <Plus className="h-5 w-5" />
                Adicionar nova seção
              </button>

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
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
