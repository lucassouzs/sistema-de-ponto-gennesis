'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Clock, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye,
  FileText,
  User
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

interface PointCorrectionRequest {
  id: string;
  title: string;
  description: string;
  justification: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  originalDate: string;
  originalTime: string;
  originalType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  correctedDate: string;
  correctedTime: string;
  correctedType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  createdAt: string;
  approvedAt?: string;
  rejectionReason?: string;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'PENDING':
      return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle };
    case 'IN_REVIEW':
      return { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: Eye };
    case 'APPROVED':
      return { label: 'Aprovada', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    case 'REJECTED':
      return { label: 'Rejeitada', color: 'bg-red-100 text-red-800', icon: XCircle };
    case 'CANCELLED':
      return { label: 'Cancelada', color: 'bg-gray-100 text-gray-800', icon: XCircle };
    default:
      return { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'ENTRY': return 'Entrada';
    case 'LUNCH_START': return 'Início Almoço';
    case 'LUNCH_END': return 'Fim Almoço';
    case 'EXIT': return 'Saída';
    default: return type;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR');
};

const formatTime = (timeString: string) => {
  return timeString.substring(0, 5); // HH:MM
};

export const PointCorrectionList: React.FC = () => {
  const [selectedRequest, setSelectedRequest] = useState<PointCorrectionRequest | null>(null);
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('PENDING');

  const { data: requestsData, isLoading, error } = useQuery({
    queryKey: ['point-corrections'],
    queryFn: async () => {
      const response = await api.get('/solicitacoes/minhas-solicitacoes');
      return response.data;
    }
  });

  const allRequests = requestsData || [];

  // Calcular estatísticas
  const stats = {
    total: allRequests.length,
    pending: allRequests.filter((r: PointCorrectionRequest) => r.status === 'PENDING').length,
    approved: allRequests.filter((r: PointCorrectionRequest) => r.status === 'APPROVED').length,
    rejected: allRequests.filter((r: PointCorrectionRequest) => r.status === 'REJECTED').length,
    cancelled: allRequests.filter((r: PointCorrectionRequest) => r.status === 'CANCELLED').length,
    inReview: allRequests.filter((r: PointCorrectionRequest) => r.status === 'IN_REVIEW').length
  };

  // Filtrar solicitações por status
  const filteredRequests = allRequests.filter((request: PointCorrectionRequest) => {
    if (activeStatusTab !== 'all') {
      if (request.status !== activeStatusTab) return false;
    }
    return true;
  });

  // Contar solicitações por status
  const statusCounts = {
    all: allRequests.length,
    PENDING: stats.pending,
    IN_REVIEW: stats.inReview,
    APPROVED: stats.approved,
    REJECTED: stats.rejected,
    CANCELLED: stats.cancelled
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando solicitações...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
        <p className="text-red-600 dark:text-red-400">Erro ao carregar solicitações</p>
      </div>
    );
  }

  if (!allRequests || allRequests.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Nenhuma solicitação encontrada
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Crie sua primeira solicitação de correção
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs de Status */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveStatusTab('PENDING')}
            className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeStatusTab === 'PENDING'
                ? 'border-yellow-500 dark:border-yellow-400 text-yellow-600 dark:text-yellow-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Pendentes ({statusCounts.PENDING})
          </button>
          <button
            onClick={() => setActiveStatusTab('APPROVED')}
            className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeStatusTab === 'APPROVED'
                ? 'border-green-500 dark:border-green-400 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Aprovados ({statusCounts.APPROVED})
          </button>
          <button
            onClick={() => setActiveStatusTab('REJECTED')}
            className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeStatusTab === 'REJECTED'
                ? 'border-red-500 dark:border-red-400 text-red-600 dark:text-red-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Rejeitados ({statusCounts.REJECTED})
          </button>
          <button
            onClick={() => setActiveStatusTab('CANCELLED')}
            className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeStatusTab === 'CANCELLED'
                ? 'border-gray-500 dark:border-gray-400 text-gray-600 dark:text-gray-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Cancelados ({statusCounts.CANCELLED})
          </button>
          <button
            onClick={() => setActiveStatusTab('all')}
            className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeStatusTab === 'all'
                ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Todas ({statusCounts.all})
          </button>
        </nav>
      </div>

      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Nenhuma solicitação encontrada
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {activeStatusTab !== 'all' 
                  ? `Não há solicitações ${getStatusInfo(activeStatusTab).label.toLowerCase()} no momento.`
                  : 'Nenhuma solicitação encontrada.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request: PointCorrectionRequest) => {
          const statusInfo = getStatusInfo(request.status);
          const StatusIcon = statusInfo.icon;

          return (
            <Card key={request.id} className="hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                {/* Header compacto */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {request.title}
                      </h4>
                      <Badge className={`${statusInfo.color} shrink-0 text-xs`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </div>
                    {request.justification && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                        {request.justification}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedRequest(request)}
                    className="shrink-0 h-8 px-2"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Comparação compacta */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {/* Original */}
                  <div className="p-2.5 rounded border-l-2 border-red-500 dark:border-red-400 bg-red-50/50 dark:bg-red-900/10">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                        {formatDate(request.originalDate)} {formatTime(request.originalTime)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {getTypeLabel(request.originalType)}
                      </p>
                    </div>
                  </div>

                  {/* Corrigido */}
                  <div className="p-2.5 rounded border-l-2 border-green-500 dark:border-green-400 bg-green-50/50 dark:bg-green-900/10">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                        {formatDate(request.correctedDate)} {formatTime(request.correctedTime)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {getTypeLabel(request.correctedType)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer compacto */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(request.createdAt)}</span>
                  </div>
                  {request.approvedAt && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>Aprovado {formatDate(request.approvedAt)}</span>
                    </div>
                  )}
                  {request.approvedBy && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <User className="w-3 h-3" />
                      <span>{request.approvedBy.name}</span>
                    </div>
                  )}
                </div>

                {/* Motivo da rejeição compacto */}
                {request.rejectionReason && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border-l-2 border-red-500 dark:border-red-400 rounded-r">
                    <p className="text-xs text-red-700 dark:text-red-300">
                      <span className="font-semibold">Rejeição:</span> {request.rejectionReason}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
      </div>

      {/* Modal de detalhes */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedRequest(null)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Detalhes da Solicitação
              </h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{selectedRequest.title}</h4>
              </div>

              <div>
                <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Justificativa:</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  {selectedRequest.justification}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded">
                  <h6 className="font-medium text-red-800 dark:text-red-300 mb-2">Dados Originais</h6>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {formatDate(selectedRequest.originalDate)} às {formatTime(selectedRequest.originalTime)}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {getTypeLabel(selectedRequest.originalType)}
                  </p>
                </div>

                <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded">
                  <h6 className="font-medium text-green-800 dark:text-green-300 mb-2">Dados Corrigidos</h6>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {formatDate(selectedRequest.correctedDate)} às {formatTime(selectedRequest.correctedTime)}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {getTypeLabel(selectedRequest.correctedType)}
                  </p>
                </div>
              </div>

              {selectedRequest.rejectionReason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
                  <h6 className="font-medium text-red-800 dark:text-red-300 mb-2">Motivo da Rejeição:</h6>
                  <p className="text-sm text-red-700 dark:text-red-300">{selectedRequest.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
