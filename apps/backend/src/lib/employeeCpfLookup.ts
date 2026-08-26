import { prisma } from './prisma';

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function maskCpf(cpfRaw: string): string {
  const cpf = onlyDigits(cpfRaw).padStart(11, '0').slice(-11);
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function isValidCpf(cpfRaw: string): boolean {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (slice: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcDigit(cpf.slice(0, 9), 10);
  const d2 = calcDigit(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

export type EmployeeCpfLookupResult = {
  userId: string;
  employeeId: string;
  name: string;
  cpfDigits: string;
  cpfMasked: string;
  costCenter: string | null;
  department: string | null;
  position: string | null;
};

export async function findEmployeeByCpf(
  cpfRaw: string,
): Promise<EmployeeCpfLookupResult | null> {
  const cpfDigits = onlyDigits(cpfRaw);
  const cpfMasked = maskCpf(cpfDigits);

  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [{ cpf: cpfDigits }, { cpf: cpfMasked }],
    },
    include: { employee: true },
  });

  if (!user?.employee) return null;

  return {
    userId: user.id,
    employeeId: user.employee.id,
    name: user.name,
    cpfDigits,
    cpfMasked,
    costCenter: user.employee.costCenter,
    department: user.employee.department,
    position: user.employee.position,
  };
}

export type ResolvedEmployeeContract = {
  id: string;
  label: string;
  number: string;
  name: string;
  costCenterCode: string;
  costCenterName: string;
};

export async function resolveContractForEmployee(
  employeeCostCenter: string | null | undefined,
): Promise<ResolvedEmployeeContract | null> {
  const ccRaw = employeeCostCenter?.trim();
  if (!ccRaw) return null;

  const costCenter = await prisma.costCenter.findFirst({
    where: {
      isActive: true,
      OR: [
        { code: { equals: ccRaw, mode: 'insensitive' } },
        { name: { equals: ccRaw, mode: 'insensitive' } },
        { code: { contains: ccRaw, mode: 'insensitive' } },
        { name: { contains: ccRaw, mode: 'insensitive' } },
      ],
    },
    select: { id: true, code: true, name: true },
  });

  if (!costCenter) return null;

  const contract = await prisma.contract.findFirst({
    where: { costCenterId: costCenter.id },
    orderBy: [{ endDate: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, number: true },
  });

  if (!contract) return null;

  return {
    id: contract.id,
    label: `${contract.number} — ${contract.name}`,
    number: contract.number,
    name: contract.name,
    costCenterCode: costCenter.code,
    costCenterName: costCenter.name,
  };
}

export type FuelRequestEmployeeContext =
  | {
      ok: true;
      /** Nome do contrato (sem código) para exibir ao usuário. */
      costCenterLabel: string;
      contractId?: string | null;
      /** Centro de custo cru do colaborador (persistência / fallback). */
      costCenterRaw?: string | null;
    }
  | { ok: false; message: string };

function extractContractDisplayName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  if (/^\d+\/\d+/.test(parts[0])) return parts.slice(1).join(' — ');
  return parts[parts.length - 1];
}

/** Resolve contrato pelo centro de custo do colaborador; exibe só o nome. */
export async function resolveFuelRequestContextFromEmployee(
  employee: EmployeeCpfLookupResult,
): Promise<FuelRequestEmployeeContext> {
  const costCenterRaw = employee.costCenter?.trim();
  if (!costCenterRaw) {
    return {
      ok: false,
      message:
        'Este colaborador não tem centro de custo cadastrado. Verifique com o RH ou fale com o Suprimentos.',
    };
  }

  const contract = await resolveContractForEmployee(costCenterRaw);
  if (contract) {
    return {
      ok: true,
      costCenterLabel: contract.name.trim() || extractContractDisplayName(costCenterRaw),
      contractId: contract.id,
      costCenterRaw,
    };
  }

  return {
    ok: true,
    costCenterLabel: extractContractDisplayName(costCenterRaw),
    contractId: null,
    costCenterRaw,
  };
}
