'use client';

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { HelpRichTextEditor } from '@/components/helpCenter/HelpRichTextEditor';
import { stringsToSelectOptions } from '@/lib/selectOptionBuilders';
import { DEPARTMENTS_LIST } from '@/constants/payrollFilters';
import {
  createHelpTutorial,
  updateHelpTutorial,
  type HelpContentType,
  type HelpTutorialCreatePayload,
  type HelpTutorialRecord,
  type HelpTutorialStep,
} from '@/lib/helpTutorialsApi';

const SETOR_OPTIONS = stringsToSelectOptions(['Geral', ...DEPARTMENTS_LIST]);

const emptyStep = (): HelpTutorialStep => ({ title: '', body: '', hint: '' });

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Se informado, o modal edita este tutorial. */
  tutorial?: HelpTutorialRecord | null;
  onSaved: (slug: string) => void;
};

export function HelpTutorialFormModal({
  isOpen,
  onClose,
  tutorial,
  onSaved,
}: Props) {
  const isEdit = !!tutorial;
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [setor, setSetor] = useState('Geral');
  const [href, setHref] = useState('');
  const [keywords, setKeywords] = useState('');
  const [contentType, setContentType] = useState<HelpContentType>('STEPS');
  const [markdown, setMarkdown] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [richHtml, setRichHtml] = useState('');
  const [steps, setSteps] = useState<HelpTutorialStep[]>([emptyStep(), emptyStep()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (tutorial) {
      setTitle(tutorial.title);
      setSummary(tutorial.summary);
      setSetor(tutorial.setor || 'Geral');
      setHref(tutorial.href || '');
      setKeywords((tutorial.keywords || []).join(', '));
      setContentType(
        tutorial.contentType === 'MARKDOWN'
          ? 'MARKDOWN'
          : tutorial.contentType === 'DOCS'
            ? 'DOCS'
            : tutorial.contentType === 'RICH'
              ? 'RICH'
              : 'STEPS'
      );
      setMarkdown(tutorial.markdown || '');
      setDocsUrl(tutorial.docsUrl || '');
      setRichHtml(tutorial.richHtml || '');
      setSteps(
        tutorial.steps.length > 0
          ? tutorial.steps.map((s) => ({
              title: s.title,
              body: s.body,
              hint: s.hint || '',
            }))
          : [emptyStep(), emptyStep()]
      );
    } else {
      setTitle('');
      setSummary('');
      setSetor('Geral');
      setHref('');
      setKeywords('');
      setContentType('STEPS');
      setMarkdown('');
      setDocsUrl('');
      setRichHtml('');
      setSteps([emptyStep(), emptyStep()]);
    }
  }, [isOpen, tutorial]);

  const canSubmit = useMemo(() => {
    if (!title.trim() || !summary.trim() || !setor.trim()) return false;
    if (contentType === 'MARKDOWN') return !!markdown.trim();
    if (contentType === 'DOCS') return !!docsUrl.trim();
    if (contentType === 'RICH') {
      const text = richHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      return !!text;
    }
    return steps.some((s) => s.title.trim() && s.body.trim());
  }, [title, summary, setor, contentType, markdown, docsUrl, richHtml, steps]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const updateStep = (index: number, patch: Partial<HelpTutorialStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;

    const payload: HelpTutorialCreatePayload = {
      title: title.trim(),
      summary: summary.trim(),
      setor: setor.trim(),
      href: href.trim() || null,
      keywords: keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      contentType,
      steps:
        contentType === 'STEPS'
          ? steps
              .map((s) => ({
                title: s.title.trim(),
                body: s.body.trim(),
                ...(s.hint?.trim() ? { hint: s.hint.trim() } : {}),
              }))
              .filter((s) => s.title && s.body)
          : [],
      markdown: contentType === 'MARKDOWN' ? markdown.trim() : null,
      docsUrl: contentType === 'DOCS' ? docsUrl.trim() : null,
      richHtml: contentType === 'RICH' ? richHtml : null,
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await updateHelpTutorial(tutorial!.id, payload)
        : await createHelpTutorial(payload);
      toast.success(isEdit ? 'Tutorial atualizado' : 'Tutorial criado');
      onSaved(saved.slug);
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          (isEdit
            ? 'Não foi possível atualizar o tutorial'
            : 'Não foi possível criar o tutorial')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Editar tutorial' : 'Novo tutorial'}
      size="2xl"
      confirmBeforeClose
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Título
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Ex.: Como aprovar uma OC"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Resumo
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Breve descrição do que o tutorial ensina"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Setor
            </label>
            <StringSingleSelectDropdown
              value={setor}
              onChange={(v) => setSetor(v || 'Geral')}
              options={SETOR_OPTIONS}
              placeholder="Selecione o setor"
              allowEmpty={false}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Link no sistema (opcional)
            </label>
            <input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="/ponto/..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Palavras-chave (separadas por vírgula)
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="rm, materiais, compras"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Formato do conteúdo
          </label>
          <SegmentedControl
            aria-label="Formato do conteúdo"
            value={contentType}
            onChange={setContentType}
            options={[
              { value: 'STEPS', label: 'Passo a passo' },
              { value: 'MARKDOWN', label: 'Markdown' },
              { value: 'DOCS', label: 'Docs' },
              { value: 'RICH', label: 'Visual' },
            ]}
          />
        </div>

        {contentType === 'RICH' ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Conteúdo
            </label>
            <HelpRichTextEditor value={richHtml} onChange={setRichHtml} />
          </div>
        ) : contentType === 'DOCS' ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Link do Google Docs
            </label>
            <input
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="https://docs.google.com/document/d/..."
              required
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Cole o link do documento. Ele precisa estar compartilhado como
              “Qualquer pessoa com o link” (pelo menos visualização) para aparecer embutido.
            </p>
          </div>
        ) : contentType === 'MARKDOWN' ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Conteúdo Markdown
            </label>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={14}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder={
                '# Título\n\nTexto com **negrito** e *itálico*.\n\n- Item 1\n- Item 2\n\n1. Passo A\n2. Passo B\n\n`código` e [link](https://exemplo.com)'
              }
              required
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Suporta títulos (# ## ###), listas, negrito, itálico, links, código e blocos ```.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Passos
              </h3>
              <button
                type="button"
                onClick={() => setSteps((prev) => [...prev, emptyStep()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar passo
              </button>
            </div>

            {steps.map((step, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Passo {index + 1}
                  </span>
                  {steps.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded p-1 text-gray-400 hover:bg-white hover:text-red-600 dark:hover:bg-gray-800"
                      aria-label={`Remover passo ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <input
                  value={step.title}
                  onChange={(e) => updateStep(index, { title: e.target.value })}
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Título do passo"
                />
                <textarea
                  value={step.body}
                  onChange={(e) => updateStep(index, { body: e.target.value })}
                  rows={2}
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Descrição do que fazer"
                />
                <input
                  value={step.hint || ''}
                  onChange={(e) => updateStep(index, { hint: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Dica (opcional)"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar tutorial'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** @deprecated use HelpTutorialFormModal */
export function HelpTutorialCreateModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  return (
    <HelpTutorialFormModal
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onCreated}
    />
  );
}
