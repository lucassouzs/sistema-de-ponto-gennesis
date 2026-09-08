'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="px-4 text-center">
        <h1 className="mb-4 text-6xl font-bold text-gray-900 dark:text-gray-100">500</h1>
        <h2 className="mb-4 text-2xl font-semibold text-gray-700 dark:text-gray-300">
          Erro interno
        </h2>
        <p className="mb-8 text-gray-600 dark:text-gray-400">
          Algo deu errado. Tente novamente.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-red-600 px-6 py-3 text-white transition-colors hover:bg-red-700"
          >
            Tentar de novo
          </button>
          <Link
            href="/ponto/home"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
