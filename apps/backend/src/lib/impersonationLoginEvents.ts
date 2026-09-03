/** Metadados de impersonação gravados em UserLoginEvent.source (JSON). */
export type ImpersonationLoginSource = {
  channel: 'web' | 'mobile';
  targetUserId?: string;
  targetName?: string;
  adminUserId?: string;
  adminName?: string;
};

export function encodeImpersonationSource(meta: ImpersonationLoginSource): string {
  return JSON.stringify(meta);
}

export function parseLoginEventSource(source?: string | null): {
  channel: string;
  targetUserId?: string;
  targetName?: string;
  adminUserId?: string;
  adminName?: string;
} {
  const raw = String(source || '').trim();
  if (!raw) return { channel: '—' };
  if (raw === 'web' || raw === 'mobile') return { channel: raw };
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as ImpersonationLoginSource;
      const channel = parsed.channel === 'mobile' ? 'mobile' : parsed.channel === 'web' ? 'web' : raw;
      return {
        channel,
        targetUserId: parsed.targetUserId ? String(parsed.targetUserId) : undefined,
        targetName: parsed.targetName ? String(parsed.targetName).trim() : undefined,
        adminUserId: parsed.adminUserId ? String(parsed.adminUserId) : undefined,
        adminName: parsed.adminName ? String(parsed.adminName).trim() : undefined,
      };
    } catch {
      return { channel: raw };
    }
  }
  return { channel: raw };
}

export function loginEventTypeLabel(
  type?: string | null,
  source?: string | null
): string {
  const t = String(type || 'login').toLowerCase();
  const meta = parseLoginEventSource(source);
  if (t === 'logout') return 'Saída';
  if (t === 'impersonate') {
    return meta.targetName ? `Entrou como ${meta.targetName}` : 'Entrou como outro usuário';
  }
  if (t === 'stop_impersonate') {
    return 'Encerrou impersonação';
  }
  if (t === 'impersonated_by') {
    return meta.adminName
      ? `${meta.adminName} entrou nesta conta`
      : 'Administrador entrou nesta conta';
  }
  return 'Login';
}

export function loginEventSourceChannelLabel(source?: string | null): string {
  const channel = parseLoginEventSource(source).channel;
  if (channel === 'mobile') return 'App mobile';
  if (channel === 'web') return 'Web';
  return channel || '—';
}
