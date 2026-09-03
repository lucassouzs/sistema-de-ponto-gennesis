'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/lib/auth';

export function ImpersonationBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [targetName, setTargetName] = useState('outro usuário');

  useEffect(() => {
    const sync = () => {
      setActive(authService.isImpersonating());
      setTargetName(authService.getImpersonationTargetName() || 'outro usuário');
    };
    sync();
    window.addEventListener('impersonation-changed', sync);
    return () => window.removeEventListener('impersonation-changed', sync);
  }, []);

  const handleStop = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authService.stopImpersonation();
      await queryClient.clear();
      toast.success('Você voltou à sua conta de administrador');
      router.replace('/ponto/funcionarios');
      router.refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao encerrar impersonação';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, queryClient, router]);

  if (!active) return null;

  return (
    <div className="z-40 shrink-0 border-b border-amber-500/40 bg-amber-500 px-3 py-2 text-amber-950 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <UserRound className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Você está vendo o sistema como <strong>{targetName}</strong>
          </span>
        </p>
        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/90 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-950 disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Voltando…' : 'Voltar ao admin'}
        </button>
      </div>
    </div>
  );
}
