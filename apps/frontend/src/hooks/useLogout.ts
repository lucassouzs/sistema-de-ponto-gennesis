'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '@/lib/auth';
import { authTransitionCover } from '@/lib/authTransition';

/** Logout padrão: anima saída, limpa sessão e vai para o login. */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(() => {
    void (async () => {
      await authTransitionCover('to-login');
      try {
        await authService.logout();
      } catch {
        /* segue para o login mesmo se a API falhar */
      }
      queryClient.clear();
      router.push('/auth/login');
    })();
  }, [queryClient, router]);
}
