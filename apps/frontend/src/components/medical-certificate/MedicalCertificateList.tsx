'use client';

import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Download, 
  Trash2,
  FileText,
  User,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface MedicalCertificate {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  description?: string;
  fileName?: string;
  status: string;
  reason?: string;
  submittedAt: string;
  approvedAt?: string;
  user: {
    name: string;
    email: string;
  };
  employee: {
    employeeId: string;
    department: string;
    position: string;
    company?: string;
  };
  approver?: {
    name: string;
    email: string;
  };
}

interface MedicalCertificateListProps {
  showActions?: boolean;
  filters?: {
    search?: string;
    type?: string;
    department?: string;
    position?: string;
    company?: string;
    month?: number;
    year?: number;
  };
}

const certificateTypeLabels: Record<string, string> = {
  'MEDICAL': 'Atestado Médico',
  'DENTAL': 'Atestado Odontológico',
  'PREVENTIVE': 'Exame Preventivo',
  'ACCIDENT': 'Acidente de Trabalho',
  'COVID': 'COVID-19',
  'MATERNITY': 'Maternidade',
  'PATERNITY': 'Paternidade',
  'OTHER': 'Outros'
};

// Função para obter o label do tipo, extraindo o tipo personalizado se for "Outros"
const getCertificateTypeLabel = (certificate: MedicalCertificate): string => {
  if (certificate.type === 'OTHER' && certificate.description) {
    // O tipo personalizado está no início da descrição (antes do " - ")
    const customType = certificate.description.split(' - ')[0];
    return customType || 'Outros';
  }
  return certificateTypeLabels[certificate.type] || certificate.type;
};

// Função para obter apenas a descrição (sem o tipo personalizado quando for "Outros")
const getCertificateDescription = (certificate: MedicalCertificate): string | undefined => {
  if (certificate.type === 'OTHER' && certificate.description) {
    // Se tiver " - ", pegar apenas a parte após o " - " (a descrição real)
    const parts = certificate.description.split(' - ');
    return parts.length > 1 ? parts.slice(1).join(' - ') : undefined;
  }
  return certificate.description;
};

const statusLabels: Record<string, string> = {
  'PENDING': 'Pendente',
  'APPROVED': 'Aprovado',
  'REJECTED': 'Rejeitado',
  'CANCELLED': 'Cancelado'
};

export const MedicalCertificateList: React.FC<MedicalCertificateListProps> = ({ 
  showActions = false,
  filters = {}
}) => {
  const [selectedCertificate, setSelectedCertificate] = useState<MedicalCertificate | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [certificateToReject, setCertificateToReject] = useState<MedicalCertificate | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [certificateToApprove, setCertificateToApprove] = useState<MedicalCertificate | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [certificateToCancel, setCertificateToCancel] = useState<MedicalCertificate | null>(null);
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('PENDING');

  const queryClient = useQueryClient();
  const { permissions, isLoading: permissionsLoading } = usePermissions();

  // Buscar dados do usuário logado
  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const currentUserId = userData?.data?.id;

  // Buscar atestados
  const { data: certificatesData, isLoading } = useQuery({
    queryKey: ['medical-certificates'],
    queryFn: async () => {
      const endpoint = permissions.canManageAbsences ? '/medical-certificates' : '/medical-certificates/my';
      const response = await api.get(endpoint);
      return response.data;
    }
  });

  // Mutação para aprovar atestado
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.put(`/medical-certificates/${id}/approve`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      setShowModal(false);
      setShowApproveModal(false);
      setCertificateToApprove(null);
    }
  });

  // Mutação para rejeitar atestado
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.put(`/medical-certificates/${id}/reject`, { reason });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      setShowModal(false);
      setShowRejectModal(false);
      setRejectReason('');
      setCertificateToReject(null);
    }
  });

  // Mutação para cancelar atestado
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/medical-certificates/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      setShowCancelModal(false);
      setCertificateToCancel(null);
    }
  });

  const certificates: MedicalCertificate[] = certificatesData?.data?.certificates || [];

  // Filtrar certificados
  const filteredCertificates = certificates.filter(cert => {
    // Filtro de busca
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        cert.user.name.toLowerCase().includes(searchLower) ||
        cert.user.email.toLowerCase().includes(searchLower) ||
        cert.employee.employeeId.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Filtro de status (da tab ativa)
    if (activeStatusTab !== 'all') {
      if (cert.status !== activeStatusTab) return false;
    }

    // Filtro de tipo
    if (filters.type && filters.type !== 'all') {
      if (cert.type !== filters.type) return false;
    }

    // Filtro de setor
    if (filters.department) {
      if (cert.employee.department !== filters.department) return false;
    }

    // Filtro de cargo
    if (filters.position) {
      if (cert.employee.position !== filters.position) return false;
    }

    // Filtro de empresa
    if (filters.company) {
      if (cert.employee.company !== filters.company) return false;
    }

    // Filtro de mês e ano (só aplicar se o filtro for diferente de 0)
    if (filters.month && filters.month !== 0) {
      const startDate = new Date(cert.startDate);
      const certMonth = startDate.getMonth() + 1;
      if (certMonth !== filters.month) return false;
    }
    
    if (filters.year && filters.year !== 0) {
      const startDate = new Date(cert.startDate);
      const certYear = startDate.getFullYear();
      if (certYear !== filters.year) return false;
    }

    return true;
  });

  // Contar certificados por status
  const statusCounts = {
    all: certificates.length,
    PENDING: certificates.filter(c => c.status === 'PENDING').length,
    APPROVED: certificates.filter(c => c.status === 'APPROVED').length,
    REJECTED: certificates.filter(c => c.status === 'REJECTED').length,
    CANCELLED: certificates.filter(c => c.status === 'CANCELLED').length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'APPROVED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'REJECTED':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">{statusLabels[status]}</Badge>;
      case 'APPROVED':
        return <Badge variant="success">{statusLabels[status]}</Badge>;
      case 'REJECTED':
        return <Badge variant="error">{statusLabels[status]}</Badge>;
      default:
        return <Badge variant="secondary">{statusLabels[status]}</Badge>;
    }
  };

  const handleViewDetails = (certificate: MedicalCertificate) => {
    setSelectedCertificate(certificate);
    setShowModal(true);
  };

  const handleApproveClick = (certificate: MedicalCertificate) => {
    setCertificateToApprove(certificate);
    setShowApproveModal(true);
  };

  const handleApprove = () => {
    if (certificateToApprove) {
      approveMutation.mutate(certificateToApprove.id);
    }
  };

  const handleRejectClick = (certificate: MedicalCertificate) => {
    setCertificateToReject(certificate);
    setShowRejectModal(true);
    setRejectReason('');
  };

  const handleReject = () => {
    if (certificateToReject && rejectReason.trim()) {
      rejectMutation.mutate({
        id: certificateToReject.id,
        reason: rejectReason.trim()
      });
    }
  };

  const handleRejectFromModal = () => {
    if (selectedCertificate && rejectReason.trim()) {
      rejectMutation.mutate({
        id: selectedCertificate.id,
        reason: rejectReason.trim()
      });
    }
  };

  const handleCancelClick = (certificate: MedicalCertificate) => {
    setCertificateToCancel(certificate);
    setShowCancelModal(true);
  };

  const handleCancel = () => {
    if (certificateToCancel) {
      cancelMutation.mutate(certificateToCancel.id);
    }
  };

  const handleDownload = async (certificate: MedicalCertificate) => {
    try {
      const response = await api.get(`/medical-certificates/${certificate.id}/download`, {
        responseType: 'blob'
      });
      
      // Criar URL do blob e fazer download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', certificate.fileName || 'atestado.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      alert('Erro ao baixar arquivo. Tente novamente.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Clock className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mr-2" />
            <span className="text-gray-900 dark:text-gray-100">Carregando registros de ausências...</span>
          </div>
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

      {/* Lista de Atestados */}
      <div className="space-y-3">
        {filteredCertificates.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Nenhum registro de ausência encontrado
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {activeStatusTab !== 'all' 
                  ? `Não há ausências ${statusLabels[activeStatusTab]?.toLowerCase()} no momento.`
                  : (filters.search || (filters.type && filters.type !== 'all') || filters.department || filters.position || filters.company)
                    ? 'Nenhum registro encontrado com os filtros selecionados.'
                    : certificates.length === 0
                      ? 'Você ainda não enviou nenhum registro de ausência.'
                      : 'Nenhum registro encontrado.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredCertificates.map((certificate) => (
            <Card key={certificate.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {getStatusIcon(certificate.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {getCertificateTypeLabel(certificate)}
                        </h3>
                        {getStatusBadge(certificate.status)}
                      </div>
                      
                      {permissions.canManageAbsences && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          <User className="w-3.5 h-3.5 inline mr-1" />
                          {certificate.user.name} - {certificate.employee.position} de {certificate.employee.department}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(certificate.startDate)} - {formatDate(certificate.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {certificate.days} {certificate.days === 1 ? 'dia' : 'dias'}
                        </span>
                        <span>
                          Enviado em {formatDate(certificate.submittedAt)}
                        </span>
                      </div>

                      {getCertificateDescription(certificate) && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          {getCertificateDescription(certificate)}
                        </p>
                      )}

                      {certificate.reason && certificate.status === 'REJECTED' && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm">
                          <p className="text-red-800 dark:text-red-300">
                            <strong>Motivo da rejeição:</strong> {certificate.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {showActions && permissions.canManageAbsences && certificate.status === 'PENDING' && certificate.userId !== currentUserId && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApproveClick(certificate)}
                          disabled={approveMutation.isPending}
                          className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800 text-white px-3"
                          title="Aprovar"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectClick(certificate)}
                          disabled={rejectMutation.isPending}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 border-red-300 dark:border-red-600 px-3"
                          title="Rejeitar"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(certificate)}
                      className="p-2"
                      title="Ver detalhes"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    
                    {certificate.fileName && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(certificate)}
                        className="p-2"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    
                    {certificate.userId === currentUserId && certificate.status === 'PENDING' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelClick(certificate)}
                        className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                        title="Cancelar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modal de Detalhes */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Detalhes do Atestado"
      >
        {selectedCertificate && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {getCertificateTypeLabel(selectedCertificate)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedCertificate.status)}
                  {getStatusBadge(selectedCertificate.status)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Data de Início</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">{formatDate(selectedCertificate.startDate)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Data de Fim</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">{formatDate(selectedCertificate.endDate)}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Duração</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{selectedCertificate.days} dias</p>
            </div>

            {getCertificateDescription(selectedCertificate) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Observações</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">{getCertificateDescription(selectedCertificate)}</p>
              </div>
            )}

            {selectedCertificate.reason && selectedCertificate.status === 'REJECTED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Motivo da Rejeição</label>
                <p className="text-sm text-red-800 dark:text-red-300">{selectedCertificate.reason}</p>
              </div>
            )}

            {selectedCertificate.approver && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedCertificate.status === 'APPROVED' ? 'Aprovado por' : 'Rejeitado por'}
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {selectedCertificate.approver.name} em {formatDate(selectedCertificate.approvedAt!)}
                </p>
              </div>
            )}

          </div>
        )}
      </Modal>

      {/* Modal de Confirmação de Aprovação */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false);
          setCertificateToApprove(null);
        }}
        title="Confirmar Aprovação"
      >
        {certificateToApprove && (
          <div className="space-y-4">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-base text-gray-700 dark:text-gray-300 mb-2">
                Tem certeza que deseja aprovar a ausência de
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {certificateToApprove.user.name}?
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowApproveModal(false);
                  setCertificateToApprove(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800 text-white"
              >
                {approveMutation.isPending ? 'Aprovando...' : 'Confirmar Aprovação'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Rejeição Rápida */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setCertificateToReject(null);
          setRejectReason('');
        }}
        title="Rejeitar Ausência"
      >
        {certificateToReject && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Você está rejeitando a ausência de <strong>{certificateToReject.user.name}</strong>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Motivo da Rejeição *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                rows={3}
                placeholder="Digite o motivo da rejeição..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setCertificateToReject(null);
                  setRejectReason('');
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReject}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800 text-white"
              >
                {rejectMutation.isPending ? 'Rejeitando...' : 'Rejeitar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Cancelamento */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setCertificateToCancel(null);
        }}
        title="Confirmar Cancelamento"
      >
        {certificateToCancel && (
          <div className="space-y-4">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-base text-gray-700 dark:text-gray-300 mb-2">
                Tem certeza que deseja cancelar sua ausência de
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {getCertificateTypeLabel(certificateToCancel)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {formatDate(certificateToCancel.startDate)} - {formatDate(certificateToCancel.endDate)}
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelModal(false);
                  setCertificateToCancel(null);
                }}
              >
                Não, manter
              </Button>
              <Button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="bg-orange-600 dark:bg-orange-700 hover:bg-orange-700 dark:hover:bg-orange-800 text-white"
              >
                {cancelMutation.isPending ? 'Cancelando...' : 'Sim, cancelar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
