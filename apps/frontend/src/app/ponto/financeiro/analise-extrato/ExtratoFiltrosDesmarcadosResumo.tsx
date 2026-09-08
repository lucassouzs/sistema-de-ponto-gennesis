'use client';

import React from 'react';
import type { ExtratoFiltroCampoDesmarcado } from '@/lib/extratoCaixaFiltrosSalvos';

type ExtratoFiltrosDesmarcadosResumoProps = {
  camposDesmarcados: ExtratoFiltroCampoDesmarcado[];
};

export function ExtratoFiltrosDesmarcadosResumo({
  camposDesmarcados
}: ExtratoFiltrosDesmarcadosResumoProps) {
  if (camposDesmarcados.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900/30">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Itens excluídos das listas
      </p>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {camposDesmarcados.map((campo) => {
          const valores = campo.desmarcados.join(' · ');
          return (
            <li key={campo.campo} className="min-w-0 text-sm">
              <p className="truncate font-medium text-gray-800 dark:text-gray-200" title={campo.campo}>
                {campo.campo}
                <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">
                  ({campo.desmarcados.length})
                </span>
              </p>
              <p
                className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-600 dark:text-gray-400"
                title={valores}
              >
                {valores}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
