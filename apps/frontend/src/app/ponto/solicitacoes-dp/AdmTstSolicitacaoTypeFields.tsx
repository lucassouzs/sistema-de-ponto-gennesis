'use client';

import React from 'react';
import {
  AdmAsosRepeatableFields,
  AdmSimpleRepeatableFields,
  AdmViagensRepeatableFields,
  ASO_TIPO_LABELS,
} from './dpSolicitacaoRepeatableFields';

export type AdmFormRequestType =
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR'
  | 'ADM_ASOS';

export const ADM_TYPE_LABELS: Record<AdmFormRequestType, string> = {
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
};

export { ASO_TIPO_LABELS };

export const ADM_SIMPLE_DETAIL_TYPES: AdmFormRequestType[] = [
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
];

export type SolicitacaoPayrollEmp = {
  id: string;
  name: string;
  cpf?: string;
  profilePhotoUrl?: string | null;
  department?: string;
  position?: string;
  company?: string | null;
  polo?: string | null;
  costCenter?: string | null;
  birthDate?: string | null;
};

type Props = {
  requestType: AdmFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: SolicitacaoPayrollEmp[];
};

export function AdmTstSolicitacaoTypeFields({ requestType, details, patchDetails, employees }: Props) {
  if (!requestType) return null;

  if (requestType === 'ADM_ASOS') {
    return (
      <div className="md:col-span-2">
        <AdmAsosRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  if (requestType === 'ADM_VIAGENS') {
    return (
      <div className="md:col-span-2">
        <AdmViagensRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  if ((ADM_SIMPLE_DETAIL_TYPES as readonly string[]).includes(requestType)) {
    return (
      <div className="md:col-span-2">
        <AdmSimpleRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  return null;
}

export function isDepartamentoPessoalSector(department?: string | null): boolean {
  const normalized = (department ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized === 'departamento pessoal';
}
