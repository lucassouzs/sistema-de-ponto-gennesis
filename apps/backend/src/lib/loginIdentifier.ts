import { prisma } from './prisma';
import { maskCpf, onlyDigits } from './employeeCpfLookup';

export function normalizeLoginIdentifier(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

export function isEmailLoginIdentifier(raw: string): boolean {
  return raw.includes('@');
}

export async function findUserByLoginIdentifier(identifier: string) {
  const trimmed = normalizeLoginIdentifier(identifier);
  if (!trimmed) return null;

  if (isEmailLoginIdentifier(trimmed)) {
    return prisma.user.findUnique({
      where: { email: trimmed.toLowerCase() },
      include: { employee: true },
    });
  }

  const cpfDigits = onlyDigits(trimmed);
  if (cpfDigits.length !== 11) return null;

  const cpfMasked = maskCpf(cpfDigits);

  return prisma.user.findFirst({
    where: {
      OR: [{ cpf: cpfDigits }, { cpf: cpfMasked }],
    },
    include: { employee: true },
  });
}
