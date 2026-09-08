import { prisma } from './prisma';

/** Gera CPF/e-mail únicos para liberar constraints após desligamento. */
export function buildReleasedIdentity(userId: string): { email: string; cpf: string } {
  const stamp = Date.now().toString(36);
  const shortId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-10) || 'x';
  // 11 dígitos únicos a partir do id + timestamp
  const digits = `${Date.now()}${shortId}`
    .replace(/\D/g, '')
    .padEnd(20, '0')
    .slice(0, 11);
  return {
    email: `deleted.${shortId}.${stamp}@deleted.local`,
    cpf: digits,
  };
}

/**
 * Libera e-mail e CPF do usuário desligado para permitir novo cadastro
 * com os mesmos dados (histórico permanece no usuário inativo).
 */
export async function releaseUserIdentity(userId: string): Promise<void> {
  const identity = buildReleasedIdentity(userId);
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      email: identity.email,
      cpf: identity.cpf,
    },
  });
}

export function cpfMatchVariants(cpf: string): string[] {
  const digits = String(cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return [String(cpf || '').trim()].filter(Boolean);
  const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  return Array.from(new Set([digits, formatted, String(cpf).trim()].filter(Boolean)));
}

/**
 * Libera identidade de usuários já inativos que ainda ocupam o CPF/e-mail,
 * para novo cadastro/importação funcionar como se nunca tivessem existido.
 */
export async function releaseInactiveUsersHoldingIdentity(
  cpf: string,
  email: string
): Promise<number> {
  const variants = cpfMatchVariants(cpf);
  const emailNorm = String(email || '').trim();

  const candidates = await prisma.user.findMany({
    where: {
      isActive: false,
      OR: [
        ...(variants.length ? [{ cpf: { in: variants } }] : []),
        ...(emailNorm
          ? [{ email: { equals: emailNorm, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    select: { id: true, cpf: true },
  });

  // Também pega inativos cujo CPF no banco está formatado diferente
  const digits = String(cpf || '').replace(/\D/g, '');
  let extra: { id: string }[] = [];
  if (digits.length === 11) {
    const inactive = await prisma.user.findMany({
      where: { isActive: false },
      select: { id: true, cpf: true },
    });
    extra = inactive.filter((u) => u.cpf.replace(/\D/g, '') === digits);
  }

  const ids = new Set([...candidates, ...extra].map((u) => u.id));
  let released = 0;
  for (const id of ids) {
    await releaseUserIdentity(id);
    released += 1;
  }
  return released;
}
