'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  HardDrive,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Pencil,
  Search,
  LayoutGrid,
  List,
  X,
  AlertTriangle,
  Loader2,
  MoreVertical,
  Users,
  UserPlus,
  ListPlus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  Star,
  RotateCcw,
  Clock,
} from 'lucide-react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { DriveFileThumb } from '@/components/drive/DriveFileThumb';
import { DriveMimeIcon } from '@/components/drive/DriveMimeIcon';
import {
  DriveSidebar,
  type DriveSidebarView,
} from '@/components/drive/DriveSidebar';
import { DriveListView } from '@/components/drive/DriveListView';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import { getDropdownPortalRoot } from '@/lib/zIndex';
import {
  DriveUploadPanel,
  type DriveUploadItem,
} from '@/components/drive/DriveUploadPanel';
import {
  collectFilesFromDataTransfer,
  filesFromFileList,
  isAbortError,
  postFileViaApi,
  putFileToPresignedUrl,
  type DriveDroppedFile,
} from '@/lib/driveUpload';

const SHARE_PERMISSION_OPTIONS = labeledToSelectOptions([
  { value: 'READ', label: 'Leitura (ver e baixar)' },
  { value: 'READ_WRITE', label: 'Edição (enviar e criar subpastas)' },
]);

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  ownerName?: string | null;
  ownerPhotoUrl?: string | null;
  starred?: boolean;
  trashedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
  canManageShares?: boolean;
  /** Pode enviar ficheiros e criar subpastas (falso se só leitura na partilha). */
  canWrite?: boolean;
}

interface DriveFile {
  id: string;
  name: string;
  originalName: string;
  s3Key: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  ownerId: string;
  ownerName?: string | null;
  ownerPhotoUrl?: string | null;
  starred?: boolean;
  trashedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FolderContents {
  folders: DriveFolder[];
  files: DriveFile[];
  breadcrumb: Array<{ id: string; name: string }>;
  /** Pasta atualmente aberta (quando não está na raiz). */
  currentFolder?: DriveFolder | null;
}

// ── Utilitários ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Alternância grade / lista — mesmo SegmentedControl da Agenda/Tarefas. */
function DriveViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <SegmentedControl
      value={viewMode}
      onChange={onViewModeChange}
      aria-label="Exibição: grade ou lista"
      options={[
        {
          value: 'grid',
          title: 'Grade',
          ariaLabel: 'Grade',
          label: <LayoutGrid className="h-4 w-4" aria-hidden />,
        },
        {
          value: 'list',
          title: 'Lista',
          ariaLabel: 'Lista',
          label: <List className="h-4 w-4" aria-hidden />,
        },
      ]}
    />
  );
}

/** Checkbox do dropdown (mesmo padrão visual da página de orçamento — serviços). */
function ShareUserDropdownCheckbox({
  id,
  checked,
  indeterminate,
  onChange,
  children,
  compact,
}: {
  id?: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  const filled = checked || Boolean(indeterminate);
  return (
    <label
      className={`group flex items-start gap-3 rounded-lg cursor-pointer transition-colors ${
        compact ? 'py-1.5 min-h-10 px-2 -mx-2' : 'py-2.5 px-2 -mx-2'
      } hover:bg-gray-100/95 dark:hover:bg-gray-600/50`}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all shadow-sm outline-none group-focus-within:ring-2 group-focus-within:ring-red-500/80 group-focus-within:ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ${
          filled
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-500 dark:bg-gray-800 dark:group-hover:border-red-400/70'
        }`}
        aria-hidden
      >
        {checked && !indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
          </svg>
        )}
      </span>
      {children}
    </label>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

function DrivePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Pasta aberta = query `?folder=<id>`. Atual com voltar/avançar e links partilháveis. */
  const currentFolderId = searchParams?.get('folder')?.trim() || undefined;
  const viewParam = searchParams?.get('view')?.trim() || '';
  const driveView: DriveSidebarView =
    viewParam === 'shared' ||
    viewParam === 'recent' ||
    viewParam === 'starred' ||
    viewParam === 'trash'
      ? viewParam
      : 'meu-drive';
  const isMyDriveView = driveView === 'meu-drive';

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadItems, setUploadItems] = useState<DriveUploadItem[]>([]);
  const [uploadPanelMinimized, setUploadPanelMinimized] = useState(false);
  const uploadAbortRef = useRef<Map<string, AbortController>>(new Map());
  const [showNewMenu, setShowNewMenu] = useState(false);
  /** null = menu ancorado no botão; coords = menu no clique direito */
  const [newMenuCoords, setNewMenuCoords] = useState<{ x: number; y: number } | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Modais
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameTarget, setRenameTarget] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
  } | null>(null);
  const [renameName, setRenameName] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
  } | null>(null);

  const [shareFolder, setShareFolder] = useState<DriveFolder | null>(null);
  /** Filtro dentro do dropdown (lista já carregada). */
  const [shareListFilter, setShareListFilter] = useState('');
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<Set<string>>(() => new Set());
  const [showShareUserDropdown, setShowShareUserDropdown] = useState(false);
  const shareUsersDropdownRef = useRef<HTMLDivElement>(null);
  const shareDropdownPanelRef = useRef<HTMLDivElement>(null);
  const [shareDropdownPos, setShareDropdownPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  // ── Dados do usuário (padrão do sistema) ──────────────────────────────────

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data;

  const goToFolder = useCallback(
    (id: string | undefined) => {
      setSearchQuery('');
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      next.delete('view');
      if (id) {
        next.set('folder', id);
      } else {
        next.delete('folder');
      }
      const qs = next.toString();
      const base = pathname ?? '/ponto/drive';
      // push (não replace) para o botão Voltar do navegador retornar à pasta anterior
      router.push(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setDriveView = useCallback(
    (view: DriveSidebarView) => {
      setSearchQuery('');
      const next = new URLSearchParams();
      if (view !== 'meu-drive') {
        next.set('view', view);
      }
      const qs = next.toString();
      const base = pathname ?? '/ponto/drive';
      router.push(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router],
  );

  // ── Queries de conteúdo ───────────────────────────────────────────────────

  const { data: contents, isLoading: loadingContents, error: contentsError } = useQuery<FolderContents>({
    queryKey: ['drive', currentFolderId ?? 'root'],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (currentFolderId) params.folderId = currentFolderId;
      const res = await api.get('/drive', { params });
      return res.data.data;
    },
    enabled: !!user && !searchQuery && isMyDriveView,
    retry: 1,
  });

  const { data: viewContents, isLoading: loadingView } = useQuery<{
    folders: DriveFolder[];
    files: DriveFile[];
  }>({
    queryKey: ['drive-view', driveView],
    queryFn: async () => {
      const path =
        driveView === 'shared'
          ? '/drive/views/shared'
          : driveView === 'recent'
            ? '/drive/views/recent'
            : driveView === 'starred'
              ? '/drive/views/starred'
              : '/drive/views/trash';
      const res = await api.get(path);
      return res.data.data;
    },
    enabled: !!user && !searchQuery && !isMyDriveView,
    retry: 1,
  });

  const { data: storageInfo, isLoading: loadingStorage } = useQuery({
    queryKey: ['drive-storage'],
    queryFn: async () => {
      const res = await api.get('/drive/storage');
      return res.data.data as { usedBytes: number; quotaBytes: number };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery<{
    folders: DriveFolder[];
    files: DriveFile[];
  }>({
    queryKey: ['drive-search', searchQuery],
    queryFn: async () => {
      const res = await api.get('/drive/search', { params: { q: searchQuery } });
      return res.data.data;
    },
    enabled: !!user && !!searchQuery.trim(),
  });

  const folders = searchQuery
    ? (searchResults?.folders ?? [])
    : isMyDriveView
      ? (contents?.folders ?? [])
      : (viewContents?.folders ?? []);
  const files = searchQuery
    ? (searchResults?.files ?? [])
    : isMyDriveView
      ? (contents?.files ?? [])
      : (viewContents?.files ?? []);
  const breadcrumb = isMyDriveView ? (contents?.breadcrumb ?? []) : [];
  const currentFolderMeta = isMyDriveView ? (contents?.currentFolder ?? null) : null;
  const isLoading = loadingContents || loadingSearch || loadingView;
  const isEmpty = !isLoading && folders.length === 0 && files.length === 0;
  /** Raiz: sempre pode; dentro de pasta: `canWrite === false` = só leitura (não exibir upload/nova pasta). */
  const canWriteInCurrentFolder =
    driveView === 'trash'
      ? false
      : !currentFolderId || currentFolderMeta?.canWrite !== false;
  const isTrashView = driveView === 'trash';

  const topBreadcrumbTrail = useMemo(() => {
    if (!isMyDriveView) {
      if (driveView === 'shared') return [{ label: 'Compartilhados comigo' }];
      if (driveView === 'recent') return [{ label: 'Recentes' }];
      if (driveView === 'starred') return [{ label: 'Com estrela' }];
      if (driveView === 'trash') return [{ label: 'Lixeira' }];
      return null;
    }
    // Pastas ficam só no título da página — no topo para em Meu Drive
    return null;
  }, [isMyDriveView, driveView]);

  useBreadcrumbEntity(topBreadcrumbTrail);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidateDrive = () => {
    queryClient.invalidateQueries({ queryKey: ['drive'] });
    queryClient.invalidateQueries({ queryKey: ['drive-view'] });
    queryClient.invalidateQueries({ queryKey: ['drive-search'] });
    queryClient.invalidateQueries({ queryKey: ['drive-shares'] });
    queryClient.invalidateQueries({ queryKey: ['drive-storage'] });
  };

  const { data: shareRows = [] } = useQuery({
    queryKey: ['drive-shares', shareFolder?.id],
    queryFn: async () => {
      const res = await api.get(`/drive/folders/${shareFolder!.id}/shares`);
      return res.data.data as Array<{
        id: string;
        userId: string;
        permission: 'READ' | 'READ_WRITE';
        user: { id: string; name: string; email: string };
      }>;
    },
    enabled: !!shareFolder?.id,
  });

  const { data: allUsersForShare = [], isLoading: loadingShareUserList } = useQuery({
    queryKey: ['drive-share-user-list'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 1000, page: 1 } });
      return (res.data.data ?? []) as Array<{ id: string; name: string; email: string }>;
    },
    enabled: !!shareFolder,
    staleTime: 60_000,
  });

  const shareCandidateUsers = useMemo(() => {
    const sharedIds = new Set(shareRows.map((r) => r.userId));
    const q = shareListFilter.trim().toLowerCase();
    return allUsersForShare
      .filter((u) => u.id !== user?.id && !sharedIds.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allUsersForShare, shareRows, shareListFilter, user?.id]);

  const shareSelectAllState = useMemo(() => {
    const allIds = shareCandidateUsers.map((u) => u.id);
    const allChecked = allIds.length > 0 && allIds.every((id) => selectedShareUserIds.has(id));
    const someChecked = allIds.some((id) => selectedShareUserIds.has(id));
    return { allIds, allChecked, partial: someChecked && !allChecked };
  }, [shareCandidateUsers, selectedShareUserIds]);

  const setShareSelectAllInView = useCallback(
    (check: boolean) => {
      setSelectedShareUserIds((prev) => {
        const n = new Set(prev);
        const ids = shareCandidateUsers.map((u) => u.id);
        if (check) ids.forEach((id) => n.add(id));
        else ids.forEach((id) => n.delete(id));
        return n;
      });
    },
    [shareCandidateUsers],
  );

  const toggleShareUserSelection = useCallback((id: string) => {
    setSelectedShareUserIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const addShareMut = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedShareUserIds);
      if (ids.length === 0) return { added: 0, failed: 0 };
      const results = await Promise.allSettled(
        ids.map((userId) =>
          api.post(`/drive/folders/${shareFolder!.id}/shares`, {
            userId,
            permission: 'READ' as const,
          }),
        ),
      );
      const added = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - added;
      return { added, failed };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['drive-shares', shareFolder?.id] });
      setSelectedShareUserIds(new Set());
      if (data == null) return;
      if (data.added > 0 && data.failed === 0) {
        toast.success(
          data.added === 1
            ? 'Pessoa adicionada. Ajuste a permissão abaixo, se quiser.'
            : `${data.added} pessoas adicionadas. Ajuste a permissão de cada uma abaixo, se quiser.`,
        );
      } else if (data.added > 0 && data.failed > 0) {
        toast.success(`${data.added} adicionado(s); ${data.failed} falhou(aram).`);
      } else if (data.failed > 0) {
        toast.error('Não foi possível conceder acesso. Talvez alguns já tenham permissão.');
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao compartilhar'),
  });

  useLayoutEffect(() => {
    if (!showShareUserDropdown) {
      setShareDropdownPos(null);
      return;
    }
    const update = () => {
      const el = shareUsersDropdownRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 6;
      const margin = 12;
      const preferred = Math.min(28 * 16, window.innerHeight - margin * 2);
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      if (openUp) {
        setShareDropdownPos({
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + gap,
          maxHeight: Math.max(160, Math.min(preferred, spaceAbove)),
        });
      } else {
        setShareDropdownPos({
          left: rect.left,
          width: rect.width,
          top: rect.bottom + gap,
          maxHeight: Math.max(160, Math.min(preferred, spaceBelow)),
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showShareUserDropdown, shareCandidateUsers.length, shareListFilter]);

  useEffect(() => {
    if (!showShareUserDropdown) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (shareUsersDropdownRef.current?.contains(t)) return;
      if (shareDropdownPanelRef.current?.contains(t)) return;
      setShowShareUserDropdown(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showShareUserDropdown]);

  useEffect(() => {
    if (!showNewMenu) return;
    const handle = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
        setNewMenuCoords(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showNewMenu]);

  const closeNewMenu = useCallback(() => {
    setShowNewMenu(false);
    setNewMenuCoords(null);
  }, []);

  const openNewMenuFromButton = useCallback(() => {
    setNewMenuCoords(null);
    setShowNewMenu((v) => !v);
  }, []);

  const openNewMenuFromContext = useCallback(
    (e: React.MouseEvent) => {
      if (!canWriteInCurrentFolder) return;
      e.preventDefault();
      const menuW = 224;
      const menuH = 120;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setNewMenuCoords({ x: Math.max(8, x), y: Math.max(8, y) });
      setShowNewMenu(true);
    },
    [canWriteInCurrentFolder],
  );

  const newMenuPanel = (
    <div
      ref={newMenuRef}
      className={
        newMenuCoords
          ? 'fixed z-[60] w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900'
          : 'absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900'
      }
      style={
        newMenuCoords
          ? { left: newMenuCoords.x, top: newMenuCoords.y }
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => {
          closeNewMenu();
          setNewFolderName('');
          setShowNewFolder(true);
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <FolderPlus className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </span>
        Nova pasta
      </button>
      <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
      <button
        type="button"
        onClick={() => {
          closeNewMenu();
          fileInputRef.current?.click();
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <Upload className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </span>
        Upload de arquivo
      </button>
    </div>
  );

  const removeShareMut = useMutation({
    mutationFn: (uid: string) =>
      api.delete(`/drive/folders/${shareFolder!.id}/shares/${uid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-shares', shareFolder?.id] });
      toast.success('Acesso removido');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao remover'),
  });

  const updateShareMut = useMutation({
    mutationFn: ({ uid, perm }: { uid: string; perm: 'READ' | 'READ_WRITE' }) =>
      api.patch(`/drive/folders/${shareFolder!.id}/shares/${uid}`, { permission: perm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-shares', shareFolder?.id] });
      toast.success('Permissão atualizada');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao atualizar'),
  });

  const createFolderMut = useMutation({
    mutationFn: (name: string) =>
      api.post('/drive/folders', { name, parentId: currentFolderId ?? null }),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta criada com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao criar pasta');
    },
  });

  const renameFolderMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/drive/folders/${id}`, { name }),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta renomeada!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao renomear pasta');
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/folders/${id}`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta movida para a lixeira');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao excluir pasta');
    },
  });

  const renameFileMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/drive/files/${id}`, { name }),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo renomeado!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao renomear arquivo');
    },
  });

  const deleteFileMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/files/${id}`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo movido para a lixeira');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao excluir arquivo');
    },
  });

  const starFolderMut = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch(`/drive/folders/${id}/star`, { starred }),
    onSuccess: (_d, vars) => {
      invalidateDrive();
      toast.success(vars.starred ? 'Pasta marcada com estrela' : 'Estrela removida');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao marcar pasta'),
  });

  const starFileMut = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch(`/drive/files/${id}/star`, { starred }),
    onSuccess: (_d, vars) => {
      invalidateDrive();
      toast.success(vars.starred ? 'Arquivo marcado com estrela' : 'Estrela removida');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao marcar arquivo'),
  });

  const restoreFolderMut = useMutation({
    mutationFn: (id: string) => api.post(`/drive/folders/${id}/restore`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta restaurada');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao restaurar'),
  });

  const restoreFileMut = useMutation({
    mutationFn: (id: string) => api.post(`/drive/files/${id}/restore`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo restaurado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao restaurar'),
  });

  const permanentDeleteFolderMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/folders/${id}/permanent`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Pasta excluída permanentemente');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao excluir'),
  });

  const permanentDeleteFileMut = useMutation({
    mutationFn: (id: string) => api.delete(`/drive/files/${id}/permanent`),
    onSuccess: () => {
      invalidateDrive();
      toast.success('Arquivo excluído permanentemente');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao excluir'),
  });

  // ── Upload ─────────────────────────────────────────────────────────────────

  const patchUploadItem = useCallback((id: string, patch: Partial<DriveUploadItem>) => {
    setUploadItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const cancelUploadItem = useCallback((id: string) => {
    const ctrl = uploadAbortRef.current.get(id);
    ctrl?.abort();
    uploadAbortRef.current.delete(id);
    patchUploadItem(id, { status: 'cancelled', progress: 0 });
  }, [patchUploadItem]);

  const cancelAllUploads = useCallback(() => {
    uploadAbortRef.current.forEach((ctrl) => ctrl.abort());
    uploadAbortRef.current.clear();
    setUploadItems((prev) =>
      prev.map((it) =>
        it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued'
          ? { ...it, status: 'cancelled' as const, progress: 0 }
          : it,
      ),
    );
  }, []);

  const closeUploadPanel = useCallback(() => {
    const hasActive = uploadItems.some(
      (it) => it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued',
    );
    if (hasActive) {
      cancelAllUploads();
    }
    setUploadItems([]);
    setUploadPanelMinimized(false);
  }, [uploadItems, cancelAllUploads]);

  const uploadOneFile = useCallback(
    async (file: File, itemId: string, folderId: string | undefined, signal: AbortSignal) => {
      let startedAt = Date.now();
      patchUploadItem(itemId, {
        status: 'uploading',
        startedAt,
        loaded: 0,
        progress: 0,
      });

      const onProgress = (loaded: number, total: number) => {
        const elapsedSec = Math.max(0.05, (Date.now() - startedAt) / 1000);
        const speedBps = loaded / elapsedSec;
        const doneBytes = total > 0 && loaded >= total;
        const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
        patchUploadItem(itemId, {
          loaded,
          size: total || file.size,
          progress: pct,
          speedBps,
          status: doneBytes ? 'finalizing' : 'uploading',
        });
      };

      const runProxyUpload = async () => {
        startedAt = Date.now();
        patchUploadItem(itemId, {
          status: 'uploading',
          loaded: 0,
          progress: 0,
          startedAt,
        });
        await postFileViaApi(file, folderId, onProgress, signal);
      };

      let uploadedViaS3 = false;
      let finishedViaProxy = false;

      try {
        const presignRes = await api.post(
          '/drive/files/presign',
          {
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            folderId: folderId || undefined,
          },
          { timeout: 60_000 },
        );
        const { uploadUrl, s3Key, contentType } = presignRes.data.data as {
          uploadUrl: string;
          s3Key: string;
          contentType: string;
        };

        try {
          await putFileToPresignedUrl(
            uploadUrl,
            file,
            contentType || file.type || 'application/octet-stream',
            onProgress,
            signal,
          );
          uploadedViaS3 = true;
        } catch (putErr) {
          if (isAbortError(putErr) || signal.aborted) throw putErr;
          // CORS / rede → sobe pelo API (mais lento em arquivos grandes)
          await runProxyUpload();
          finishedViaProxy = true;
        }

        if (uploadedViaS3) {
          patchUploadItem(itemId, { status: 'finalizing', progress: 99 });
          await api.post(
            '/drive/files/confirm',
            {
              s3Key,
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              folderId: folderId || undefined,
            },
            { timeout: 120_000 },
          );
        }
      } catch (err) {
        if (isAbortError(err) || signal.aborted) throw err;
        if (uploadedViaS3 || finishedViaProxy) throw err;
        await runProxyUpload();
      }

      patchUploadItem(itemId, {
        status: 'done',
        progress: 100,
        loaded: file.size,
      });
    },
    [patchUploadItem],
  );

  const uploadFiles = useCallback(
    async (dropped: DriveDroppedFile[]) => {
      if (dropped.length === 0) {
        toast.error('Nenhum arquivo encontrado. Se arrastou uma pasta, tente de novo.');
        return;
      }

      const rootFolderId = currentFolderId;
      /** path relativo da pasta (sem o nome do arquivo) → id no Drive */
      const folderIdByPath = new Map<string, string | undefined>();
      folderIdByPath.set('', rootFolderId);

      const ensureFolderPath = async (dirPath: string): Promise<string | undefined> => {
        if (!dirPath) return rootFolderId;
        if (folderIdByPath.has(dirPath)) return folderIdByPath.get(dirPath);

        const parts = dirPath.split('/').filter(Boolean);
        let parentId = rootFolderId;
        let built = '';
        for (const part of parts) {
          built = built ? `${built}/${part}` : part;
          if (folderIdByPath.has(built)) {
            parentId = folderIdByPath.get(built);
            continue;
          }
          const res = await api.post('/drive/folders', {
            name: part,
            parentId: parentId ?? null,
          });
          const createdId = (res.data.data as { id: string }).id;
          folderIdByPath.set(built, createdId);
          parentId = createdId;
        }
        return parentId;
      };

      const batch = dropped.map(({ file, relativePath }) => {
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const normalized = relativePath.replace(/\\/g, '/');
        const slash = normalized.lastIndexOf('/');
        const dirPath = slash >= 0 ? normalized.slice(0, slash) : '';
        return {
          id,
          name: file.name,
          size: file.size,
          loaded: 0,
          progress: 0,
          status: 'queued' as const,
          startedAt: Date.now(),
          file,
          dirPath,
        };
      });

      setUploadPanelMinimized(false);
      setUploadItems((prev) => [
        ...prev.filter((it) => it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued'),
        ...batch.map(({ file: _f, dirPath: _d, ...rest }) => rest),
      ]);

      let ok = 0;
      let failed = 0;

      for (const item of batch) {
        const ctrl = new AbortController();
        uploadAbortRef.current.set(item.id, ctrl);
        try {
          if (!item.file.size) {
            throw new Error('Arquivo vazio ou pasta inválida');
          }
          const targetFolderId = await ensureFolderPath(item.dirPath);
          await uploadOneFile(item.file, item.id, targetFolderId, ctrl.signal);
          ok += 1;
        } catch (err: unknown) {
          if (isAbortError(err) || ctrl.signal.aborted) {
            patchUploadItem(item.id, { status: 'cancelled' });
          } else {
            failed += 1;
            const msg =
              err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                : undefined;
            patchUploadItem(item.id, {
              status: 'error',
              error: msg || (err instanceof Error ? err.message : 'Falha no upload'),
            });
          }
        } finally {
          uploadAbortRef.current.delete(item.id);
        }
      }

      if (ok > 0) {
        invalidateDrive();
        toast.success(ok === 1 ? 'Arquivo enviado com sucesso!' : `${ok} arquivos enviados!`);
      }
      if (failed > 0 && ok === 0) {
        toast.error(failed === 1 ? 'Falha no upload' : `${failed} uploads falharam`);
      }
    },
    [currentFolderId, uploadOneFile, patchUploadItem],
  );

  const isUploading = uploadItems.some(
    (it) => it.status === 'uploading' || it.status === 'finalizing' || it.status === 'queued',
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void uploadFiles(filesFromFileList(e.target.files));
    }
    e.target.value = '';
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (!canWriteInCurrentFolder) {
        toast.error('Não é possível enviar arquivos nesta pasta (somente leitura).');
        return;
      }
      try {
        const files = await collectFilesFromDataTransfer(e.dataTransfer);
        await uploadFiles(files);
      } catch {
        toast.error('Não foi possível ler a pasta arrastada. Tente novamente.');
      }
    },
    [uploadFiles, canWriteInCurrentFolder],
  );

  // ── Download ───────────────────────────────────────────────────────────────

  const downloadFile = async (file: DriveFile) => {
    try {
      const res = await api.get(`/drive/files/${file.id}/download`);
      const url = res.data.data.url;
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      a.target = '_blank';
      a.click();
    } catch {
      toast.error('Erro ao gerar link de download');
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openFolder = (id: string) => {
    goToFolder(id);
  };

  const openRename = (type: 'folder' | 'file', id: string, name: string) => {
    setRenameTarget({ type, id, name });
    setRenameName(name);
  };

  const submitRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    if (renameTarget.type === 'folder') {
      await renameFolderMut.mutateAsync({ id: renameTarget.id, name: renameName.trim() });
    } else {
      await renameFileMut.mutateAsync({ id: renameTarget.id, name: renameName.trim() });
    }
    setRenameTarget(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (isTrashView) {
      if (deleteTarget.type === 'folder') {
        await permanentDeleteFolderMut.mutateAsync(deleteTarget.id);
      } else {
        await permanentDeleteFileMut.mutateAsync(deleteTarget.id);
      }
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.type === 'folder') {
      const wasViewingThisFolder = deleteTarget.id === currentFolderId;
      await deleteFolderMut.mutateAsync(deleteTarget.id);
      if (wasViewingThisFolder) {
        if (breadcrumb.length >= 2) {
          goToFolder(breadcrumb[breadcrumb.length - 2]!.id);
        } else {
          goToFolder(undefined);
        }
      }
    } else {
      await deleteFileMut.mutateAsync(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  // ── Loading inicial (padrão do sistema) ───────────────────────────────────

  if (loadingUser || !userData) {
    return <Loading message="Carregando Drive..." fullScreen size="lg" />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <MainLayout userRole={user?.role} userName={user?.name} onLogout={handleLogout}>
      {/* Zona de drag-and-drop global */}
      <div
        className="min-h-full"
        onDragOver={(e) => {
          if (!canWriteInCurrentFolder) return;
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingOver(false);
          }
        }}
        onDrop={handleDrop}
        onContextMenu={openNewMenuFromContext}
      >
        {/* Overlay drag-and-drop */}
        {isDraggingOver && canWriteInCurrentFolder && (
          <div className="fixed inset-0 z-[2000] bg-red-600/10 border-4 border-dashed border-red-500 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl text-center border border-gray-200 dark:border-gray-700">
              <Upload className="h-12 w-12 text-red-600 dark:text-red-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Solte para fazer upload
              </p>
            </div>
          </div>
        )}

        {/* Input oculto para upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
              <HardDrive className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              {driveView === 'shared' ||
              driveView === 'recent' ||
              driveView === 'starred' ||
              driveView === 'trash' ? (
                <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                  {driveView === 'shared'
                    ? 'Compartilhados comigo'
                    : driveView === 'recent'
                      ? 'Recentes'
                      : driveView === 'starred'
                        ? 'Com estrela'
                        : 'Lixeira'}
                </h1>
              ) : (
                <>
                  <h1 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold sm:text-xl">
                    {breadcrumb.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => goToFolder(undefined)}
                        className="shrink-0 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        Meu Drive
                      </button>
                    ) : (
                      <span className="text-gray-900 dark:text-gray-100">Meu Drive</span>
                    )}
                    {breadcrumb.map((crumb, i) => {
                      const isLast = i === breadcrumb.length - 1;
                      return (
                        <React.Fragment key={crumb.id}>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                            aria-hidden
                          />
                          {isLast ? (
                            <span
                              className="min-w-0 truncate text-gray-900 dark:text-gray-100"
                              title={crumb.name}
                            >
                              {crumb.name}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => goToFolder(crumb.id)}
                              className="min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                              title={crumb.name}
                            >
                              {crumb.name}
                            </button>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </h1>
                  {currentFolderId && currentFolderMeta?.canManageShares && (
                    <button
                      type="button"
                      onClick={() => setShareFolder(currentFolderMeta as DriveFolder)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      title="Gerenciar acesso a esta pasta"
                      aria-label="Gerenciar acesso a esta pasta"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Buscar arquivos e pastas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex h-9 items-center gap-2">
              {!isLoading && !contentsError && !isEmpty && (
                <DriveViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
              )}

              {canWriteInCurrentFolder && (
                <div className="relative h-9">
                  <button
                    type="button"
                    onClick={openNewMenuFromButton}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    aria-label="Novo"
                    aria-expanded={showNewMenu && !newMenuCoords}
                    title="Novo"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" strokeWidth={2.25} />
                    )}
                    <span>Novo</span>
                  </button>

                  {showNewMenu && !newMenuCoords ? newMenuPanel : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <DriveSidebar
            activeView={driveView}
            onChangeView={setDriveView}
            storage={storageInfo}
            storageLoading={loadingStorage}
          />

          <div className="min-w-0 flex-1">
        {searchQuery && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Resultados para{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              &ldquo;{searchQuery}&rdquo;
            </span>{' '}
            — {folders.length + files.length} item(s)
          </p>
        )}

        {/* ── Conteúdo ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loading message="Carregando arquivos..." size="md" />
          </div>
        ) : contentsError ? (
          <Card>
            <CardContent className="py-10 text-center">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
              <p className="font-medium text-gray-700 dark:text-gray-300">
                Erro ao carregar o Drive
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Verifique se o servidor está rodando e tente novamente.
              </p>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['drive'] })}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
              >
                Tentar novamente
              </button>
            </CardContent>
          </Card>
        ) : isEmpty ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-600 dark:bg-gray-900/40">
            <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-2xl bg-red-50 p-4 dark:bg-red-950/30">
              {driveView === 'trash' ? (
                <Trash2 className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : driveView === 'starred' ? (
                <Star className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : driveView === 'shared' ? (
                <Users className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : driveView === 'recent' ? (
                <Clock className="h-9 w-9 text-red-500 dark:text-red-400" />
              ) : (
                <HardDrive className="h-9 w-9 text-red-500 dark:text-red-400" />
              )}
            </div>
            <p className="mb-1 text-base font-semibold text-gray-800 dark:text-gray-200">
              {searchQuery
                ? 'Nenhum resultado encontrado'
                : driveView === 'shared'
                  ? 'Nada compartilhado com você'
                  : driveView === 'recent'
                    ? 'Nenhum arquivo recente'
                    : driveView === 'starred'
                      ? 'Nenhum item com estrela'
                      : driveView === 'trash'
                        ? 'Lixeira vazia'
                        : 'Pasta vazia'}
            </p>
            <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              {searchQuery
                ? 'Tente uma busca diferente'
                : driveView === 'shared'
                  ? 'Quando alguém compartilhar uma pasta com você, ela aparecerá aqui.'
                  : driveView === 'recent'
                    ? 'Arquivos que você abrir ou alterar aparecerão aqui.'
                    : driveView === 'starred'
                      ? 'Marque pastas ou arquivos com estrela para encontrá-los rápido.'
                      : driveView === 'trash'
                        ? 'Itens excluídos ficam aqui até serem restaurados ou apagados.'
                        : canWriteInCurrentFolder
                          ? 'Faça upload de arquivos ou crie uma nova pasta para começar.'
                          : 'Esta pasta foi compartilhada com acesso somente leitura.'}
            </p>
            {!searchQuery && isMyDriveView && canWriteInCurrentFolder && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Upload className="h-4 w-4" />
                  Upload de arquivo
                </button>
                <button
                  onClick={() => {
                    setNewFolderName('');
                    setShowNewFolder(true);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <FolderPlus className="h-4 w-4" />
                  Nova pasta
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <GridView
            folders={folders}
            files={files}
            onOpenFolder={openFolder}
            onDownload={downloadFile}
            onRename={openRename}
            onDelete={(type, id, name) => setDeleteTarget({ type, id, name })}
            onOpenShare={setShareFolder}
            onToggleStar={(type, id, starred) => {
              if (type === 'folder') starFolderMut.mutate({ id, starred });
              else starFileMut.mutate({ id, starred });
            }}
            onRestore={(type, id) => {
              if (type === 'folder') restoreFolderMut.mutate(id);
              else restoreFileMut.mutate(id);
            }}
            trashMode={isTrashView}
            currentUserId={user?.id}
          />
        ) : (
          <DriveListView
            folders={folders}
            files={files}
            onOpenFolder={openFolder}
            onDownload={downloadFile}
            onRename={openRename}
            onDelete={(type, id, name) => setDeleteTarget({ type, id, name })}
            onOpenShare={setShareFolder}
            onToggleStar={(type, id, starred) => {
              if (type === 'folder') starFolderMut.mutate({ id, starred });
              else starFileMut.mutate({ id, starred });
            }}
            onRestore={(type, id) => {
              if (type === 'folder') restoreFolderMut.mutate(id);
              else restoreFileMut.mutate(id);
            }}
            trashMode={isTrashView}
            currentUserId={user?.id}
          />
        )}
          </div>
        </div>

        {/* ── Modais ─────────────────────────────────────────────────────── */}

        {/* Nova Pasta */}
        <Modal
          isOpen={showNewFolder}
          onClose={() => setShowNewFolder(false)}
          title="Nova Pasta"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome da pasta
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Digite o nome da pasta..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    createFolderMut.mutate(newFolderName.trim());
                    setShowNewFolder(false);
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewFolder(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={!newFolderName.trim() || createFolderMut.isPending}
                onClick={() => {
                  createFolderMut.mutate(newFolderName.trim());
                  setShowNewFolder(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {createFolderMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar
              </button>
            </div>
          </div>
        </Modal>

        {/* Renomear */}
        <Modal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          title={`Renomear ${renameTarget?.type === 'folder' ? 'pasta' : 'arquivo'}`}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Novo nome
              </label>
              <input
                type="text"
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameName.trim()) submitRename();
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={
                  !renameName.trim() ||
                  renameFolderMut.isPending ||
                  renameFileMut.isPending
                }
                onClick={submitRename}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {(renameFolderMut.isPending || renameFileMut.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </Modal>

        {/* Excluir / Lixeira */}
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title={isTrashView ? 'Excluir permanentemente' : 'Mover para a lixeira'}
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {isTrashView ? (
                    <>
                      Tem certeza que deseja excluir permanentemente{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        &ldquo;{deleteTarget?.name}&rdquo;
                      </span>
                      ? Esta ação não pode ser desfeita.
                    </>
                  ) : (
                    <>
                      Mover{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        &ldquo;{deleteTarget?.name}&rdquo;
                      </span>{' '}
                      para a lixeira?
                    </>
                  )}
                </p>
                {deleteTarget?.type === 'folder' && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {isTrashView
                      ? 'Todo o conteúdo da pasta será excluído permanentemente.'
                      : 'A pasta e todo o conteúdo serão movidos para a lixeira.'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={
                  deleteFolderMut.isPending ||
                  deleteFileMut.isPending ||
                  permanentDeleteFolderMut.isPending ||
                  permanentDeleteFileMut.isPending
                }
                onClick={submitDelete}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {(deleteFolderMut.isPending ||
                  deleteFileMut.isPending ||
                  permanentDeleteFolderMut.isPending ||
                  permanentDeleteFileMut.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {isTrashView ? 'Excluir permanentemente' : 'Mover para lixeira'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Compartilhamento de pasta */}
        <Modal
          isOpen={!!shareFolder}
          onClose={() => {
            setShareFolder(null);
            setShareListFilter('');
            setSelectedShareUserIds(new Set());
            setShowShareUserDropdown(false);
          }}
          title={shareFolder ? `Acesso: ${shareFolder.name}` : 'Acesso à pasta'}
          size="lg"
        >
          {shareFolder && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Escolha quem pode ver esta pasta. Quem tiver acesso vê também tudo o que estiver
                dentro dela. Apenas o dono pode excluir a pasta.
              </p>

              <div className="border border-gray-200 dark:border-gray-600 rounded-md p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Convidar pessoas
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Usuários ativos do sistema. Você e quem já tem acesso não aparecem. Marque quem deseja e clique em
                  Adicionar. Em <span className="font-medium">Quem tem acesso</span>, defina leitura ou edição para cada
                  pessoa.
                </p>
                {loadingShareUserList ? (
                  <div className="flex items-center justify-center py-6 text-sm text-gray-500 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando usuários…
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Quem receberá acesso
                      </span>
                      <div className="flex items-stretch gap-2 min-w-0">
                        <div
                          ref={shareUsersDropdownRef}
                          className="relative flex-1 min-w-0"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowShareUserDropdown((v) => !v);
                            }}
                            className="w-full min-h-[3rem] h-12 pl-12 pr-12 text-left rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                          >
                            <ListPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5 pointer-events-none" />
                            <span className="block pr-1 truncate">
                              {selectedShareUserIds.size === 0
                                ? 'Selecione pessoas…'
                                : shareCandidateUsers.length === 0
                                  ? 'Ninguém disponível'
                                  : `${selectedShareUserIds.size} pessoa(s) selecionada(s)`}
                            </span>
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                              {showShareUserDropdown ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </span>
                          </button>
                          {showShareUserDropdown &&
                            shareDropdownPos &&
                            createPortal(
                              <div
                                ref={shareDropdownPanelRef}
                                className="fixed z-[2200] rounded-lg border border-gray-300 bg-white p-3 shadow-xl ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-800 dark:ring-white/10"
                                style={{
                                  left: shareDropdownPos.left,
                                  width: shareDropdownPos.width,
                                  top: shareDropdownPos.top,
                                  bottom: shareDropdownPos.bottom,
                                  maxHeight: shareDropdownPos.maxHeight,
                                  overflowY: 'auto',
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  placeholder="Pesquisar…"
                                  value={shareListFilter}
                                  onChange={(e) => setShareListFilter(e.target.value)}
                                  className="mb-3 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/80 dark:focus:ring-red-400/80"
                                />
                                {shareCandidateUsers.length > 0 ? (
                                  <>
                                    <div className="mb-2">
                                      <ShareUserDropdownCheckbox
                                        id="drive-share-select-all"
                                        checked={shareSelectAllState.allChecked}
                                        indeterminate={shareSelectAllState.partial}
                                        onChange={(e) => setShareSelectAllInView(e.target.checked)}
                                      >
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 pt-0.5">
                                          Selecionar tudo
                                        </span>
                                      </ShareUserDropdownCheckbox>
                                    </div>
                                    <ul className="space-y-0.5">
                                      {shareCandidateUsers.map((u) => (
                                        <li key={u.id}>
                                          <ShareUserDropdownCheckbox
                                            compact
                                            checked={selectedShareUserIds.has(u.id)}
                                            onChange={() => toggleShareUserSelection(u.id)}
                                          >
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                                              {u.name}
                                            </span>
                                          </ShareUserDropdownCheckbox>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                ) : (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                                    {shareListFilter.trim()
                                      ? 'Nenhum usuário corresponde à pesquisa.'
                                      : 'Não há outras pessoas disponíveis.'}
                                  </p>
                                )}
                              </div>,
                              getDropdownPortalRoot(),
                            )}
                        </div>
                        <button
                          type="button"
                          disabled={selectedShareUserIds.size === 0 || addShareMut.isPending}
                          onClick={() => addShareMut.mutate()}
                          title={
                            selectedShareUserIds.size === 0
                              ? 'Selecione pelo menos uma pessoa'
                              : `Adicionar ${selectedShareUserIds.size} pessoa(s)`
                          }
                          aria-label="Adicionar pessoas selecionadas"
                          className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-lg border-2 border-red-600 dark:border-red-500 bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-40 disabled:border-gray-400 dark:disabled:border-gray-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:text-gray-500 dark:disabled:text-gray-400 transition-colors"
                        >
                          {addShareMut.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Plus className="h-6 w-6 stroke-[2.5]" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Quem tem acesso
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Para cada pessoa, escolha se pode só ver ou também editar e enviar arquivos.
                </p>
                {shareRows.length === 0 ? (
                  <p className="text-sm text-gray-500">Ninguém além de você (dono) por enquanto.</p>
                ) : (
                  <ul className="space-y-2">
                    {shareRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-600"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 min-w-0 flex-1">
                          {row.user.name}
                        </p>
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto sm:min-w-[16rem]">
                          <label className="sr-only" htmlFor={`share-perm-${row.id}`}>
                            Permissão de {row.user.name}
                          </label>
                          <StringSingleSelectDropdown
                            value={row.permission}
                            onChange={(perm) =>
                              updateShareMut.mutate({
                                uid: row.userId,
                                perm: perm as 'READ' | 'READ_WRITE',
                              })
                            }
                            options={SHARE_PERMISSION_OPTIONS}
                            disabled={updateShareMut.isPending}
                            allowEmpty={false}
                            className="w-full sm:w-auto min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Remover acesso desta pessoa?')) {
                                removeShareMut.mutate(row.userId);
                              }
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Modal>

        {showNewMenu && newMenuCoords ? newMenuPanel : null}

        <DriveUploadPanel
          items={uploadItems}
          minimized={uploadPanelMinimized}
          onToggleMinimized={() => setUploadPanelMinimized((v) => !v)}
          onClose={closeUploadPanel}
          onCancelAll={cancelAllUploads}
          onCancelItem={cancelUploadItem}
        />
      </div>
    </MainLayout>
  );
}

export default function DrivePage() {
  return (
    <Suspense fallback={<Loading message="Carregando Drive..." fullScreen size="lg" />}>
      <DrivePageContent />
    </Suspense>
  );
}

// ── Vista em grade ────────────────────────────────────────────────────────────

function GridView({
  folders,
  files,
  onOpenFolder,
  onDownload,
  onRename,
  onDelete,
  onOpenShare,
  onToggleStar,
  onRestore,
  trashMode,
  currentUserId,
}: {
  folders: DriveFolder[];
  files: DriveFile[];
  onOpenFolder: (id: string) => void;
  onDownload: (f: DriveFile) => void;
  onRename: (type: 'folder' | 'file', id: string, name: string) => void;
  onDelete: (type: 'folder' | 'file', id: string, name: string) => void;
  onOpenShare?: (folder: DriveFolder) => void;
  onToggleStar?: (type: 'folder' | 'file', id: string, starred: boolean) => void;
  onRestore?: (type: 'folder' | 'file', id: string) => void;
  trashMode?: boolean;
  currentUserId?: string;
}) {
  const canManage = (f: DriveFolder) =>
    f.canManageShares ?? (!!currentUserId && f.ownerId === currentUserId);
  const isOwnerFile = (f: DriveFile) => !!currentUserId && f.ownerId === currentUserId;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div
      className="space-y-6"
      onClick={() => setOpenMenuId(null)}
    >
      {folders.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Pastas
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {folders.map((folder) => {
              const shared = folder.isOwner === false;
              return (
                <div key={folder.id} className="relative min-w-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOpenMenuId(null);
                      if (!trashMode) onOpenFolder(folder.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenMenuId(null);
                        if (!trashMode) onOpenFolder(folder.id);
                      }
                    }}
                    className={`group flex w-full select-none items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-red-300 hover:bg-red-50/40 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-red-800 dark:hover:bg-red-950/20 ${
                      trashMode ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40">
                      {shared ? (
                        <Users className="h-4 w-4 text-red-500 dark:text-red-400" strokeWidth={1.75} />
                      ) : (
                        <Folder className="h-4 w-4 text-red-500 dark:text-red-400" strokeWidth={1.75} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {folder.name}
                    </span>
                    {folder.starred && !trashMode && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === folder.id ? null : folder.id);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                      aria-label={`Opções de ${folder.name}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                  {openMenuId === folder.id && (
                    <div className="absolute right-0 top-12 z-20 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {trashMode ? (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onRestore?.('folder', folder.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <RotateCcw className="h-4 w-4" /> Restaurar
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); onDelete('folder', folder.id, folder.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir permanentemente
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onOpenFolder(folder.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Folder className="h-4 w-4" /> Abrir
                          </button>
                          {canManage(folder) && onToggleStar && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onToggleStar('folder', folder.id, !folder.starred);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Star className={`h-4 w-4 ${folder.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                              {folder.starred ? 'Remover estrela' : 'Com estrela'}
                            </button>
                          )}
                          {canManage(folder) && onOpenShare && (
                            <button
                              onClick={() => { setOpenMenuId(null); onOpenShare(folder); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Users className="h-4 w-4" /> Acesso
                            </button>
                          )}
                          {canManage(folder) && (
                            <>
                              <button
                                onClick={() => { setOpenMenuId(null); onRename('folder', folder.id, folder.name); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                <Pencil className="h-4 w-4" /> Renomear
                              </button>
                              <button
                                onClick={() => { setOpenMenuId(null); onDelete('folder', folder.id, folder.name); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                              >
                                <Trash2 className="h-4 w-4" /> Excluir
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Arquivos
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {files.map((file) => {
              return (
                <div key={file.id} className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOpenMenuId(null);
                      if (!trashMode) onDownload(file);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenMenuId(null);
                        if (!trashMode) onDownload(file);
                      }
                    }}
                    className="group flex cursor-pointer select-none flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-colors hover:border-red-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:hover:border-red-800"
                  >
                    <div className="relative flex h-28 items-center justify-center border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40">
                      <DriveFileThumb
                        file={file}
                        className="absolute inset-0"
                        iconFallback={
                          <DriveMimeIcon
                            mimeType={file.mimeType}
                            fileName={file.name}
                            className="h-12 w-12"
                          />
                        }
                      />
                      {file.starred && !trashMode && (
                        <Star className="absolute left-2 top-2 h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <DriveMimeIcon
                        mimeType={file.mimeType}
                        fileName={file.name}
                        className="h-5 w-5"
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                        {file.name}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === file.id ? null : file.id);
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        aria-label={`Opções de ${file.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {openMenuId === file.id && (
                    <div className="absolute bottom-10 right-0 z-20 min-w-[170px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {trashMode ? (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onRestore?.('file', file.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <RotateCcw className="h-4 w-4" /> Restaurar
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); onDelete('file', file.id, file.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir permanentemente
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setOpenMenuId(null); onDownload(file); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Download className="h-4 w-4" /> Baixar
                          </button>
                          {isOwnerFile(file) && onToggleStar && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onToggleStar('file', file.id, !file.starred);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <Star className={`h-4 w-4 ${file.starred ? 'fill-amber-400 text-amber-500' : ''}`} />
                              {file.starred ? 'Remover estrela' : 'Com estrela'}
                            </button>
                          )}
                          <button
                            onClick={() => { setOpenMenuId(null); onRename('file', file.id, file.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-4 w-4" /> Renomear
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); onDelete('file', file.id, file.name); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
