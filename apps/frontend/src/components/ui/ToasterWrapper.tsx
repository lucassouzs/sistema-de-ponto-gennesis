'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '@/context/ThemeContext';

export function ToasterWrapper() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: isDark ? '#1f2937' : '#ffffff',
          color: isDark ? '#f3f4f6' : '#111827',
          border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '12px 16px',
          boxShadow: isDark 
            ? '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)'
            : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: '#22c55e',
            secondary: '#fff',
          },
          style: {
            background: isDark ? '#1f2937' : '#ffffff',
            color: isDark ? '#f3f4f6' : '#111827',
            border: isDark ? '1px solid #22c55e' : '1px solid #22c55e',
          },
        },
        error: {
          duration: 5000,
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
          style: {
            background: isDark ? '#1f2937' : '#ffffff',
            color: isDark ? '#f3f4f6' : '#111827',
            border: isDark ? '1px solid #ef4444' : '1px solid #ef4444',
          },
        },
      }}
    />
  );
}

