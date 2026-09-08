'use client';

import React from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { HelpTutorialGoogleDoc } from '@/components/helpCenter/HelpTutorialGoogleDoc';
import { HelpTutorialMarkdown } from '@/components/helpCenter/HelpTutorialMarkdown';
import { HelpTutorialRichHtml } from '@/components/helpCenter/HelpTutorialRichHtml';
import { HelpTutorialSteps } from '@/components/helpCenter/HelpTutorialSteps';
import { Loading } from '@/components/ui/Loading';
import { fetchHelpTutorialBySlug } from '@/lib/helpTutorialsApi';

export default function HelpTutorialPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  const { data: tutorial, isLoading, isError, error } = useQuery({
    queryKey: ['help-tutorial', slug],
    queryFn: () => fetchHelpTutorialBySlug(slug),
    enabled: !!slug,
    retry: false,
  });

  if (!slug) {
    notFound();
    return null;
  }

  if (isLoading) {
    return (
      <ProtectedRoute route="/ponto/central-de-ajuda">
        <Loading message="Carregando tutorial..." fullScreen size="lg" />
      </ProtectedRoute>
    );
  }

  if (isError || !tutorial) {
    const status = (error as any)?.response?.status;
    if (status === 404) {
      notFound();
      return null;
    }
    return (
      <ProtectedRoute route="/ponto/central-de-ajuda">
        <div className="w-full space-y-4">
          <Link
            href="/ponto/central-de-ajuda"
            aria-label="Voltar à Central de Ajuda"
            className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Voltar
          </Link>
          <p className="rounded-xl border border-dashed border-red-200 px-4 py-10 text-center text-sm text-red-600 dark:border-red-900 dark:text-red-400">
            Não foi possível carregar este tutorial.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/central-de-ajuda">
      <div className="w-full space-y-6">
        <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
          <Link
            href="/ponto/central-de-ajuda"
            aria-label="Voltar à Central de Ajuda"
            className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Voltar
          </Link>
          <div className="px-16 text-center sm:px-24">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {tutorial.title}
            </h1>
            <p className="mt-2 max-w-xl mx-auto text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {tutorial.summary}
            </p>
          </div>
        </div>

        {tutorial.contentType === 'DOCS' ? (
          <HelpTutorialGoogleDoc docsUrl={tutorial.docsUrl || ''} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-700 dark:bg-gray-800">
            {tutorial.contentType === 'RICH' ? (
              <HelpTutorialRichHtml html={tutorial.richHtml || ''} />
            ) : tutorial.contentType === 'MARKDOWN' ? (
              <HelpTutorialMarkdown markdown={tutorial.markdown || ''} />
            ) : (
              <HelpTutorialSteps steps={tutorial.steps} />
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
