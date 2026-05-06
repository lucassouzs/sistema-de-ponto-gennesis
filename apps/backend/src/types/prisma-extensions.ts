/**
 * Extensões de tipos do Prisma para campos adicionados manualmente
 * Use este arquivo quando o Prisma Client não puder ser regenerado
 */

import { Prisma } from '@prisma/client';

// Estende o tipo EngineeringMaterialCreateInput para incluir o campo 'name'
export interface EngineeringMaterialCreateInputExtended extends Omit<Prisma.EngineeringMaterialCreateInput, 'name'> {
  name?: string | null;
}

// Estende o tipo EngineeringMaterialUpdateInput para incluir o campo 'name'
export interface EngineeringMaterialUpdateInputExtended extends Omit<Prisma.EngineeringMaterialUpdateInput, 'name'> {
  name?: string | null;
}
