'use client';

import React from 'react';
import {
  AdmissaoCandidatosRepeatableFields,
  AlteracaoFuncaoSalarioRepeatableFields,
  AtestadoMedicoRepeatableFields,
  BeneficiosViagemRepeatableFields,
  FeriasRepeatableFields,
  HoraExtraRepeatableFields,
  MedidaDisciplinarFields,
  OutrasSolicitacoesRepeatableFields,
  RescisaoRepeatableFields,
  RetificacaoAlocacaoRepeatableFields,
} from './dpSolicitacaoRepeatableFields';

export type DpFormRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO';

type PayrollEmp = { id: string; name: string };

type Props = {
  requestType: DpFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: PayrollEmp[];
  onAtestadoFile: (index: number, file: File | null) => void;
  onHoraExtraFile: (index: number, file: File | null) => void;
  onAdmissaoDocumentoFile: (index: number, file: File | null) => void;
  onRescisaoDocumentoFile: (index: number, file: File | null) => void;
  atestadoFileNames: Record<number, string>;
  horaExtraFileNames: Record<number, string>;
  admissaoDocumentoFileNames: Record<number, string>;
  rescisaoDocumentoFileNames: Record<number, string>;
};

export function DpSolicitacaoTypeFields({
  requestType,
  details,
  patchDetails,
  employees,
  onAtestadoFile,
  onHoraExtraFile,
  onAdmissaoDocumentoFile,
  onRescisaoDocumentoFile,
  atestadoFileNames,
  horaExtraFileNames,
  admissaoDocumentoFileNames,
  rescisaoDocumentoFileNames,
}: Props) {
  switch (requestType) {
    case '':
      return null;
    case 'ADMISSAO':
      return (
        <div className="md:col-span-2">
          <AdmissaoCandidatosRepeatableFields
            details={details}
            patchDetails={patchDetails}
            documentoFileNames={admissaoDocumentoFileNames}
            onDocumentoFile={onAdmissaoDocumentoFile}
          />
        </div>
      );
    case 'FERIAS':
      return (
        <div className="md:col-span-2">
          <FeriasRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
        </div>
      );
    case 'RESCISAO':
      return (
        <div className="md:col-span-2">
          <RescisaoRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
            documentoFileNames={rescisaoDocumentoFileNames}
            onDocumentoFile={onRescisaoDocumentoFile}
          />
        </div>
      );
    case 'ALTERACAO_FUNCAO_SALARIO':
      return (
        <div className="md:col-span-2">
          <AlteracaoFuncaoSalarioRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
          />
        </div>
      );
    case 'ADVERTENCIA_SUSPENSAO':
      return (
        <div className="md:col-span-2">
          <MedidaDisciplinarFields details={details} patchDetails={patchDetails} employees={employees} />
        </div>
      );
    case 'ATESTADO_MEDICO':
      return (
        <div className="md:col-span-2">
          <AtestadoMedicoRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
            atestadoFileNames={atestadoFileNames}
            onAtestadoFile={onAtestadoFile}
          />
        </div>
      );
    case 'RETIFICACAO_ALOCACAO':
      return (
        <div className="md:col-span-2">
          <RetificacaoAlocacaoRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
          />
        </div>
      );
    case 'HORA_EXTRA':
      return (
        <div className="md:col-span-2">
          <HoraExtraRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
            horaExtraFileNames={horaExtraFileNames}
            onHoraExtraFile={onHoraExtraFile}
          />
        </div>
      );
    case 'BENEFICIOS_VIAGEM':
      return (
        <div className="md:col-span-2">
          <BeneficiosViagemRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
          />
        </div>
      );
    case 'OUTRAS_SOLICITACOES':
      return (
        <div className="md:col-span-2">
          <OutrasSolicitacoesRepeatableFields
            details={details}
            patchDetails={patchDetails}
            employees={employees}
          />
        </div>
      );
    default:
      return null;
  }
}

export { ButtonSeg } from './dpSolicitacaoRepeatableUi';
