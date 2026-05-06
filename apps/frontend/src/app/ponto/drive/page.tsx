'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useCallback, useRef, useMemo, useEffect, Suspense } from 'react';
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
  ChevronRight,
  Home,
  X,
  AlertTriangle,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  Loader2,
  MoreVertical,
  Users,
  UserPlus,
  ListPlus,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
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

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.includes('pdf') || mimeType.includes('text')) return FileText;
  return File;
}

function getMimeColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'text-green-500 dark:text-green-400';
  if (mimeType.startsWith('video/')) return 'text-purple-500 dark:text-purple-400';
  if (mimeType.startsWith('audio/')) return 'text-yellow-500 dark:text-yellow-400';
  if (mimeType.includes('pdf')) return 'text-red-500 dark:text-red-400';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return 'text-emerald-500 dark:text-emerald-400';
  if (mimeType.includes('word') || mimeType.includes('document'))
    return 'text-blue-500 dark:text-blue-400';
  return 'text-gray-400 dark:text-gray-500';
}

function isImageMime(mimeType: string) {
  return mimeType.startsWith('image/');
}

/** Miniatura para `mimeType` image/*: URL assinada via `/preview`; fallback para o ícone em erro. */
function DriveFileImageThumb({
  file,
  className,
  iconFallback,
}: {
  file: DriveFile;
  className: string;
  iconFallback: React.ReactNode;
}) {
  const isImg = isImageMime(file.mimeType);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImg) return;
    let cancel = false;
    (async () => {
      try {
        const res = await api.get<{ success: boolean; data: { url: string } }>(
          `/drive/files/${file.id}/preview`
        );
        if (!cancel) {
          const u = res.data.data?.url;
          if (u) setUrl(u);
          else setFailed(true);
        }
      } catch {
        if (!cancel) setFailed(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [file.id, isImg]);

  if (!isImg || failed) return <>{iconFallback}</>;
  if (!url) {
    return <div className={`${className} bg-gray-200 dark:bg-gray-600 animate-pulse rounded-md`} aria-hidden />;
  }
  return (
    <img
      src={url}
      alt=""
      className={`${className} object-cover rounded-md bg-gray-100 dark:bg-gray-700`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Alternância grade / lista: pílula escura, ícone ativo com círculo + coral (estilo Google Drive). */
function DriveViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}) {
  const activeIcon = 'text-red-600 dark:text-red-400';
  const inactiveIcon = 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200';
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-md bg-gray-100 dark:bg-gray-700 p-0.5"
      role="group"
      aria-label="Exibição: grade ou lista"
    >
      <button
        type="button"
        onClick={() => onViewModeChange('grid')}
        title="Grade"
        className={`rounded p-1.5 transition-colors ${
          viewMode === 'grid'
            ? 'bg-white dark:bg-gray-600 shadow text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        <LayoutGrid
          className={`h-4 w-4 ${viewMode === 'grid' ? activeIcon : inactiveIcon}`}
        />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange('list')}
        title="Lista"
        className={`rounded p-1.5 transition-colors ${
          viewMode === 'list'
            ? 'bg-white dark:bg-gray-600 shadow text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        <List
          className={`h-4 w-4 ${viewMode === 'list' ? activeIcon : inactiveIcon}`}
        />
      </button>
    </div>
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

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
      if (id) {
        next.set('folder', id);
      } else {
        next.delete('folder');
      }
      const qs = next.toString();
      const base = pathname ?? '/ponto/drive';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
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
    enabled: !!user && !searchQuery,
    retry: 1,
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

  const folders = searchQuery ? (searchResults?.folders ?? []) : (contents?.folders ?? []);
  const files = searchQuery ? (searchResults?.files ?? []) : (contents?.files ?? []);
  const breadcrumb = contents?.breadcrumb ?? [];
  const currentFolderMeta = contents?.currentFolder ?? null;
  const isLoading = loadingContents || loadingSearch;
  const isEmpty = !isLoading && folders.length === 0 && files.length === 0;
  /** Raiz: sempre pode; dentro de pasta: `canWrite === false` = só leitura (não exibir upload/nova pasta). */
  const canWriteInCurrentFolder =
    !currentFolderId || currentFolderMeta?.canWrite !== false;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidateDrive = () => {
    queryClient.invalidateQueries({ queryKey: ['drive'] });
    queryClient.invalidateQueries({ queryKey: ['drive-search'] });
    queryClient.invalidateQueries({ queryKey: ['drive-shares'] });
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

  useEffect(() => {
    if (!showShareUserDropdown) return;
    const handle = (e: MouseEvent) => {
      if (
        shareUsersDropdownRef.current &&
        !shareUsersDropdownRef.current.contains(e.target as Node)
      ) {
        setShowShareUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showShareUserDropdown]);

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
      toast.success('Pasta excluída!');
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
      toast.success('Arquivo excluído!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao excluir arquivo');
    },
  });

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      const arr = Array.from(fileList);
      try {
        for (let i = 0; i < arr.length; i++) {
          const file = arr[i];
          setUploadProgress(`Enviando ${i + 1}/${arr.length}: ${file.name}`);
          const form = new FormData();
          form.append('file', file);
          if (currentFolderId) form.append('folderId', currentFolderId);
          // Não setar Content-Type: o browser adiciona o boundary correto
          await api.post('/drive/files', form);
        }
        toast.success(
          arr.length === 1 ? 'Arquivo enviado com sucesso!' : `${arr.length} arquivos enviados!`,
        );
        invalidateDrive();
      } catch (err: any) {
        const msg =
          err?.response?.data?.error || err?.message || 'Falha no upload';
        toast.error(msg);
      } finally {
        setUploadProgress(null);
      }
    },
    [currentFolderId],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (!canWriteInCurrentFolder) {
        toast.error('Não é possível enviar arquivos nesta pasta (somente leitura).');
        return;
      }
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
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

  const navigateBreadcrumb = (id?: string) => {
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
      >
        {/* Overlay drag-and-drop */}
        {isDraggingOver && canWriteInCurrentFolder && (
          <div className="fixed inset-0 z-50 bg-red-600/10 border-4 border-dashed border-red-500 flex items-center justify-center pointer-events-none">
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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <HardDrive className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meu Drive</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Armazenamento seguro na nuvem
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Busca */}
            <div className="relative flex-1 sm:flex-none sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Buscar arquivos e pastas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-w-0 pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:border-red-500 focus:ring-red-500 dark:focus:border-red-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {canWriteInCurrentFolder && (
              <>
                {/* Nova pasta */}
                <button
                  onClick={() => {
                    setNewFolderName('');
                    setShowNewFolder(true);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nova Pasta</span>
                </button>

                {/* Upload */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!!uploadProgress}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md shadow-sm transition-colors"
                >
                  {uploadProgress ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Upload</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Barra de progresso de upload */}
        {uploadProgress && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-4 py-3 flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-red-600 dark:text-red-400 animate-spin flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{uploadProgress}</p>
          </div>
        )}

        {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
        {!searchQuery && (
          <nav className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm overflow-x-auto pb-1">
            <button
              onClick={() => navigateBreadcrumb(undefined)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0 ${
                !currentFolderId
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              Meu Drive
            </button>
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <button
                  onClick={() => navigateBreadcrumb(crumb.id)}
                  className={`px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0 truncate max-w-[160px] ${
                    i === breadcrumb.length - 1
                      ? 'text-gray-900 dark:text-gray-100 font-medium'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
            {currentFolderId && currentFolderMeta?.canManageShares && (
              <button
                type="button"
                onClick={() => setShareFolder(currentFolderMeta as DriveFolder)}
                className="ml-0.5 inline-flex shrink-0 items-center justify-center p-1.5 rounded-md text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Gerenciar acesso a esta pasta"
                aria-label="Gerenciar acesso a esta pasta"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            )}
          </nav>
        )}

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
              <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <p className="text-gray-700 dark:text-gray-300 font-medium">
                Erro ao carregar o Drive
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Verifique se o servidor está rodando e tente novamente.
              </p>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['drive'] })}
                className="mt-4 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Tentar novamente
              </button>
            </CardContent>
          </Card>
        ) : isEmpty ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="inline-flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                <HardDrive className="h-10 w-10 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {searchQuery ? 'Nenhum resultado encontrado' : 'Pasta vazia'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {searchQuery
                  ? 'Tente uma busca diferente'
                  : canWriteInCurrentFolder
                    ? 'Faça upload de arquivos ou crie uma nova pasta'
                    : 'Esta pasta foi compartilhada com acesso somente leitura.'}
              </p>
              {!searchQuery && canWriteInCurrentFolder && (
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Upload de arquivo
                  </button>
                  <button
                    onClick={() => {
                      setNewFolderName('');
                      setShowNewFolder(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <FolderPlus className="h-4 w-4" />
                    Nova pasta
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <GridView
            folders={folders}
            files={files}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenFolder={openFolder}
            onDownload={downloadFile}
            onRename={openRename}
            onDelete={(type, id, name) => setDeleteTarget({ type, id, name })}
            onOpenShare={setShareFolder}
            currentUserId={user?.id}
          />
        ) : (
          <ListView
            folders={folders}
            files={files}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenFolder={openFolder}
            onDownload={downloadFile}
            onRename={openRename}
            onDelete={(type, id, name) => setDeleteTarget({ type, id, name })}
            onOpenShare={setShareFolder}
            currentUserId={user?.id}
          />
        )}

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
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
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
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
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

        {/* Excluir */}
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Confirmar exclusão"
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Tem certeza que deseja excluir{' '}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    &ldquo;{deleteTarget?.name}&rdquo;
                  </span>
                  ?
                </p>
                {deleteTarget?.type === 'folder' && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Todo o conteúdo da pasta será excluído permanentemente.
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
                disabled={deleteFolderMut.isPending || deleteFileMut.isPending}
                onClick={submitDelete}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
              >
                {(deleteFolderMut.isPending || deleteFileMut.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Excluir
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
                          className={`relative flex-1 min-w-0 ${showShareUserDropdown ? 'z-[201]' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowShareUserDropdown((v) => !v);
                            }}
                            className="w-full min-h-[3rem] h-12 pl-12 pr-12 text-left rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-base text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
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
                      {showShareUserDropdown && (
                        <div
                          className="absolute left-0 right-0 top-full z-[202] mt-1.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-3 max-h-[min(28rem,75vh)] overflow-y-auto"
                          onClick={(e) => e.stopPropagation()}
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
                        </div>
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
                          <select
                            id={`share-perm-${row.id}`}
                            value={row.permission}
                            onChange={(e) =>
                              updateShareMut.mutate({
                                uid: row.userId,
                                perm: e.target.value as 'READ' | 'READ_WRITE',
                              })
                            }
                            disabled={updateShareMut.isPending}
                            className="w-full sm:w-auto min-w-0 text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 bg-white dark:text-gray-100 dark:bg-gray-700"
                          >
                            <option value="READ">Leitura (ver e baixar)</option>
                            <option value="READ_WRITE">Edição (enviar e criar subpastas)</option>
                          </select>
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
  viewMode,
  onViewModeChange,
  onOpenFolder,
  onDownload,
  onRename,
  onDelete,
  onOpenShare,
  currentUserId,
}: {
  folders: DriveFolder[];
  files: DriveFile[];
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onOpenFolder: (id: string) => void;
  onDownload: (f: DriveFile) => void;
  onRename: (type: 'folder' | 'file', id: string, name: string) => void;
  onDelete: (type: 'folder' | 'file', id: string, name: string) => void;
  onOpenShare?: (folder: DriveFolder) => void;
  currentUserId?: string;
}) {
  const canManage = (f: DriveFolder) =>
    f.canManageShares ?? (!!currentUserId && f.ownerId === currentUserId);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div
      className="space-y-6"
      onClick={() => setOpenMenuId(null)}
    >
      {folders.length > 0 && (
        <div>
          <div className="mb-3 flex min-h-[1.5rem] items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pastas
            </h2>
            {files.length === 0 && (
              <DriveViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {folders.map((folder) => (
              <div key={folder.id} className="relative">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOpenMenuId(null);
                    onOpenFolder(folder.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenMenuId(null);
                      onOpenFolder(folder.id);
                    }
                  }}
                  className="group flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 hover:shadow-md cursor-pointer transition-all select-none"
                >
                  <Folder className="h-12 w-12 text-red-400 dark:text-red-500 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors" />
                  <span className="text-xs font-medium text-center text-gray-700 dark:text-gray-200 line-clamp-2 break-all w-full">
                    {folder.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === folder.id ? null : folder.id);
                    }}
                    className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-opacity"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </div>
                {openMenuId === folder.id && (
                  <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]">
                    <button
                      onClick={() => { setOpenMenuId(null); onOpenFolder(folder.id); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Folder className="h-4 w-4" /> Abrir
                    </button>
                    {canManage(folder) && onOpenShare && (
                      <button
                        onClick={() => { setOpenMenuId(null); onOpenShare(folder); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Users className="h-4 w-4" /> Acesso
                      </button>
                    )}
                    {canManage(folder) && (
                      <>
                        <button
                          onClick={() => { setOpenMenuId(null); onRename('folder', folder.id, folder.name); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <Pencil className="h-4 w-4" /> Renomear
                        </button>
                        <button
                          onClick={() => { setOpenMenuId(null); onDelete('folder', folder.id, folder.name); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" /> Excluir
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <div className="mb-3 flex min-h-[1.5rem] items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Arquivos
            </h2>
            <DriveViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {files.map((file) => {
              const Icon = getMimeIcon(file.mimeType);
              const color = getMimeColor(file.mimeType);
              return (
                <div key={file.id} className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOpenMenuId(null);
                      onDownload(file);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenMenuId(null);
                        onDownload(file);
                      }
                    }}
                    className="group flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 hover:shadow-md cursor-pointer transition-all select-none"
                  >
                    <DriveFileImageThumb
                      file={file}
                      className="h-12 w-12"
                      iconFallback={<Icon className={`h-12 w-12 ${color}`} />}
                    />
                    <span className="text-xs font-medium text-center text-gray-700 dark:text-gray-200 line-clamp-2 break-all w-full">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === file.id ? null : file.id);
                      }}
                      className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-opacity"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {openMenuId === file.id && (
                    <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[150px]">
                      <button
                        onClick={() => { setOpenMenuId(null); onDownload(file); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Download className="h-4 w-4" /> Baixar
                      </button>
                      <button
                        onClick={() => { setOpenMenuId(null); onRename('file', file.id, file.name); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Pencil className="h-4 w-4" /> Renomear
                      </button>
                      <button
                        onClick={() => { setOpenMenuId(null); onDelete('file', file.id, file.name); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </button>
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

// ── Vista em lista ────────────────────────────────────────────────────────────

function ListView({
  folders,
  files,
  viewMode,
  onViewModeChange,
  onOpenFolder,
  onDownload,
  onRename,
  onDelete,
  onOpenShare,
  currentUserId,
}: {
  folders: DriveFolder[];
  files: DriveFile[];
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onOpenFolder: (id: string) => void;
  onDownload: (f: DriveFile) => void;
  onRename: (type: 'folder' | 'file', id: string, name: string) => void;
  onDelete: (type: 'folder' | 'file', id: string, name: string) => void;
  onOpenShare?: (folder: DriveFolder) => void;
  currentUserId?: string;
}) {
  const canManage = (f: DriveFolder) =>
    f.canManageShares ?? (!!currentUserId && f.ownerId === currentUserId);

  return (
    <div>
      <div className="mb-3 flex min-h-[1.5rem] items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Itens
        </h2>
        <DriveViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
      <Card padding="none">
      {/* Cabeçalho da tabela */}
      <div className="grid grid-cols-[auto,1fr,100px,120px,96px] gap-4 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        <div />
        <div>Nome</div>
        <div className="text-right">Tamanho</div>
        <div>Modificado</div>
        <div />
      </div>

      {/* Pastas */}
      {folders.map((folder) => (
        <div
          key={folder.id}
          onClick={() => onOpenFolder(folder.id)}
          className="group grid grid-cols-[auto,1fr,100px,120px,96px] gap-4 items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-0"
        >
          <Folder className="h-5 w-5 text-red-400 dark:text-red-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate block">
              {folder.name}
            </span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 text-right">—</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(folder.updatedAt)}</span>
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenFolder(folder.id); }}
              title="Abrir"
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400"
            >
              <Folder className="h-3.5 w-3.5" />
            </button>
            {canManage(folder) && onOpenShare && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenShare(folder); }}
                title="Quem tem acesso"
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-red-600 dark:text-red-400"
              >
                <Users className="h-3.5 w-3.5" />
              </button>
            )}
            {canManage(folder) && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRename('folder', folder.id, folder.name); }}
                  title="Renomear"
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete('folder', folder.id, folder.name); }}
                  title="Excluir"
                  className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Arquivos */}
      {files.map((file) => {
        const Icon = getMimeIcon(file.mimeType);
        const color = getMimeColor(file.mimeType);
        return (
          <div
            key={file.id}
            onClick={() => onDownload(file)}
            className="group grid grid-cols-[auto,1fr,100px,120px,96px] gap-4 items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-0"
          >
            <DriveFileImageThumb
              file={file}
              className="h-5 w-5"
              iconFallback={<Icon className={`h-5 w-5 ${color} shrink-0`} />}
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {file.name}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 text-right">
              {formatBytes(file.size)}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(file.updatedAt)}</span>
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(file); }}
                title="Baixar"
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRename('file', file.id, file.name); }}
                title="Renomear"
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete('file', file.id, file.name); }}
                title="Excluir"
                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </Card>
    </div>
  );
}
