import { prisma } from '../lib/prisma';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function googleEventsUrl(calendarId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  );
}

export function getGoogleCalendarRedirectUri(): string {
  const explicit = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const apiBase =
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.BACKEND_PUBLIC_URL?.trim() ||
    `http://localhost:${process.env.PORT || 5000}`;
  return `${apiBase.replace(/\/$/, '')}/api/planner-events/google/callback`;
}

export function getFrontendOrigin(): string {
  return (
    process.env.FRONTEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'
  );
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim(),
    redirect_uri: getGoogleCalendarRedirectUri(),
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao autenticar no Google');
  }
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao renovar token do Google');
  }
  return data;
}

export async function saveGoogleTokens(
  userId: string,
  tokens: TokenResponse,
  previousRefreshToken?: string | null
) {
  const refreshToken = tokens.refresh_token || previousRefreshToken;
  if (!refreshToken) {
    throw new Error('Google não retornou refresh_token. Revogue o acesso e conecte novamente.');
  }
  const expiryDate =
    typeof tokens.expires_in === 'number'
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

  await prisma.googleCalendarConnection.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: tokens.access_token,
      refreshToken,
      expiryDate,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken,
      expiryDate,
    },
  });
}

export async function handleGoogleOAuthCallback(userId: string, code: string) {
  const existing = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  const tokens = await exchangeCodeForTokens(code);
  await saveGoogleTokens(userId, tokens, existing?.refreshToken);
}

async function getValidAccessToken(userId: string): Promise<string> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!conn) throw new Error('Google Calendar não conectado');

  const needsRefresh =
    !conn.expiryDate || conn.expiryDate.getTime() < Date.now() + 60_000;

  if (!needsRefresh) return conn.accessToken;

  const tokens = await refreshAccessToken(conn.refreshToken);
  await saveGoogleTokens(userId, tokens, conn.refreshToken);
  return tokens.access_token;
}

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  colorId?: string;
};

type GoogleColorMaps = {
  event: Record<string, string>;
  calendar: Record<string, string>;
};

/** Fallback oficial das cores de evento do Google (caso a API /colors falhe). */
const GOOGLE_EVENT_COLOR_FALLBACK: Record<string, string> = {
  '1': '#A4BDFC',
  '2': '#7AE7BF',
  '3': '#DBADFF',
  '4': '#FF887C',
  '5': '#FBD75B',
  '6': '#FFB878',
  '7': '#46D6DB',
  '8': '#E1E1E1',
  '9': '#5484ED',
  '10': '#51B749',
  '11': '#DC2127',
};

function normalizeHexColor(value: string | undefined | null, fallback = '#4285F4'): string {
  const raw = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return fallback;
}

async function fetchGoogleColorMaps(accessToken: string): Promise<GoogleColorMaps> {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/colors', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as {
      event?: Record<string, { background?: string; foreground?: string }>;
      calendar?: Record<string, { background?: string; foreground?: string }>;
    };
    if (!res.ok) {
      return { event: { ...GOOGLE_EVENT_COLOR_FALLBACK }, calendar: {} };
    }
    const event: Record<string, string> = { ...GOOGLE_EVENT_COLOR_FALLBACK };
    for (const [id, meta] of Object.entries(data.event || {})) {
      if (meta?.background) event[id] = normalizeHexColor(meta.background);
    }
    const calendar: Record<string, string> = {};
    for (const [id, meta] of Object.entries(data.calendar || {})) {
      if (meta?.background) calendar[id] = normalizeHexColor(meta.background);
    }
    return { event, calendar };
  } catch {
    return { event: { ...GOOGLE_EVENT_COLOR_FALLBACK }, calendar: {} };
  }
}

function resolveGoogleEventColor(
  item: GoogleEvent,
  calendar: GoogleCalendarListEntry,
  colors: GoogleColorMaps
): string {
  // 1) Cor específica do evento no Google
  if (item.colorId && colors.event[item.colorId]) {
    return colors.event[item.colorId];
  }
  // 2) Cor de fundo da agenda (como aparece no Google)
  if (calendar.backgroundColor) {
    return normalizeHexColor(calendar.backgroundColor);
  }
  // 3) colorId da agenda
  if (calendar.colorId && colors.calendar[calendar.colorId]) {
    return colors.calendar[calendar.colorId];
  }
  return '#4285F4';
}

function parseLocalDateOnly(dateStr: string): Date {
  const parts = dateStr.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date(dateStr);
  }
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function parseGoogleEventTimes(ev: GoogleEvent): { startAt: Date; endAt: Date; allDay: boolean } | null {
  // Dia inteiro: interpretar YYYY-MM-DD no fuso local (evita cair no dia anterior em UTC-3)
  if (ev.start?.date && !ev.start?.dateTime) {
    const startAt = parseLocalDateOnly(ev.start.date);
    const endExclusive = ev.end?.date
      ? parseLocalDateOnly(ev.end.date)
      : new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate() + 1);
    let endAt = new Date(endExclusive.getTime() - 1);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
    if (endAt <= startAt) {
      endAt = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate(), 23, 59, 59, 999);
    }
    return { startAt, endAt, allDay: true };
  }

  const startRaw = ev.start?.dateTime;
  const endRaw = ev.end?.dateTime;
  if (!startRaw || !endRaw) return null;
  const startAt = new Date(startRaw);
  let endAt = new Date(endRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  if (endAt <= startAt) {
    endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  }
  return { startAt, endAt, allDay: false };
}

function stableGoogleEventId(calendarId: string, eventId: string, isPrimary: boolean): string {
  // Mantém IDs antigos do calendário principal para não duplicar o que já sincronizou
  if (isPrimary || calendarId === 'primary') return eventId;
  return `${calendarId}::${eventId}`;
}

async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: '250' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${GOOGLE_CALENDAR_LIST_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as {
      items?: GoogleCalendarListEntry[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || 'Falha ao listar agendas do Google');
    }
    calendars.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Sincroniza todas as agendas acessíveis (não só a "primary")
  const usable = calendars.filter((c) => !!c.id);
  if (usable.length === 0) {
    return [{ id: 'primary', primary: true, selected: true }];
  }
  return usable;
}

async function fetchGoogleEventsForCalendar(
  accessToken: string,
  calendarId: string,
  from: Date,
  to: Date
): Promise<GoogleEvent[]> {
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      showDeleted: 'false',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${googleEventsUrl(calendarId)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      // Agenda inacessível (ex.: só freeBusy) — pula em vez de quebrar a sync toda
      console.warn(`[google-sync] agenda ${calendarId}:`, data.error?.message || res.status);
      return items;
    }
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export async function syncGoogleCalendarEvents(
  userId: string,
  from: Date,
  to: Date
): Promise<{ imported: number; updated: number; skipped: number; calendars: number }> {
  const accessToken = await getValidAccessToken(userId);
  const [calendars, colorMaps] = await Promise.all([
    listGoogleCalendars(accessToken),
    fetchGoogleColorMaps(accessToken),
  ]);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const calendar of calendars) {
    const calendarId = calendar.id!;
    const isPrimary = !!calendar.primary;
    const events = await fetchGoogleEventsForCalendar(accessToken, calendarId, from, to);

    for (const item of events) {
      if (!item.id || item.status === 'cancelled') {
        skipped += 1;
        continue;
      }
      const times = parseGoogleEventTimes(item);
      if (!times) {
        skipped += 1;
        continue;
      }
      const title = String(item.summary || 'Sem título').trim() || 'Sem título';
      const description = String(item.description || '').trim();
      const googleEventId = stableGoogleEventId(calendarId, item.id, isPrimary);
      const color = resolveGoogleEventColor(item, calendar, colorMaps);

      const existing = await prisma.plannerEvent.findFirst({
        where: { userId, googleEventId },
      });

      if (existing) {
        await prisma.plannerEvent.update({
          where: { id: existing.id },
          data: {
            title,
            description,
            startAt: times.startAt,
            endAt: times.endAt,
            color,
          },
        });
        updated += 1;
      } else {
        await prisma.plannerEvent.create({
          data: {
            userId,
            title,
            description,
            startAt: times.startAt,
            endAt: times.endAt,
            color,
            googleEventId,
          },
        });
        imported += 1;
      }
    }
  }

  return { imported, updated, skipped, calendars: calendars.length };
}

export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
    select: { id: true },
  });
  return !!conn;
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
}
