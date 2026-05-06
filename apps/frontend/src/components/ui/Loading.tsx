'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Loading({ 
  message = 'Carregando...', 
  fullScreen = false,
  size = 'md',
  className = ''
}: LoadingProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  };

  const spinner = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2 className={`${sizeClasses[size]} animate-spin text-red-600 dark:text-red-400 mb-4`} />
      {message && (
        <p className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300">
          {message}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-95 dark:bg-opacity-95 flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

interface LoadingOverlayProps {
  message?: string;
  show?: boolean;
}

export function LoadingOverlay({ message = 'Carregando...', show = true }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 bg-white dark:bg-gray-900 bg-opacity-90 dark:bg-opacity-90 flex items-center justify-center z-50 rounded-lg">
      <div className="flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-red-600 dark:text-red-400 mb-4" />
        {message && (
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

