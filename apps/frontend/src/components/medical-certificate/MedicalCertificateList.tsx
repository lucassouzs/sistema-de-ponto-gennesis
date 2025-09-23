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
  Search,
  Filter
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface MedicalCertificate {
  id: string;
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
  };
  approver?: {
    name: string;
    email: string;
  };
}

interface MedicalCertificateListProps {
  userRole: 'EMPLOYEE' | 'HR' | 'ADMIN';
  showActions?: boolean;
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

const statusLabels: Record<string, string> = {
  'PENDING': 'Pendente',
  'APPROVED': 'Aprovado',
  'REJECTED': 'Rejeitado',
  'CANCELLED': 'Cancelado'
};

export const MedicalCertificateList: React.FC<MedicalCertificateListProps> = ({ 
  userRole, 
  showActions = false 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCertificate, setSelectedCertificate] = useState<MedicalCertificate | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const queryClient = useQueryClient();

  // Buscar atestados
  const { data: certificatesData, isLoading } = useQuery({
    queryKey: ['medical-certificates', userRole],
    queryFn: async () => {
      const endpoint = userRole === 'EMPLOYEE' ? '/medical-certificates/my' : '/medical-certificates';
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
      setRejectReason('');
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
    }
  });

  const certificates: MedicalCertificate[] = certificatesData?.data?.certificates || [];

  // Filtrar atestados
  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch = userRole === 'EMPLOYEE' || 
      cert.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || cert.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

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

  const handleApprove = () => {
    if (selectedCertificate) {
      approveMutation.mutate(selectedCertificate.id);
    }
  };

  const handleReject = () => {
    if (selectedCertificate && rejectReason.trim()) {
      rejectMutation.mutate({
        id: selectedCertificate.id,
        reason: rejectReason.trim()
      });
    }
  };

  const handleCancel = (certificate: MedicalCertificate) => {
    if (window.confirm('Tem certeza que deseja cancelar esta ausência?')) {
      cancelMutation.mutate(certificate.id);
    }
  };

  const handleDownload = async (certificate: MedicalCertificate) => {
    try {
      const response = await api.get(`/medical-certificates/${certificate.id}/download`, {
        responseType: 'blob'
      });
      
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
            <Clock className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span>Carregando registros de ausências...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      {userRole !== 'EMPLOYEE' && (
        <Card>
          <CardContent className="p-0 pt-0">
            {/* Cabeçalho dos Filtros */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              </div>
            </div>
            
            {/* Conteúdo dos Filtros */}
            <div className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Buscar funcionários por nome, email ou CPF..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:w-48">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Status:</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  >
                    <option value="all">Todos</option>
                    <option value="PENDING">Pendente</option>
                    <option value="APPROVED">Aprovado</option>
                    <option value="REJECTED">Rejeitado</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Atestados */}
      <div className="space-y-3">
        {filteredCertificates.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum registro de ausência encontrado
              </h3>
              <p className="text-gray-500">
                {userRole === 'EMPLOYEE' 
                  ? 'Você ainda não enviou nenhum registro de ausência.'
                  : 'Não há registros de ausência que correspondam aos filtros selecionados.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredCertificates.map((certificate) => (
            <Card key={certificate.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(certificate.status)}
                      <div>
                        <h3 className="font-medium text-gray-900 text-sm sm:text-base">
                          {certificateTypeLabels[certificate.type]}
                        </h3>
                        {userRole !== 'EMPLOYEE' && (
                          <p className="text-xs sm:text-sm text-gray-600">
                            <User className="w-3 h-3 inline mr-1" />
                            {certificate.user.name} ({certificate.employee.department})
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(certificate.startDate)} - {formatDate(certificate.endDate)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {certificate.days} dias
                      </div>
                      <div>
                        Enviado em {formatDate(certificate.submittedAt)}
                      </div>
                    </div>

                    {certificate.description && (
                      <p className="text-xs sm:text-sm text-gray-600 mt-2">
                        {certificate.description}
                      </p>
                    )}

                    {certificate.reason && certificate.status === 'REJECTED' && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                        <p className="text-xs sm:text-sm text-red-800">
                          <strong>Motivo da rejeição:</strong> {certificate.reason}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:ml-4">
                    {getStatusBadge(certificate.status)}
                    
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(certificate)}
                        className="p-2"
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                      
                      {certificate.fileName && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(certificate)}
                          className="p-2"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      )}
                      
                      {userRole === 'EMPLOYEE' && certificate.status === 'PENDING' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(certificate)}
                          className="p-2"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
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
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <p className="text-sm text-gray-900">
                  {certificateTypeLabels[selectedCertificate.type]}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedCertificate.status)}
                  {getStatusBadge(selectedCertificate.status)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Data de Início</label>
                <p className="text-sm text-gray-900">{formatDate(selectedCertificate.startDate)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Data de Fim</label>
                <p className="text-sm text-gray-900">{formatDate(selectedCertificate.endDate)}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Duração</label>
              <p className="text-sm text-gray-900">{selectedCertificate.days} dias</p>
            </div>

            {selectedCertificate.description && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Observações</label>
                <p className="text-sm text-gray-900">{selectedCertificate.description}</p>
              </div>
            )}

            {selectedCertificate.reason && selectedCertificate.status === 'REJECTED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Motivo da Rejeição</label>
                <p className="text-sm text-red-800">{selectedCertificate.reason}</p>
              </div>
            )}

            {selectedCertificate.approver && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {selectedCertificate.status === 'APPROVED' ? 'Aprovado por' : 'Rejeitado por'}
                </label>
                <p className="text-sm text-gray-900">
                  {selectedCertificate.approver.name} em {formatDate(selectedCertificate.approvedAt!)}
                </p>
              </div>
            )}

            {/* Ações para RH/Admin */}
            {userRole !== 'EMPLOYEE' && selectedCertificate.status === 'PENDING' && (
              <div className="border-t pt-4 space-y-3">
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aprovar Ausência
                </Button>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Motivo da Rejeição
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={3}
                    placeholder="Digite o motivo da rejeição..."
                  />
                  <Button
                    onClick={handleReject}
                    disabled={rejectMutation.isPending || !rejectReason.trim()}
                    variant="outline"
                    className="w-full border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Rejeitar Ausência
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
