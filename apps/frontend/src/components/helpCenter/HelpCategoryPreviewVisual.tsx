'use client';

import React from 'react';
import type { HelpCategoryPreview } from '@/lib/helpCenter';

function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-40 w-full items-center justify-center overflow-hidden bg-gradient-to-b from-gray-50 to-white p-4 dark:from-gray-900/80 dark:to-gray-800/40 sm:h-44">
      <div className="w-full max-w-[220px] rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-800">
        {children}
      </div>
    </div>
  );
}

function FakeInput({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <div className="mb-1 h-2 w-10 rounded bg-gray-200 dark:bg-gray-600" />
      <div className="h-6 rounded border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/40">
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

export function HelpCategoryPreviewVisual({
  preview,
}: {
  preview: HelpCategoryPreview;
}) {
  switch (preview) {
    case 'getting-started':
      return (
        <PreviewShell>
          <div className="space-y-2">
            <div className="mx-auto mb-2 h-6 w-6 rounded-full bg-red-100 dark:bg-red-900/40" />
            <FakeInput label="usuário" wide />
            <FakeInput label="senha" wide />
            <div className="mt-2 h-6 rounded-md bg-red-600/90 dark:bg-red-500/80" />
          </div>
        </PreviewShell>
      );
    case 'departamento-pessoal':
      return (
        <PreviewShell>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-600" />
              <div className="flex-1 space-y-1">
                <div className="h-2 w-20 rounded bg-gray-300 dark:bg-gray-500" />
                <div className="h-1.5 w-14 rounded bg-gray-200 dark:bg-gray-600" />
              </div>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-gray-100 dark:bg-gray-700" />
                <div className="h-2 flex-1 rounded bg-gray-200 dark:bg-gray-600" />
              </div>
            ))}
          </div>
        </PreviewShell>
      );
    case 'compras':
      return (
        <PreviewShell>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-16 rounded bg-gray-300 dark:bg-gray-500" />
              <div className="h-5 w-12 rounded bg-red-600/90 dark:bg-red-500/80" />
            </div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border border-gray-100 px-2 py-1.5 dark:border-gray-700"
              >
                <div className="h-2 w-24 rounded bg-gray-200 dark:bg-gray-600" />
                <div className="h-2 w-8 rounded bg-gray-300 dark:bg-gray-500" />
              </div>
            ))}
          </div>
        </PreviewShell>
      );
    case 'chamados':
      return (
        <PreviewShell>
          <div className="space-y-2">
            <div className="h-2.5 w-20 rounded bg-gray-300 dark:bg-gray-500" />
            <div className="grid grid-cols-3 gap-1.5">
              <div className="h-10 rounded bg-amber-100 dark:bg-amber-900/30" />
              <div className="h-10 rounded bg-blue-100 dark:bg-blue-900/30" />
              <div className="h-10 rounded bg-green-100 dark:bg-green-900/30" />
            </div>
            <div className="h-8 rounded border border-dashed border-gray-200 dark:border-gray-600" />
          </div>
        </PreviewShell>
      );
    case 'atendimentos':
      return (
        <PreviewShell>
          <div className="space-y-2">
            <div className="flex gap-1">
              <div className="h-5 flex-1 rounded bg-blue-600/90 dark:bg-blue-500/80" />
              <div className="h-5 flex-1 rounded bg-gray-100 dark:bg-gray-700" />
              <div className="h-5 flex-1 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
            <div className="space-y-1.5">
              <div className="ml-auto h-6 w-3/4 rounded-lg bg-gray-100 dark:bg-gray-700" />
              <div className="h-6 w-2/3 rounded-lg bg-blue-50 dark:bg-blue-900/40" />
              <div className="ml-auto h-6 w-1/2 rounded-lg bg-gray-100 dark:bg-gray-700" />
            </div>
          </div>
        </PreviewShell>
      );
    case 'conta':
      return (
        <PreviewShell>
          <div className="space-y-2">
            <FakeInput label="senha atual" wide />
            <FakeInput label="nova senha" wide />
            <FakeInput label="confirmar" wide />
            <div className="mt-1 flex justify-end">
              <div className="h-5 w-14 rounded bg-red-600/90 dark:bg-red-500/80" />
            </div>
          </div>
        </PreviewShell>
      );
    default:
      return null;
  }
}
