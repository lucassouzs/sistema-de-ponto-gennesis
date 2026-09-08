'use client';

import React from 'react';
import type { HelpStep } from '@/lib/helpCenter';

export function HelpTutorialSteps({ steps }: { steps: HelpStep[] }) {
  return (
    <ol className="space-y-6">
      {steps.map((step, index) => (
        <li key={`${index}-${step.title}`} className="flex gap-4">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-semibold text-white dark:bg-red-500"
            aria-hidden
          >
            {index + 1}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {step.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {step.body}
            </p>
            {step.hint ? (
              <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                {step.hint}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
