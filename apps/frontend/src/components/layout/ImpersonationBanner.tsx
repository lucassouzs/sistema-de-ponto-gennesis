'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldAlert } from 'lucide-react';
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
    <div className="z-40 shrink-0 bg-transparent px-3 pb-2 pt-2 sm:px-4">
      <div
        role="status"
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-3.5 py-2.5 shadow-[0_8px_24px_-12px_rgba(180,83,9,0.45)] dark:border-amber-500/30 dark:from-amber-950/80 dark:via-orange-950/70 dark:to-amber-950/80"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-600/30">
            <ShieldAlert className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
              Conta de {targetName}
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
              Você está navegando com a visão e as permissões desta pessoa.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Voltando…' : 'Sair da conta'}
        </button>
      </div>
    </div>
  );
}
