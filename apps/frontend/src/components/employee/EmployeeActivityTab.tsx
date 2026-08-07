'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock,
  Filter,
  Globe,
  History,
  Loader2,
  LogIn,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  CadastroListEmpty,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';

type LoginEvent = {
  id: string;
  success: boolean;
  source?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

type PageVisit = {
  id: string;
  path: string;
  label?: string | null;
  createdAt: string;
};

type ActivityResponse = {
  summary: {
    lastLoginAt?: string | null;
    lastSeenAt?: string | null;
    lastActivityPath?: string | null;
    lastActivityLabel?: string | null;
    totalLogins: number;
    totalPageVisits: number;
  };
  logins: {
    items: LoginEvent[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
  pageVisits: {
    items: PageVisit[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
};

function toYmd(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function defaultPeriod() {
  const today = toYmd(new Date());
  return { from: today, to: today };
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
}

function formatDateOnly(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

function formatTimeOnly(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'HH:mm:ss');
}

function formatRelativeHint(value?: string | null): string {
  if (!value) return 'Nunca registrado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca registrado';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Agora há pouco';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Há ${days} dia${days === 1 ? '' : 's'}`;
  return formatDateTime(value);
}

function sourceLabel(source?: string | null): string {
  if (source === 'mobile') return 'App mobile';
  if (source === 'web') return 'Web';
  return source || '—';
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className={cadastroListClasses.cardHeaderIconRow}>
      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
        <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
          {title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function formatPeriodLabel(from: string, to: string): string {
  const fmt = (ymd: string) => {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return format(new Date(y, m - 1, d), 'dd/MM/yyyy');
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `Desde ${fmt(from)}`;
  if (to) return `Até ${fmt(to)}`;
  return 'Todo o período';
}

function PeriodFilterButton({
  from,
  to,
  onFromChange,
  onToChange,
  onReset,
  title = 'Filtrar período',
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onReset: () => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const defaultRange = defaultPeriod();
  const isCustomPeriod = from !== defaultRange.from || to !== defaultRange.to;
  const periodLabel = formatPeriodLabel(from, to);

  return (
    <div className={cadastroListClasses.cardToolbar}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          isCustomPeriod
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
        aria-label={title}
        title={isCustomPeriod ? `${title}: ${periodLabel}` : title}
      >
        <Filter className="h-4 w-4" />
        {isCustomPeriod ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
        ) : null}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        size="md"
        contentOverflowVisible
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Escolha o intervalo de datas para filtrar o histórico.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                De
              </label>
              <DatePickerField
                value={from}
                onChange={onFromChange}
                placeholder="dd/mm/aaaa"
                aria-label="Data inicial"
                noFocusRing
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Até
              </label>
              <DatePickerField
                value={to}
                onChange={onToChange}
                placeholder="dd/mm/aaaa"
                aria-label="Data final"
                noFocusRing
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onReset();
              }}
            >
              Limpar
            </Button>
            <Button type="button" variant="error" onClick={() => setOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function EmployeeActivityTab({ userId }: { userId: string }) {
  const initialPeriod = useMemo(() => defaultPeriod(), []);
  const [loginsPage, setLoginsPage] = useState(1);
  const [visitsPage, setVisitsPage] = useState(1);
  const [loginsFrom, setLoginsFrom] = useState(initialPeriod.from);
  const [loginsTo, setLoginsTo] = useState(initialPeriod.to);
  const [visitsFrom, setVisitsFrom] = useState(initialPeriod.from);
  const [visitsTo, setVisitsTo] = useState(initialPeriod.to);
  const loginsLimit = 20;
  const visitsLimit = 20;

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: [
      'user-activity',
      userId,
      loginsPage,
      visitsPage,
      loginsFrom,
      loginsTo,
      visitsFrom,
      visitsTo,
    ],
    queryFn: async () => {
      const res = await api.get(`/users/${userId}/activity`, {
        params: {
          loginsPage,
          visitsPage,
          loginsLimit,
          visitsLimit,
          loginsFrom: loginsFrom || undefined,
          loginsTo: loginsTo || undefined,
          visitsFrom: visitsFrom || undefined,
          visitsTo: visitsTo || undefined,
        },
      });
      return res.data?.data as ActivityResponse;
    },
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        Não foi possível carregar o histórico de acesso.
      </div>
    );
  }

  const { summary, logins, pageVisits } = data;
  const loginsRange = getCadastroListRange(
    logins.pagination.page,
    logins.pagination.limit,
    logins.pagination.total
  );
  const visitsRange = getCadastroListRange(
    pageVisits.pagination.page,
    pageVisits.pagination.limit,
    pageVisits.pagination.total
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <LogIn className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                  Último login
                </p>
                <p className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
                  {formatRelativeHint(summary.lastLoginAt)}
                </p>
                {summary.lastLoginAt ? (
                  <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {formatDateTime(summary.lastLoginAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                  Último acesso
                </p>
                <p className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
                  {formatRelativeHint(summary.lastSeenAt)}
                </p>
                {summary.lastSeenAt ? (
                  <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {formatDateTime(summary.lastSeenAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <Globe className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                  Última página
                </p>
                <p className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
                  {summary.lastActivityLabel || '—'}
                </p>
                {summary.lastActivityPath ? (
                  <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {summary.lastActivityPath}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <History className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                  Totais
                </p>
                <p className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
                  {summary.totalLogins} login{summary.totalLogins === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {summary.totalPageVisits} página
                  {summary.totalPageVisits === 1 ? '' : 's'} visitada
                  {summary.totalPageVisits === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <SectionHeader
                icon={History}
                title="Histórico de logins"
                subtitle="Logins no período selecionado"
              />
              <PeriodFilterButton
                from={loginsFrom}
                to={loginsTo}
                title="Filtrar período"
                onFromChange={(value) => {
                  setLoginsFrom(value);
                  setLoginsPage(1);
                }}
                onToChange={(value) => {
                  setLoginsTo(value);
                  setLoginsPage(1);
                }}
                onReset={() => {
                  const period = defaultPeriod();
                  setLoginsFrom(period.from);
                  setLoginsTo(period.to);
                  setLoginsPage(1);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {logins.items.length === 0 ? (
              <CadastroListEmpty
                icon={LogIn}
                title="Nenhum login no período"
                hint="Ajuste o filtro de datas ou aguarde o próximo login"
              />
            ) : (
              <>
                <CadastroListSummary
                  startItem={loginsRange.startItem}
                  endItem={loginsRange.endItem}
                  total={logins.pagination.total}
                  itemLabel="login"
                  itemLabelPlural="logins"
                  currentPage={logins.pagination.page}
                  totalPages={logins.pagination.totalPages}
                />
                <div className="w-full max-w-full overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className={cadastroListClasses.th}>Data</th>
                        <th className={cadastroListClasses.thCenter}>Hora</th>
                        <th className={cadastroListClasses.thCenter}>Origem</th>
                        <th className={cadastroListClasses.thCenter}>IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {logins.items.map((login) => (
                        <tr key={login.id}>
                          <td className={`${cadastroListClasses.td} whitespace-nowrap`}>
                            {formatDateOnly(login.createdAt)}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} whitespace-nowrap`}>
                            {formatTimeOnly(login.createdAt)}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {sourceLabel(login.source)}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} whitespace-nowrap`}>
                            {login.ipAddress || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  currentPage={logins.pagination.page}
                  totalPages={logins.pagination.totalPages}
                  onPageChange={setLoginsPage}
                  className={`${cadastroListClasses.pagination}${isFetching ? ' opacity-70' : ''}`}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <SectionHeader
                icon={Globe}
                title="Páginas visitadas"
                subtitle="Navegação no período selecionado"
              />
              <PeriodFilterButton
                from={visitsFrom}
                to={visitsTo}
                title="Filtrar período"
                onFromChange={(value) => {
                  setVisitsFrom(value);
                  setVisitsPage(1);
                }}
                onToChange={(value) => {
                  setVisitsTo(value);
                  setVisitsPage(1);
                }}
                onReset={() => {
                  const period = defaultPeriod();
                  setVisitsFrom(period.from);
                  setVisitsTo(period.to);
                  setVisitsPage(1);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {pageVisits.items.length === 0 ? (
              <CadastroListEmpty
                icon={Globe}
                title="Nenhuma página no período"
                hint="Ajuste o filtro de datas ou navegue no sistema"
              />
            ) : (
              <>
                <CadastroListSummary
                  startItem={visitsRange.startItem}
                  endItem={visitsRange.endItem}
                  total={pageVisits.pagination.total}
                  itemLabel="página"
                  itemLabelPlural="páginas"
                  currentPage={pageVisits.pagination.page}
                  totalPages={pageVisits.pagination.totalPages}
                />
                <div className="w-full max-w-full overflow-x-auto">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-[46%]" />
                      <col className="w-[27%]" />
                      <col className="w-[27%]" />
                    </colgroup>
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className={cadastroListClasses.th}>Página</th>
                        <th className={cadastroListClasses.thCenter}>Data</th>
                        <th className={cadastroListClasses.thCenter}>Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {pageVisits.items.map((visit) => (
                        <tr key={visit.id}>
                          <td className={`${cadastroListClasses.td} max-w-0`}>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {visit.label || visit.path}
                              </p>
                              {visit.label ? (
                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                  {visit.path}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} whitespace-nowrap`}>
                            {formatDateOnly(visit.createdAt)}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} whitespace-nowrap`}>
                            {formatTimeOnly(visit.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  currentPage={pageVisits.pagination.page}
                  totalPages={pageVisits.pagination.totalPages}
                  onPageChange={setVisitsPage}
                  className={`${cadastroListClasses.pagination}${isFetching ? ' opacity-70' : ''}`}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
