/**
 * Horários de atendimento das solicitações de combustível (Brasília).
 * Manhã: 7h–8h30 | Tarde: 13h–14h30
 * Após 14h30 → atendimento no próximo dia, nas mesmas janelas.
 */

const TIMEZONE = 'America/Sao_Paulo';

const MORNING_START = 7 * 60;
const MORNING_END = 8 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 14 * 60 + 30;

function getBrasiliaParts(date: Date = new Date()): {
  hour: number;
  minute: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const weekdayRaw = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { hour, minute, weekday: weekdayMap[weekdayRaw] ?? 1 };
}

export function getFuelAttendanceMinutesNow(date: Date = new Date()): number {
  const { hour, minute } = getBrasiliaParts(date);
  return hour * 60 + minute;
}

export function isWithinFuelAttendanceHours(date: Date = new Date()): boolean {
  const mins = getFuelAttendanceMinutesNow(date);
  return (
    (mins >= MORNING_START && mins < MORNING_END) ||
    (mins >= AFTERNOON_START && mins < AFTERNOON_END)
  );
}

/** Texto completo com regras (abertura do fluxo). */
export function formatFuelAttendanceHoursBlock(): string {
  return [
    '⏰ *Horário de atendimento das solicitações*',
    '• Manhã: 7h às 8h30',
    '• Tarde: 13h às 14h30',
    '',
    'Se a solicitação for enviada até 8h30, pode ser atendida nessa janela da manhã.',
    'Se for enviada até 14h30, pode ser atendida nessa janela da tarde.',
    'Solicitações após 14h30 são atendidas no dia seguinte, nos mesmos horários.',
    '',
    '🚨 *Urgências:* entre em contato direto com o setor responsável.',
  ].join('\n');
}

/** Versão curta (confirmação / notificação). */
export function formatFuelAttendanceHoursShort(): string {
  return [
    '⏰ Atendimento: 7h–8h30 e 13h–14h30.',
    'Após 14h30 → dia seguinte. Urgências: contate o setor responsável.',
  ].join('\n');
}

/**
 * Aviso quando o usuário inicia/envia fora das janelas.
 * Retorna null se estiver dentro do horário.
 */
export function formatFuelOutsideHoursWarning(date: Date = new Date()): string | null {
  if (isWithinFuelAttendanceHours(date)) return null;

  const mins = getFuelAttendanceMinutesNow(date);
  if (mins >= AFTERNOON_END || mins < MORNING_START) {
    return [
      '⚠️ *Fora do horário de atendimento.*',
      'Sua solicitação será registrada, mas o atendimento ocorre no próximo período',
      '(7h–8h30 ou 13h–14h30). Após 14h30, no dia seguinte.',
    ].join('\n');
  }

  // Entre 8h30 e 13h
  return [
    '⚠️ *Fora do horário de atendimento no momento.*',
    'A próxima janela é das 13h às 14h30. Você já pode registrar a solicitação.',
  ].join('\n');
}

/** Mensagem de abertura do fluxo (Gennecy / WhatsApp). */
export function buildFuelFlowStartMessage(datePromptLine: string): string {
  const parts = [
    'Vamos solicitar o abastecimento! ⛽',
    '',
    formatFuelAttendanceHoursBlock(),
  ];
  const warn = formatFuelOutsideHoursWarning();
  if (warn) {
    parts.push('', warn);
  }
  parts.push('', datePromptLine);
  return parts.join('\n');
}
