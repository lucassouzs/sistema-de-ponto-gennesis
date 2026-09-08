'use client';

import React, { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Briefcase,
  Calendar,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { JuridicoFileCard } from '@/components/juridico/JuridicoFileCard';
import { JuridicoProcessoEditModal } from '@/components/juridico/JuridicoProcessoEditModal';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import api from '@/lib/api';
import { resolveContratoNome } from '@/data/juridico-contratos';
import {
  cellText,
  formatCurrencyBRL,
  formatProcessoStatus,
  statusBadgeClass,
  type JuridicoProcesso,
} from '@/data/juridico-processos-ativos';

type FileKind = 'anexos' | 'comprovantes';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cadastroListClasses.cardHeaderRow}>
      <div className={cadastroListClasses.cardHeaderIconRow}>
        <div className="shrink-0 rounded-lg bg-red-50 p-2 sm:p-3 dark:bg-red-950/30">
          <Icon
            className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400"
            aria-hidden
          />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
            {title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
      </div>
      {actions ? <div className={cadastroListClasses.cardToolbar}>{actions}</div> : null}
    </div>
  );
}

const addBtnCls =
  'inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';

export default function ProcessoAtivoDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [showEdit, setShowEdit] = useState(false);
  const [uploading, setUploading] = useState<FileKind | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const anexosInputRef = useRef<HTMLInputElement>(null);
  const comprovantesInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['juridico-processos', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get(`/juridico-processos/${id}`);
      return res.data?.data as JuridicoProcesso;
    },
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const processo = data;
  const status = processo?.status || processo?.statusProcesso || '';
  const numeroProcesso = processo?.numeroProcesso?.trim() || '';

  useBreadcrumbEntity(
    numeroProcesso && id
      ? { label: numeroProcesso, href: `/ponto/juridico/processos-ativos/${id}` }
      : null,
  );

  const handleUpload = async (kind: FileKind, fileList: FileList | null) => {
    if (!id || !fileList?.length) return;
    const files = Array.from(fileList);
    setUploading(kind);
    try {
      const fd = new FormData();
      for (const file of files) fd.append('files', file);
      const res = await api.post(`/juridico-processos/${id}/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data?.message || 'Arquivo(s) adicionado(s).');
      await refetch();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Não foi possível enviar o(s) arquivo(s).';
      toast.error(message);
    } finally {
      setUploading(null);
      if (kind === 'anexos' && anexosInputRef.current) anexosInputRef.current.value = '';
      if (kind === 'comprovantes' && comprovantesInputRef.current) {
        comprovantesInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (kind: FileKind, fileId: string, fileName: string) => {
    if (!id) return;
    const label = kind === 'anexos' ? 'anexo' : 'comprovante';
    if (!window.confirm(`Remover o ${label} "${fileName}"?`)) return;

    setRemovingId(fileId);
    try {
      const res = await api.delete(`/juridico-processos/${id}/${kind}/${fileId}`);
      toast.success(res.data?.message || 'Arquivo removido.');
      await refetch();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Não foi possível remover o arquivo.';
      toast.error(message);
    } finally {
      setRemovingId(null);
    }
  };

  if (loadingUser || isLoading) {
    return <Loading message="Carregando processo..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/juridico/processos-ativos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          {isError || !processo ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-gray-600 dark:text-gray-300">
                {(error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message || 'Processo não encontrado.'}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {processo.reclamante}
                  </h1>
                  <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
                    {processo.numeroProcesso}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  aria-label="Editar processo"
                  title="Editar"
                  className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  <Pencil className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card className={`lg:col-span-2 ${cadastroListClasses.card}`}>
                  <CardHeader className={cadastroListClasses.cardHeader}>
                    <SectionHeader
                      icon={Briefcase}
                      title="Dados do processo"
                      subtitle="Informações cadastrais e andamento processual"
                    />
                  </CardHeader>
                  <CardContent className={cadastroListClasses.cardContent}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <Field
                        label="Status"
                        value={
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}
                          >
                            {formatProcessoStatus(processo.status, processo.statusProcesso)}
                          </span>
                        }
                      />
                      <Field label="Acordo" value={cellText(processo.acordo)} />
                      <Field label="Tribunal" value={cellText(processo.tribunal)} />
                      <Field label="Vara" value={cellText(processo.vara)} />
                      <Field label="Polo" value={cellText(processo.polo)} />
                      <Field label="Empresa" value={cellText(processo.empresa)} />
                      <Field
                        label="Contrato"
                        value={cellText(resolveContratoNome(processo.contrato))}
                      />
                      <Field label="Função" value={cellText(processo.funcao)} />
                      <Field label="Regime" value={cellText(processo.regimeContratacao)} />
                      <Field label="Presencial" value={cellText(processo.presencial)} />
                      <Field
                        label="Status processo"
                        value={formatProcessoStatus(processo.statusProcesso)}
                      />
                      <Field label="Decisão do STF" value={cellText(processo.decisaoStf)} />
                      <Field
                        label="Representante do autor"
                        value={cellText(processo.representanteAutor)}
                      />
                      <Field
                        label="Agravo de instrumento"
                        value={cellText(processo.agravoInstrumento)}
                      />
                      <Field label="Período" value={cellText(processo.periodo)} />
                      <Field label="Início trabalhado" value={cellText(processo.periodoInicio)} />
                      <Field label="Fim trabalhado" value={cellText(processo.periodoFim)} />
                      <div className="sm:col-span-2 xl:col-span-3">
                        <Field label="Objeto" value={cellText(processo.objeto)} />
                      </div>
                      {processo.objeto2 ? (
                        <div className="sm:col-span-2 xl:col-span-3">
                          <Field label="Objetos vinculados" value={cellText(processo.objeto2)} />
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card className={cadastroListClasses.card}>
                  <CardHeader className={cadastroListClasses.cardHeader}>
                    <SectionHeader
                      icon={Calendar}
                      title="Datas e valores"
                      subtitle="Prazos, acordos e valores do processo"
                    />
                  </CardHeader>
                  <CardContent className={cadastroListClasses.cardContent}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                      <Field label="Data da abertura" value={cellText(processo.dataAbertura)} />
                      <Field label="Data da audiência" value={cellText(processo.dataAudiencia)} />
                      <Field label="Horário" value={cellText(processo.horario)} />
                      <Field label="Data do acordo" value={cellText(processo.dataAcordo)} />
                      <Field
                        label="Valor da causa"
                        value={formatCurrencyBRL(processo.valorCausa)}
                      />
                      <Field
                        label="Valor do acordo"
                        value={formatCurrencyBRL(processo.valorAcordo)}
                      />
                      <Field label="Valor pago" value={formatCurrencyBRL(processo.valorPago)} />
                      <Field
                        label="Valor sentença"
                        value={formatCurrencyBRL(processo.valorSentenca)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <SectionHeader
                    icon={Paperclip}
                    title={`Anexos / atas (${processo.anexos?.length || 0})`}
                    subtitle="Documentos e atas vinculados ao processo"
                    actions={
                      <>
                        <button
                          type="button"
                          className={addBtnCls}
                          disabled={!!uploading}
                          onClick={() => anexosInputRef.current?.click()}
                        >
                          {uploading === 'anexos' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Adicionar
                        </button>
                        <input
                          ref={anexosInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.zip,image/*,application/pdf"
                          onChange={(e) => void handleUpload('anexos', e.target.files)}
                        />
                      </>
                    }
                  />
                </CardHeader>
                <CardContent className={cadastroListClasses.cardContent}>
                  {!processo.anexos?.length ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum anexo vinculado a este processo.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {processo.anexos.map((file) => (
                        <JuridicoFileCard
                          key={file.id}
                          file={file}
                          removing={removingId === file.id}
                          onRemove={() =>
                            void handleRemove('anexos', file.id, file.originalName)
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <SectionHeader
                    icon={Receipt}
                    title={`Comprovantes de pagamento (${processo.comprovantes?.length || 0})`}
                    subtitle="Comprovantes financeiros vinculados ao processo"
                    actions={
                      <>
                        <button
                          type="button"
                          className={addBtnCls}
                          disabled={!!uploading}
                          onClick={() => comprovantesInputRef.current?.click()}
                        >
                          {uploading === 'comprovantes' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Adicionar
                        </button>
                        <input
                          ref={comprovantesInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.zip,image/*,application/pdf"
                          onChange={(e) => void handleUpload('comprovantes', e.target.files)}
                        />
                      </>
                    }
                  />
                </CardHeader>
                <CardContent className={cadastroListClasses.cardContent}>
                  {!processo.comprovantes?.length ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum comprovante vinculado a este processo.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {processo.comprovantes.map((file) => (
                        <JuridicoFileCard
                          key={file.id}
                          file={file}
                          extra={
                            file.dataPagamento ? `Pago em ${file.dataPagamento}` : undefined
                          }
                          removing={removingId === file.id}
                          onRemove={() =>
                            void handleRemove('comprovantes', file.id, file.originalName)
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <JuridicoProcessoEditModal
          isOpen={showEdit}
          processoId={id || null}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            void refetch();
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
