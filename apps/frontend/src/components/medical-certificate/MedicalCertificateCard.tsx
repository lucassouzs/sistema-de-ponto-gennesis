'use client';

import React, { useState } from 'react';
import { Calendar, Upload, FileText, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface MedicalCertificateCardProps {
  onSuccess?: () => void;
}

const certificateTypes = [
  { value: 'MEDICAL', label: 'Atestado Médico' },
  { value: 'DENTAL', label: 'Atestado Odontológico' },
  { value: 'PREVENTIVE', label: 'Exame Preventivo' },
  { value: 'ACCIDENT', label: 'Acidente de Trabalho' },
  { value: 'COVID', label: 'COVID-19' },
  { value: 'MATERNITY', label: 'Maternidade' },
  { value: 'PATERNITY', label: 'Paternidade' },
  { value: 'OTHER', label: 'Outros' }
];

export const MedicalCertificateCard: React.FC<MedicalCertificateCardProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    type: 'MEDICAL',
    startDate: '',
    endDate: '',
    description: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await api.post('/medical-certificates', data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
      setFormData({
        type: 'MEDICAL',
        startDate: '',
        endDate: '',
        description: ''
      });
      setFile(null);
      onSuccess?.();
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.startDate || !formData.endDate) {
      alert('Por favor, preencha as datas de início e fim');
      return;
    }

    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      alert('A data de início não pode ser posterior à data de fim');
      return;
    }

    if (!file) {
      alert('Por favor, anexe um arquivo para justificar a ausência');
      return;
    }

    setIsSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append('type', formData.type);
      submitData.append('startDate', formData.startDate);
      submitData.append('endDate', formData.endDate);
      submitData.append('description', formData.description);
      submitData.append('file', file!);

      await submitMutation.mutateAsync(submitData);
      alert('Atestado enviado com sucesso!');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao enviar atestado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
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
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Pendente</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Aprovado</Badge>;
      case 'REJECTED':
        return <Badge variant="error">Rejeitado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Registrar Ausência</h3>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tipo de Atestado */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Tipo de Ausência
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="input w-full"
              required
            >
              {certificateTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  Data de Início
                </div>
              </label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                fullWidth
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  Data de Fim
                </div>
              </label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                fullWidth
                required
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Observações (Opcional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input w-full min-h-[100px] resize-none"
              placeholder="Adicione observações sobre a ausência..."
            />
          </div>

          {/* Upload de Arquivo */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-gray-600" />
                Anexar Arquivo *
              </div>
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>Arquivo selecionado: {file.name}</span>
              </div>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Formatos aceitos: PDF, JPG, PNG, DOC, DOCX (Obrigatório)
            </p>
          </div>

          {/* Botão de Envio */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-lg w-full"
          >
            {isSubmitting ? (
              <>
                <Clock className="w-5 h-5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5 mr-2" />
                Registrar Ausência
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
