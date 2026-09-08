/** Conta de serviço da assistente Gennecy — não deve aparecer em listagens de funcionários. */
export function getGennecyBotEmail(): string {
  return (process.env.GENNECY_BOT_EMAIL || 'gennecy-bot@gennesis.internal').trim().toLowerCase();
}

export function isGennecyBotUser(user?: {
  name?: string | null;
  email?: string | null;
} | null): boolean {
  if (!user) return false;
  if (user.name?.trim().toLowerCase() === 'gennecy') return true;
  const email = user.email?.trim().toLowerCase() ?? '';
  const botEmail = getGennecyBotEmail();
  if (email === botEmail) return true;
  return email.startsWith('gennecy-bot@') || email.includes('gennecy-bot');
}

/** Cláusula Prisma para excluir a conta bot de consultas de usuários. */
export function gennecyBotUserWhereExclude() {
  const botEmail = getGennecyBotEmail();
  return {
    NOT: {
      OR: [
        { email: { equals: botEmail, mode: 'insensitive' as const } },
        { email: { contains: 'gennecy-bot', mode: 'insensitive' as const } },
        { name: { equals: 'Gennecy', mode: 'insensitive' as const } },
      ],
    },
  };
}
