'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  FORM_FIELD_TYPE_LABELS,
  type FormFieldType,
  type FormFollowUp,
  type FormQuestion,
  type FormSection,
  newFormQuestion,
  newFormSection,
} from '@/components/forms/formStructureTypes';

const inputClasse =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition ' +
  'placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 ' +
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

type Props = {
  sections: FormSection[];
  onChange: (sections: FormSection[]) => void;
};

export function FormStructureBuilder({ sections, onChange }: Props) {
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const setSections = (updater: (prev: FormSection[]) => FormSection[]) => {
    onChange(updater(sections));
  };

  const updateSection = (sectionId: string, patch: Partial<FormSection>) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
  };

  const updateQuestion = (
    sectionId: string,
    questionId: string,
    patch: Partial<FormQuestion>
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              questions: s.questions.map((q) =>
                q.id === questionId ? { ...q, ...patch } : q
              ),
            }
      )
    );
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
  };

  return (
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
                    onChange={(e) =>
                      updateSection(section.id, { description: e.target.value })
                    }
                    className={inputClasse}
                    placeholder="Descrição / frase opcional (ex.: citação)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Remover esta seção e todas as perguntas dela?')) {
                      setSections((prev) => prev.filter((s) => s.id !== section.id));
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
                            updateQuestion(section.id, question.id, {
                              title: e.target.value,
                            })
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
                              const type = v as FormFieldType;
                              const patch: Partial<FormQuestion> = { type };
                              if (type === 'sim_nao') patch.options = ['SIM', 'NÃO'];
                              if (type === 'pills' && !question.options?.length) {
                                patch.options = ['Opção 1', 'Opção 2'];
                              }
                              updateQuestion(section.id, question.id, patch);
                            }}
                            options={Object.entries(FORM_FIELD_TYPE_LABELS).map(
                              ([value, label]) => ({ value, label })
                            )}
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
                            setExpandedQuestion((id) =>
                              id === question.id ? null : question.id
                            )
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
                                    updateQuestion(section.id, question.id, {
                                      followUp: null,
                                    });
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
                                          type: v as FormFollowUp['type'],
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
                                      className={
                                        inputClasse + ' resize-none font-mono text-xs'
                                      }
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
                                    questions: s.questions.filter(
                                      (q) => q.id !== question.id
                                    ),
                                  }
                            )
                          );
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
                  questions: [...section.questions, newFormQuestion()],
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
        onClick={() => setSections((prev) => [...prev, newFormSection()])}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
      >
        <Plus className="h-5 w-5" />
        Adicionar nova seção
      </button>
    </div>
  );
}
