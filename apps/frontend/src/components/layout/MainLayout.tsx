'use client';

import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  readSidebarCollapsed,
  shouldForceSidebarCollapsed,
  SIDEBAR_TRANSITION_CLASS,
} from '@/lib/sidebarStorage';
import { SHOW_CHAT_FLOAT_BUTTON } from '@/lib/chatFloatButton';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import { usePermissions } from '@/hooks/usePermissions';
import { useLogout } from '@/hooks/useLogout';
import { useNativeWebRTCCall } from '@/hooks/useNativeWebRTCCall';
import { useChatSounds } from '@/hooks/useChatSounds';
import { NativeCallOverlay } from '@/components/conversas/NativeCallOverlay';
import { NativeCallProvider } from '@/contexts/NativeCallContext';
import { useModalOverlayObserver } from '@/hooks/useModalOverlayObserver';
import { usePageActivityTracker } from '@/hooks/usePageActivityTracker';
import { syncModalOpenClass } from '@/lib/modalBodyLock';
import { MainLayoutShellContext } from './MainLayoutShellContext';
import { isSociosBlockedCollaborationPath } from '@/lib/sociosCollaborationAccess';
import { PageEnter } from './PageEnter';
import { bootAuthenticatedPageReveal } from '@/lib/pageReveal';

export { useIsInsideMainLayoutShell } from './MainLayoutShellContext';

const ChatWidgetLazy = dynamic(
  () => import('../chat/ChatWidget').then((m) => ({ default: m.ChatWidget })),
  { ssr: false },
);

interface MainLayoutProps {
  children: React.ReactNode;
  userRole: 'EMPLOYEE';
  userName: string;
  /** Opcional: se omitido, usa logout padrão (limpa sessão e vai para /auth/login). */
  onLogout?: () => void;
}

function resolveInitialSidebarCollapsed(pathname: string | null): boolean {
  if (shouldForceSidebarCollapsed(pathname)) return true;
  return readSidebarCollapsed();
}

/** Adia WebRTC/sons para não competir com first paint pós-login. */
function useDeferredRealtimeReady(delayMs = 2500): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const enable = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(enable, { timeout: delayMs });
    } else {
      timeoutId = setTimeout(enable, delayMs);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [delayMs]);

  return ready;
}

export function MainLayout({ children, userRole, userName, onLogout }: MainLayoutProps) {
  const insideShell = useContext(MainLayoutShellContext);
  // Páginas legadas ainda envolvem MainLayout; sob o layout de /ponto só repassam o conteúdo.
  if (insideShell) {
    return <>{children}</>;
  }

  return (
    <MainLayoutShell
      userRole={userRole}
      userName={userName}
      onLogout={onLogout}
    >
      {children}
    </MainLayoutShell>
  );
}

function MainLayoutShell({ children, userRole, userName, onLogout }: MainLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const defaultLogout = useLogout();
  const handleLogout = onLogout ?? defaultLogout;
  const [isCollapsed, setIsCollapsed] = useState(() => resolveInitialSidebarCollapsed(pathname));
  const [layoutSynced, setLayoutSynced] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [pageRevealReady, setPageRevealReady] = useState(false);
  const [pageFromReload, setPageFromReload] = useState(false);
  const { user, canAccessCollaborationTools, isLoading: permissionsLoading } = usePermissions();
  const displayName = userName || user?.name || '';
  const displayRole = (userRole || user?.role || 'EMPLOYEE') as MainLayoutProps['userRole'];
  const realtimeReady = useDeferredRealtimeReady();
  const realtimeUserId =
    realtimeReady && canAccessCollaborationTools ? user?.id : undefined;
  const nativeCall = useNativeWebRTCCall({ userId: realtimeUserId });
  useChatSounds({ userId: realtimeUserId, callPhase: nativeCall.phase });

  useEffect(() => {
    let cancelled = false;
    const safety = window.setTimeout(() => {
      if (!cancelled) setPageRevealReady(true);
    }, 1000);

    void bootAuthenticatedPageReveal().then((result) => {
      if (cancelled) return;
      setPageFromReload(result.fromReload);
      setPageRevealReady(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
    };
  }, []);
  useModalOverlayObserver();
  usePageActivityTracker();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('app-shell-locked');
    return () => {
      root.classList.remove('app-shell-locked');
    };
  }, []);

  useEffect(() => {
    if (permissionsLoading || canAccessCollaborationTools) return;
    if (!isSociosBlockedCollaborationPath(pathname)) return;
    router.replace('/ponto/home');
  }, [permissionsLoading, canAccessCollaborationTools, pathname, router]);

  useLayoutEffect(() => {
    setIsCollapsed(resolveInitialSidebarCollapsed(pathname));
    setLayoutSynced(true);
    // Garante que a sidebar não fique bloqueada se um overlay ficou preso no DOM.
    syncModalOpenClass();
  }, [pathname]);

  const handleMenuToggle = useCallback((collapsed: boolean) => {
    setIsCollapsed((prev) => (prev === collapsed ? prev : collapsed));
  }, []);

  const handleOpenChangePassword = useCallback(() => {
    setIsChangePasswordOpen(true);
  }, []);

  const isFullBleedRoute = pathname != null && (
    pathname === '/ponto/conversas' ||
    pathname.startsWith('/ponto/conversas/') ||
    pathname === '/ponto/flow' ||
    pathname.startsWith('/ponto/flow')
  );

  const isKanbanRoute =
    pathname != null &&
    (pathname === '/ponto/kanban' || pathname.startsWith('/ponto/kanban/'));

  return (
    <MainLayoutShellContext.Provider value={true}>
      <NativeCallProvider value={nativeCall}>
        <div
          className={
            isKanbanRoute
              ? 'h-[100dvh] max-h-[100dvh] max-w-[100vw] overflow-hidden bg-white dark:bg-gray-900'
              : 'h-[100dvh] max-h-[100dvh] max-w-[100vw] overflow-hidden bg-gray-50 dark:bg-gray-900'
          }
          // Foco em elemento fora da área visível pode rolar este container mesmo com
          // overflow hidden, escondendo a topbar e cortando a página.
          onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollTop !== 0) el.scrollTop = 0;
            if (el.scrollLeft !== 0) el.scrollLeft = 0;
          }}
        >
          <Sidebar
            userRole={displayRole}
            userName={displayName}
            onLogout={handleLogout}
            onMenuToggle={handleMenuToggle}
            onOpenChangePassword={handleOpenChangePassword}
          />

          {/* Main Content — mesma duração/easing do painel tier 2 da sidebar */}
          <div
            className={`flex h-full min-h-0 min-w-0 max-w-full flex-col ${
              layoutSynced ? `transition-[margin-left] ${SIDEBAR_TRANSITION_CLASS}` : ''
            } ${isCollapsed ? 'lg:ml-20' : 'lg:ml-[23rem]'}`}
          >
            <TopNavbar
              userName={displayName}
              onLogout={handleLogout}
              onOpenChangePassword={handleOpenChangePassword}
            />
            <main
              className={
                isFullBleedRoute
                  ? 'app-page-scroll app-thin-scroll min-h-0 min-w-0 flex-1 overflow-hidden p-0'
                  : 'app-page-scroll app-thin-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4 lg:p-8'
              }
            >
              <PageEnter
                ready={pageRevealReady}
                fromReload={pageFromReload}
                className={isFullBleedRoute ? 'h-full min-h-0' : ''}
              >
                {children}
              </PageEnter>
            </main>
          </div>

          {SHOW_CHAT_FLOAT_BUTTON && canAccessCollaborationTools ? <ChatWidgetLazy /> : null}

          <NativeCallOverlay
            call={nativeCall}
            localAvatarUrl={user?.profilePhotoUrl ?? null}
            localDisplayName={user?.name ?? null}
          />

          <ChangePasswordModal
            isOpen={isChangePasswordOpen}
            onClose={() => setIsChangePasswordOpen(false)}
            onSuccess={() => {
              setIsChangePasswordOpen(false);
              queryClient.invalidateQueries({ queryKey: ['user'] });
            }}
          />
        </div>
      </NativeCallProvider>
    </MainLayoutShellContext.Provider>
  );
}
