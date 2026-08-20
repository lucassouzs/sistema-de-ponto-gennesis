'use client';

import React from 'react';
import { Search } from 'lucide-react';

export function HelpSearch({
  value,
  onChange,
  placeholder = 'Faça uma pergunta ou busque…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar na Central de Ajuda"
        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-red-500/50"
      />
    </div>
  );
}
