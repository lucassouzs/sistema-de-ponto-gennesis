/** Fases SC/RM e OC na mesma barra de navegação */
export type FluxTab =
  | 'rm_PENDING'
  | 'rm_IN_REVIEW'
  | 'rm_APPROVED'
  | 'rm_CANCELLED'
  | 'oc_compras'
  | 'oc_gestor'
  | 'oc_diretoria'
  | 'oc_IN_REVIEW'
  | 'oc_APPROVED'
  | 'oc_ATTACH_BOLETO'
  | 'oc_PROOF_VALIDATION'
  | 'oc_PROOF_CORRECTION'
  | 'oc_ATTACH_NF'
  | 'oc_FINALIZADAS';

export interface MaterialRequestContractRef {
  id: string;
  name: string;
  number: string;
}

export interface MaterialRequestServiceOrderRef {
  id: string;
  numero: number;
  ano: number;
  pleitos?: Array<{
    divSe?: string | null;
    folderNumber?: string | null;
    reportsBilling?: string | null;
    updatedContract?: MaterialRequestContractRef | null;
  }>;
}

export interface MaterialRequest {
  id: string;
  requestNumber?: string;
  serviceOrderId?: string | null;
  serviceOrder?: string | null;
  service_orders?: MaterialRequestServiceOrderRef | null;
  description: string;
  demandSheet?: string | null;
  demandSheetAttachmentUrl?: string | null;
  demandSheetAttachmentName?: string | null;
  demandSheetAttachments?: Array<{ url?: string; name?: string }> | null;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdAt: string;
  requestedBy?:
    | string
    | {
        id: string;
        name: string;
        email: string;
      };
  requester?: {
    id: string;
    name: string;
    email: string;
  };
  costCenter: {
    id: string;
    name: string;
  };
  project?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    quantity: number;
    unit: string;
    observation?: string;
    notes?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    unitPrice?: number;
    material: {
      id: string;
      name?: string | null;
      code?: string;
      sinapiCode?: string;
      description?: string;
      medianPrice?: number;
      /** Média ponderada das últimas 10 compras efetivas (referência). */
      avgPaidUnitPrice?: number | null;
    };
    /** Espelho da média no item (API de detalhe da RM). */
    avgPaidUnitPrice?: number | null;
  }>;
  approvedBy?: {
    id: string;
    name: string;
  };
  rejectedBy?: {
    id: string;
    name: string;
  };
  rejecter?: {
    id: string;
    name: string;
  };
  rejectionReason?: string;
}

export type GerenciarStats = {
  total: number;
  pending: number;
  approved: number;
  cancelled: number;
  inReview: number;
};
