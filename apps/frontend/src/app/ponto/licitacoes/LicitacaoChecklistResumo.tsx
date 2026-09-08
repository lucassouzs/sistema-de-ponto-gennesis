'use client';

import { CheckSquare, MessageSquare } from 'lucide-react';
import type { ChecklistResumoSection } from './licitacaoChecklist';
import { LicitacaoCommentFormatted } from './LicitacaoCommentEditor';

type Props = {
  sections: ChecklistResumoSection[];
  responsavelAnalise?: string;
  linkNotebookLm?: string;
  selectedTitulo?: string | null;
  analiseUsuario?: string;
};

function notebookLmHref(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function LicitacaoChecklistResumo({
  sections,
  responsavelAnalise,
  linkNotebookLm,
  selectedTitulo,
  analiseUsuario,
}: Props) {
  const totalItens = sections.reduce((acc, s) => acc + s.items.length, 0);
  const totalMarcados = sections.reduce(
    (acc, s) => acc + s.items.filter((i) => i.checked).length,
    0
  );
  const totalComentados = sections.reduce(
    (acc, s) => acc + s.items.filter((i) => i.comentario).length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Responsável pela análise
        </p>
        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
          {responsavelAnalise?.trim() ? responsavelAnalise.trim() : '—'}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Caderno no Notebook LM
        </p>
        {linkNotebookLm?.trim() ? (
          <a
            href={notebookLmHref(linkNotebookLm)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {linkNotebookLm.trim()}
          </a>
        ) : (
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">—</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        {selectedTitulo ? (
          <span className="font-medium text-gray-700 dark:text-gray-300">{selectedTitulo}</span>
        ) : null}
        <span>{totalItens} item(ns) no resumo</span>
        <span>{totalMarcados} marcado(s)</span>
        <span>{totalComentados} com comentário</span>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600">
          Nenhum item marcado ou comentado no checklist ainda.
        </p>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.id}
              className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/30"
            >
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950/40"
                  >
                    <div className="flex items-start gap-2">
                      <CheckSquare
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          item.checked ? 'text-green-600' : 'text-gray-300 dark:text-gray-600'
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-gray-100">{item.label}</p>
                        {item.comentario ? (
                          <div className="mt-1.5 flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                            <div className="min-w-0 flex-1">
                              <LicitacaoCommentFormatted text={item.comentario} />
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 text-xs italic text-gray-400">Sem comentário</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Sua análise
        </h3>
        {analiseUsuario?.trim() ? (
          <p className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200">
            {analiseUsuario.trim()}
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-600">
            Nenhuma análise escrita ainda.
          </p>
        )}
      </div>
    </div>
  );
}
