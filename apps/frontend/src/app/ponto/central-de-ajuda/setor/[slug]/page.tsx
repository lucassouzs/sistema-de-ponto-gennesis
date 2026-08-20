'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { HelpBreadcrumbs } from '@/components/helpCenter/HelpBreadcrumbs';
import { Loading } from '@/components/ui/Loading';
import {
  getSetorMeta,
  resolveSetorFromSlug,
  slugifySetor,
} from '@/lib/helpCenter/setores';
import { fetchHelpTutorials } from '@/lib/helpTutorialsApi';

export default function HelpSetorPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';

  const { data: tutorials = [], isLoading, isError } = useQuery({
    queryKey: ['help-tutorials'],
    queryFn: () => fetchHelpTutorials(),
    enabled: !!slug,
  });

  const setor = useMemo(() => {
    const known = resolveSetorFromSlug(slug);
    if (known) return known;
    const match = tutorials.find((t) => slugifySetor(t.setor) === slug);
    return match?.setor ?? null;
  }, [slug, tutorials]);

  const setorTutorials = useMemo(
    () => (setor ? tutorials.filter((t) => (t.setor?.trim() || 'Geral') === setor) : []),
    [tutorials, setor]
  );

  if (!slug) {
    notFound();
    return null;
  }

  if (!isLoading && !setor) {
    notFound();
    return null;
  }

  const meta = setor ? getSetorMeta(setor) : null;

  return (
    <ProtectedRoute route="/ponto/central-de-ajuda">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {isLoading || !setor || !meta ? (
          <Loading message="Carregando tutoriais..." size="md" />
        ) : (
          <>
            <div>
              <HelpBreadcrumbs
                items={[
                  { label: 'Central de Ajuda', href: '/ponto/central-de-ajuda' },
                  { label: setor },
                ]}
              />
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                {setor}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                {meta.description}
              </p>
            </div>

            {isError ? (
              <p className="rounded-xl border border-dashed border-red-200 px-4 py-10 text-center text-sm text-red-600 dark:border-red-900 dark:text-red-400">
                Não foi possível carregar os tutoriais.
              </p>
            ) : setorTutorials.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Em breve — ainda não há tutoriais neste setor.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
                {setorTutorials.map((tutorial) => (
                  <li key={tutorial.id}>
                    <Link
                      href={`/ponto/central-de-ajuda/tutoriais/${tutorial.slug}`}
                      className="flex gap-3 px-4 py-4 transition hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {tutorial.title}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                          {tutorial.summary}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                          {tutorial.steps.length}{' '}
                          {tutorial.steps.length === 1 ? 'passo' : 'passos'}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
