import { APP_NAME } from './appBranding';
import { emailService } from '../services/EmailService';

type NotifyUser = { email?: string | null; name?: string | null };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uniqueEmails(users: NotifyUser[]): string[] {
  const set = new Set<string>();
  for (const u of users) {
    const email = String(u.email ?? '')
      .trim()
      .toLowerCase();
    if (email && email.includes('@')) set.add(email);
  }
  return [...set];
}

async function sendSafe(to: string, subject: string, html: string) {
  try {
    await emailService.sendEmail({ to, subject, html });
  } catch (err) {
    console.warn('[gestao-os] falha ao notificar', to, (err as Error)?.message);
  }
}

export type GestaoOsNotifyPayload = {
  displayNumber: number;
  osNumber?: number | null;
  statusLabel: string;
  locationLabel?: string | null;
  category?: string | null;
  priorityLabel?: string | null;
  dueAtLabel?: string | null;
  actorName?: string | null;
  note?: string | null;
};

function formatRef(p: GestaoOsNotifyPayload): string {
  if (p.osNumber != null) return `OS #${p.osNumber} (chamado #${p.displayNumber})`;
  return `Chamado #${p.displayNumber}`;
}

function buildHtml(title: string, p: GestaoOsNotifyPayload, extraLines: string[] = []): string {
  const rows = [
    `<strong>${escapeHtml(formatRef(p))}</strong>`,
    p.locationLabel ? `Local: ${escapeHtml(p.locationLabel)}` : '',
    p.category ? `Categoria: ${escapeHtml(p.category)}` : '',
    p.priorityLabel ? `Prioridade: ${escapeHtml(p.priorityLabel)}` : '',
    `Status: ${escapeHtml(p.statusLabel)}`,
    p.dueAtLabel ? `Prazo (SLA): ${escapeHtml(p.dueAtLabel)}` : '',
    p.actorName ? `Por: ${escapeHtml(p.actorName)}` : '',
    p.note ? `Obs.: ${escapeHtml(p.note)}` : '',
    ...extraLines.map(escapeHtml)
  ].filter(Boolean);

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <p>${escapeHtml(title)}</p>
      <ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>
      <p style="color:#666;font-size:12px">${escapeHtml(APP_NAME)} — Gestão de OS</p>
    </div>
  `;
}

/** Disparo em background — não bloqueia a API. */
export function notifyGestaoOsEvent(
  kind:
    | 'opened'
    | 'assigned'
    | 'status'
    | 'sla_warning'
    | 'sla_overdue'
    | 'parts'
    | 'unplanned'
    | 'sac_opened',
  payload: GestaoOsNotifyPayload,
  recipients: NotifyUser[]
): void {
  const emails = uniqueEmails(recipients);
  if (!emails.length) return;

  const titles: Record<typeof kind, string> = {
    opened: 'Novo chamado aberto',
    assigned: 'Chamado atribuído a você',
    status: 'Atualização de status do chamado',
    sla_warning: 'Atenção: prazo (SLA) perto de estourar',
    sla_overdue: 'Chamado atrasado (SLA estourado)',
    parts: 'Atualização de peças / aguardando material',
    unplanned: 'Ocorrência não planejada no campo',
    sac_opened: 'Novo registro no SAC da localidade'
  };

  const subject = `[${APP_NAME}] ${titles[kind]} — ${formatRef(payload)}`;
  const html = buildHtml(titles[kind], payload);

  void Promise.all(emails.map((to) => sendSafe(to, subject, html)));
}
