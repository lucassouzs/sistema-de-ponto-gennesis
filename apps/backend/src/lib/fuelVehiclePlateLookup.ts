import { prisma } from './prisma';

function normalizePlate(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function formatVehiclePlateOptionLabel(plate: string, model?: string | null): string {
  const modelPart = model?.trim();
  const label = modelPart ? `${plate} — ${modelPart}` : plate;
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

export async function findActiveVehiclesByPlateSuffix(suffix: string) {
  const digits = suffix.replace(/\D/g, '');
  if (digits.length !== 2) return [];

  const vehicles = await prisma.vehicle.findMany({
    where: { isActive: true },
    select: {
      id: true,
      placaVeic: true,
      marcaVeic: true,
      modeloVeic: true,
      frotaPartic: true,
    },
    orderBy: [{ placaVeic: 'asc' }],
  });

  return vehicles.filter((vehicle) => normalizePlate(vehicle.placaVeic).endsWith(digits));
}
