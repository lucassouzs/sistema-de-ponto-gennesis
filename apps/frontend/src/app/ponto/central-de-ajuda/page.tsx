'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MoreVertical, Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { HelpSearch } from '@/components/helpCenter/HelpSearch';
import { HelpTutorialCard } from '@/components/helpCenter/HelpTutorialCard';
import { HelpTutorialFormModal } from '@/components/helpCenter/HelpTutorialCreateModal';
import { Loading } from '@/components/ui/Loading';
import {
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { usePermissions } from '@/hooks/usePermissions';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { getSetorMeta, HELP_SETOR_ORDER } from '@/lib/helpCenter/setores';
import {
  deleteHelpTutorial,
  fetchHelpTutorials,
  type HelpTutorialRecord,
} from '@/lib/helpTutorialsApi';

function SectionBanner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

function groupBySetor(tutorials: HelpTutorialRecord[]) {
  const map = new Map<string, HelpTutorialRecord[]>();
  for (const tutorial of tutorials) {
    const key = tutorial.setor?.trim() || 'Geral';
    const list = map.get(key) || [];
    list.push(tutorial);
    map.set(key, list);
  }

  const orderedKeys = [
    ...HELP_SETOR_ORDER.filter((s) => map.has(s)),
    ...[...map.keys()]
      .filter((s) => !(HELP_SETOR_ORDER as readonly string[]).includes(s))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ];

  return orderedKeys.map((setor) => ({
    setor,
    meta: getSetorMeta(setor),
    tutorials: map.get(setor) || [],
  }));
}

export default function CentralDeAjudaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdministrator, isElevatedUser } = usePermissions();
  const canManage = isAdministrator || isElevatedUser;

  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HelpTutorialRecord | null>(null);

  const { data: tutorials = [], isLoading, isError } = useQuery({
    queryKey: ['help-tutorials', query.trim()],
    queryFn: () => fetchHelpTutorials({ q: query.trim() || undefined }),
  });

  const groups = useMemo(() => groupBySetor(tutorials), [tutorials]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(tutorials);

  const handleDelete = async (tutorial: HelpTutorialRecord) => {
    if (
      !window.confirm(
        `Excluir o tutorial “${tutorial.title}”? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    try {
      await deleteHelpTutorial(tutorial.id);
      toast.success('Tutorial excluído');
      queryClient.invalidateQueries({ queryKey: ['help-tutorials'] });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Não foi possível excluir o tutorial'
      );
    }
  };

  return (
    <ProtectedRoute route="/ponto/central-de-ajuda">
      <div className="w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Central de Ajuda
          </h1>
          <p className="mt-2 max-w-xl mx-auto text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Acesse guias e tutoriais passo a passo, organizados por setor.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <HelpSearch value={query} onChange={setQuery} />
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Plus className="h-4 w-4" />
              Criar novo
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <Loading message="Carregando tutoriais..." size="md" />
        ) : isError ? (
          <p className="rounded-xl border border-dashed border-red-200 px-4 py-10 text-center text-sm text-red-600 dark:border-red-900 dark:text-red-400">
            Não foi possível carregar os tutoriais. Tente novamente.
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {query.trim()
              ? `Nenhum resultado para “${query.trim()}”.`
              : 'Nenhum tutorial publicado ainda.'}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.setor} className="flex flex-col gap-6">
                <SectionBanner
                  title={group.setor}
                  subtitle={group.meta.description}
                />
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {group.tutorials.map((tutorial) => (
                    <HelpTutorialCard
                      key={tutorial.id}
                      title={tutorial.title}
                      description={tutorial.summary}
                      preview={group.meta.preview}
                      href={`/ponto/central-de-ajuda/tutoriais/${tutorial.slug}`}
                      stepsLabel={
                        tutorial.contentType === 'DOCS'
                          ? 'Google Docs'
                          : tutorial.contentType === 'RICH'
                            ? 'Editor visual'
                            : tutorial.contentType === 'MARKDOWN'
                              ? 'Markdown'
                              : 'Passo a passo'
                      }
                      actionsAlwaysVisible={isRowMenuOpen(tutorial.id)}
                      actions={
                        canManage ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleRowActionMenu(tutorial.id, e.currentTarget);
                            }}
                            className={`rounded-md p-1 text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:text-gray-100 ${
                              isRowMenuOpen(tutorial.id) ? 'text-gray-800 dark:text-gray-100' : ''
                            }`}
                            aria-label="Menu de ações"
                            aria-expanded={isRowMenuOpen(tutorial.id)}
                            aria-haspopup="menu"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {canManage && rowActionMenu && rowForActionMenu ? (
        <RowActionMenuPortal
          menu={rowActionMenu}
          onClose={closeRowActionMenu}
          onEdit={() => setEditing(rowForActionMenu)}
          onDelete={() => handleDelete(rowForActionMenu)}
        />
      ) : null}

      {canManage ? (
        <>
          <HelpTutorialFormModal
            isOpen={createOpen}
            onClose={() => setCreateOpen(false)}
            onSaved={(slug) => {
              queryClient.invalidateQueries({ queryKey: ['help-tutorials'] });
              router.push(`/ponto/central-de-ajuda/tutoriais/${slug}`);
            }}
          />
          <HelpTutorialFormModal
            isOpen={!!editing}
            onClose={() => setEditing(null)}
            tutorial={editing}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['help-tutorials'] });
              setEditing(null);
            }}
          />
        </>
      ) : null}
    </ProtectedRoute>
  );
}
