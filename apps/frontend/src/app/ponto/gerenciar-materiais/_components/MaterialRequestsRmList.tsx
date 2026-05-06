import Link from 'next/link';
import {
  Ban,
  CheckCircle,
  Eye,
  FileText,
  Pencil,
  Wrench
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import type { MaterialRequest } from '../_lib/types';
import {
  formatDate,
  getPriorityInfo,
  getStatusInfo,
  joinOrderNumbersPt,
  rmSolicitante,
  rmTitulo
} from '../_lib/display';

export function MaterialRequestsRmList({
  loadingRequests,
  filteredRequests,
  ordersByMaterialRequestId,
  currentUserId,
  onCreateOc,
  onApprove,
  onCorrection,
  onCancel,
  onDetails
}: {
  loadingRequests: boolean;
  filteredRequests: MaterialRequest[];
  ordersByMaterialRequestId: Map<string, PurchaseOrder[]>;
  currentUserId?: string;
  onCreateOc: (r: MaterialRequest) => void;
  onApprove: (r: MaterialRequest) => void;
  onCorrection: (r: MaterialRequest) => void;
  onCancel: (r: MaterialRequest) => void;
  onDetails: (r: MaterialRequest) => void;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        {loadingRequests ? (
          <div className="text-center py-8">
            <Loading message="Carregando requisições..." />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">Nenhuma requisição encontrada</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => {
              const statusInfo = getStatusInfo(request.status);
              const priorityInfo = getPriorityInfo(request.priority);

              return (
                <div
                  key={request.id}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${priorityInfo.color}`}>
                          {priorityInfo.label}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">{rmTitulo(request)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {request.description || 'Sem descrição'}
                      </p>
                      {(() => {
                        const ocs = ordersByMaterialRequestId.get(request.id) ?? [];
                        const nums = ocs.map((o) => o.orderNumber).filter((n): n is string => Boolean(n));
                        if (nums.length === 0) return null;
                        return (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Gerou:</span>{' '}
                            {joinOrderNumbersPt(nums)}
                          </p>
                        );
                      })()}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Solicitante: {rmSolicitante(request)?.name || '—'}</span>
                        <span>Centro de Custo: {request.costCenter.name}</span>
                        {request.project && <span>Projeto: {request.project.name}</span>}
                        <span>Itens: {request.items.length}</span>
                        <span>Criado em: {formatDate(request.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {request.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => onCreateOc(request)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Criar Ordem de Compra"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      )}
                      {request.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApprove(request)}
                            className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                            title="Aprovar"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onCorrection(request)}
                            className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                            title="Enviar para Correção RM"
                          >
                            <Wrench className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancel(request)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Cancelar requisição"
                          >
                            <Ban className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      {request.status === 'IN_REVIEW' && currentUserId === rmSolicitante(request)?.id && (
                        <Link
                          href={`/ponto/solicitar-materiais?editRm=${request.id}`}
                          className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors inline-flex"
                          title="Editar RM"
                        >
                          <Pencil className="w-5 h-5" />
                        </Link>
                      )}
                      {request.status === 'IN_REVIEW' && (
                        <button
                          type="button"
                          onClick={() => onCancel(request)}
                          className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Cancelar requisição"
                        >
                          <Ban className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDetails(request)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
