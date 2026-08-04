'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Camera,
  ChevronRight,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Moon,
  Sun,
} from 'lucide-react';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { resolveBreadcrumbs, appendBreadcrumbEntity } from '@/lib/pageTitle';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/context/ThemeContext';
import { usePageTitleOverride } from '@/context/PageTitleContext';
import { CircularPhotoCropModal } from '@/components/conversas/CircularPhotoCropModal';
import { NotificationsDropdown } from '@/components/layout/NotificationsDropdown';
import { NavSearch } from '@/components/layout/NavSearch';
import { dispatchOpenMobileSidebar } from '@/lib/layoutChrome';

interface TopNavbarProps {
  userName: string;
  onLogout: () => void;
  onOpenChangePassword?: () => void;
}

function getInitials(name: string | undefined | null) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className={`theme-toggle relative flex h-10 w-[4.5rem] shrink-0 items-center rounded-full p-1 transition-[background-color,box-shadow] duration-500 ease-out ${
        isDark
          ? 'bg-slate-800 shadow-[inset_0_2px_6px_rgba(0,0,0,0.65),inset_0_-1px_2px_rgba(255,255,255,0.06)]'
          : 'bg-sky-100 shadow-[inset_0_2px_6px_rgba(15,23,42,0.22),inset_0_-1px_2px_rgba(255,255,255,0.7)]'
      }`}
    >
      {/* Brilho do céu / noite — clipado pra não vazar do pill */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      >
        <span
          className={`absolute inset-0 transition-opacity duration-500 ${
            isDark
              ? 'opacity-100 bg-[radial-gradient(circle_at_75%_30%,rgba(99,102,241,0.35),transparent_55%)]'
              : 'opacity-100 bg-[radial-gradient(circle_at_25%_20%,rgba(253,224,71,0.45),transparent_50%)]'
          }`}
        />
        <span
          className={`theme-toggle-stars absolute inset-0 transition-opacity duration-500 ${
            isDark ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="absolute right-2.5 top-2 size-0.5 rounded-full bg-white/90" />
          <span className="absolute right-4 top-3.5 size-[3px] rounded-full bg-white/70" />
          <span className="absolute bottom-2 right-3 size-0.5 rounded-full bg-white/80" />
        </span>
      </span>

      {/* Knob — acima da sombra inset da borda, com sombra normal */}
      <span
        aria-hidden
        className={`theme-toggle-knob pointer-events-none absolute left-1 top-1 z-20 size-8 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)] ${
          isDark
            ? 'translate-x-0 bg-slate-200 shadow-[0_2px_6px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.25)]'
            : 'translate-x-8 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.22),0_1px_2px_rgba(15,23,42,0.12)]'
        }`}
      />

      <span className="relative z-30 grid w-full grid-cols-2 items-center">
        <span className="flex items-center justify-center">
          <Moon
            className={`h-4 w-4 transition-all duration-500 ease-out ${
              isDark
                ? 'theme-toggle-moon-active scale-110 text-slate-800'
                : 'scale-90 rotate-[-25deg] text-slate-400/70'
            }`}
          />
        </span>
        <span className="flex items-center justify-center">
          <Sun
            className={`h-4 w-4 transition-all duration-500 ease-out ${
              !isDark
                ? 'scale-110 text-amber-400'
                : 'scale-90 rotate-90 text-slate-500/60'
            }`}
          />
        </span>
      </span>
    </button>
  );
}

export function TopNavbar({
  userName,
  onLogout,
  onOpenChangePassword,
}: TopNavbarProps) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { user, userDepartment, userPosition } = usePermissions();
  const { isDark, toggleTheme } = useTheme();
  const { breadcrumbEntities } = usePageTitleOverride();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuPos, setProfileMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [profileCropSrc, setProfileCropSrc] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Evita mismatch de hidratação: no SSR não há localStorage/API user → "Usuário"/"US"
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    setProfileReady(true);
  }, []);

  const breadcrumbs = appendBreadcrumbEntity(
    resolveBreadcrumbs(pathname ?? '/'),
    breadcrumbEntities,
  );
  const displayName = user?.name || userName || 'Usuário';
  const cargoLabel = userPosition || userDepartment || 'Conta';
  const profilePhotoHref = resolveApiMediaUrl(user?.profilePhotoUrl ?? null);

  const { data: chatUnreadCount = 0 } = useQuery({
    queryKey: ['chat-unread-count', user?.id],
    queryFn: async () => {
      const res = await api.get('/chats/direct/unread/count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: () => {
      if (typeof document === 'undefined') return 30_000;
      return document.hidden ? false : 30_000;
    },
  });

  const uploadProfilePhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('profileAvatar', file);
      await api.patch('/auth/me/photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Foto de perfil atualizada');
      setProfileMenuOpen(false);
      setProfileCropSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    onError: () => toast.error('Não foi possível atualizar a foto'),
  });

  const updateProfileMenuPos = useCallback(() => {
    const el = profileTriggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setProfileMenuPos({
      top: Math.round(rect.bottom + 8),
      right: Math.round(window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) {
      setProfileMenuPos(null);
      return;
    }
    updateProfileMenuPos();
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (profileTriggerRef.current?.contains(t)) return;
      if (profileMenuRef.current?.contains(t)) return;
      setProfileMenuOpen(false);
    };
    const handleReposition = () => updateProfileMenuPos();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [profileMenuOpen, updateProfileMenuPos]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <header
        data-app-topnav
        className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 lg:gap-4 lg:px-6"
      >
        {/* Mobile menu */}
        <button
          type="button"
          onClick={() => dispatchOpenMobileSidebar()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200/80 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <nav aria-label="Breadcrumb" className="min-w-0 max-w-[14rem] sm:max-w-[20rem] xl:max-w-[28rem]">
            <ol className="flex min-w-0 items-center gap-1 overflow-hidden text-sm">
              {breadcrumbs.length === 0 ? (
                <li className="truncate font-semibold text-gray-900 dark:text-gray-100">Gennesis</li>
              ) : (
                breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                      {index > 0 ? (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
                          aria-hidden
                        />
                      ) : null}
                      {isLast ? (
                        <span
                          className="truncate font-semibold text-gray-900 dark:text-gray-100"
                          title={crumb.label}
                          aria-current="page"
                        >
                          {crumb.label}
                        </span>
                      ) : crumb.href ? (
                        <Link
                          href={crumb.href}
                          className="truncate text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                          title={crumb.label}
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          className="truncate text-gray-400 dark:text-gray-500"
                          title={crumb.label}
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })
              )}
            </ol>
          </nav>
        </div>

        {/* Busca + ações + perfil */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NavSearch inputRef={searchInputRef} />

          <NotificationsDropdown chatUnreadCount={chatUnreadCount} />

          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

          <button
            ref={profileTriggerRef}
            type="button"
            aria-haspopup="true"
            aria-expanded={profileMenuOpen}
            aria-label="Conta e configurações"
            onClick={() => setProfileMenuOpen((v) => !v)}
            className={`profile-avatar-btn relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-0 outline-none ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
              profileReady && profilePhotoHref
                ? 'bg-transparent'
                : 'bg-red-600'
            }`}
          >
            {profileReady && profilePhotoHref ? (
              <img
                src={profilePhotoHref}
                alt=""
                className="profile-avatar-btn__media h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="profile-avatar-btn__media text-sm font-semibold text-white">
                {profileReady ? getInitials(displayName) : '\u00A0'}
              </span>
            )}
            {uploadProfilePhotoMutation.isPending && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 size={18} className="animate-spin text-white" />
              </span>
            )}
          </button>
        </div>
      </header>

      <input
        ref={profileAvatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setProfileCropSrc(URL.createObjectURL(file));
          setProfileMenuOpen(false);
          e.target.value = '';
        }}
      />

      {profileMenuOpen &&
        profileMenuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              aria-hidden="true"
              onClick={() => setProfileMenuOpen(false)}
            />
            <div
              ref={profileMenuRef}
              role="menu"
              data-app-topnav
              style={{
                position: 'fixed',
                top: profileMenuPos.top,
                right: profileMenuPos.right,
                zIndex: 9999,
              }}
              className="w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => {
                    profileAvatarInputRef.current?.click();
                  }}
                  className="group relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                  aria-label="Carregar foto"
                  title="Carregar foto"
                >
                  {profilePhotoHref ? (
                    <img
                      src={profilePhotoHref}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-white">
                      {getInitials(displayName)}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera size={16} className="text-white" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {cargoLabel}
                  </p>
                </div>
              </div>

              <div className="mx-3 border-t border-gray-100 dark:border-gray-700" />

              <div className="py-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onOpenChangePassword?.();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/70"
                >
                  <Lock size={16} className="shrink-0 text-gray-500 dark:text-gray-400" />
                  <span className="font-medium">Alterar senha</span>
                </button>
              </div>

              <div className="mx-3 border-t border-gray-100 dark:border-gray-700" />

              <div className="py-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setShowLogoutConfirm(true);
                  }}
                  className="group flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-red-50 dark:text-gray-200 dark:hover:bg-red-900/20"
                >
                  <LogOut
                    size={16}
                    className="shrink-0 text-gray-500 group-hover:text-red-600 dark:text-gray-400 dark:group-hover:text-red-400"
                  />
                  <span className="font-medium group-hover:text-red-600 dark:group-hover:text-red-400">
                    Sair
                  </span>
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {showLogoutConfirm && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
              Deseja sair?
            </h3>
            <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja sair do sistema? Você precisará fazer login novamente para
              acessar.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      <CircularPhotoCropModal
        open={!!profileCropSrc}
        imageSrc={profileCropSrc ?? ''}
        onClose={() => {
          if (profileCropSrc) URL.revokeObjectURL(profileCropSrc);
          setProfileCropSrc(null);
        }}
        onConfirm={async (file: File) => {
          await uploadProfilePhotoMutation.mutateAsync(file);
        }}
        onPickReplacement={(file) => {
          if (profileCropSrc) URL.revokeObjectURL(profileCropSrc);
          setProfileCropSrc(URL.createObjectURL(file));
        }}
      />
    </>
  );
}
