import React from 'react';
import { Clock, MapPin, Camera, DoorOpen, DoorClosed, Utensils, UtensilsCrossed, Eye, FileCheck, Calendar, User } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TimeRecord, TimeRecordWithDetails } from '@/types';

interface TimeRecordsListProps {
  records: TimeRecordWithDetails[];
  onViewMore?: () => void;
}

export const TimeRecordsList: React.FC<TimeRecordsListProps> = ({ records, onViewMore }) => {
  const getTypeLabel = (type: string) => {
    const types = {
      ENTRY: 'Entrada',
      EXIT: 'Saída',
      LUNCH_START: 'Almoço',
      LUNCH_END: 'Retorno',
      BREAK_START: 'Início Pausa',
      BREAK_END: 'Fim Pausa',
      ABSENCE_JUSTIFIED: 'Ausência Justificada',
    };
    return types[type as keyof typeof types] || type;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      ENTRY: <DoorOpen className="w-5 h-5" />,
      EXIT: <DoorClosed className="w-5 h-5" />,
      LUNCH_START: <Utensils className="w-5 h-5" />,
      LUNCH_END: <UtensilsCrossed className="w-5 h-5" />,
      BREAK_START: <Clock className="w-5 h-5" />,
      BREAK_END: <Clock className="w-5 h-5" />,
      ABSENCE_JUSTIFIED: <FileCheck className="w-5 h-5" />,
    };
    return icons[type as keyof typeof icons] || <Clock className="w-5 h-5" />;
  };

  const formatTime = (timestamp: string) => {
    // O timestamp já está em horário de Brasília, então extrair diretamente
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatDate = (timestamp: string) => {
    // O timestamp já está em horário de Brasília, então extrair diretamente
    const date = new Date(timestamp);
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  };

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhum registro encontrado para hoje</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4 border-b-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 text-center">Registros</h2>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="w-full flex-1 flex flex-col">
          <label className="block text-sm font-medium text-gray-700 mb-3">Últimos Registros</label>
          <div className="divide-y divide-gray-200 flex-1">
          {records.map((record) => (
            <div key={record.id} className="p-3 sm:p-4 hover:bg-gray-50 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center h-16 sm:h-12">
                    <div className="text-gray-600 flex-shrink-0">
                      {getTypeIcon(record.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {getTypeLabel(record.type)}
                      </span>
                    </div>
                    
                    {/* Para ausência justificada, mostrar detalhes do atestado */}
                    {record.type === 'ABSENCE_JUSTIFIED' && record.medicalCertificateDetails ? (
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-3 h-3 text-600" />
                          <span>
                            {new Date(record.medicalCertificateDetails.startDate).toLocaleDateString('pt-BR')} - {new Date(record.medicalCertificateDetails.endDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3 h-3 text-600" />
                          <span>{record.medicalCertificateDetails.days} dias</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <User className="w-3 h-3 text-600" />
                          <span>Enviado em {new Date(record.medicalCertificateDetails.submittedAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                        {record.medicalCertificateDetails.description && (
                          <div className="text-gray-500 text-xs mt-1">
                            <strong>Obs:</strong> {record.medicalCertificateDetails.description}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Para outros tipos de registro, mostrar horário, localização e VA/VT */
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-sm text-gray-500">
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
                            {formatTime(record.timestamp)}
                          </span>
                          {record.latitude && record.longitude && (
                            <span className="flex items-center">
                              <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                              <span className="truncate">
                                {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {(record as any).observation && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Observação:</strong> {(record as any).observation}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Câmera e data - lado direito */}
                <div className="flex items-center justify-between sm:justify-end space-x-3">
                  {/* Câmera */}
                  {record.photoUrl && (
                    <button
                      onClick={() => window.open(record.photoUrl, '_blank')}
                      className="p-2 text-gray-400 hover:text-yellow-600 transition-colors rounded-lg hover:bg-yellow-50 flex items-center justify-center flex-shrink-0"
                      title="Ver foto"
                    >
                      <Camera className="w-4 h-4 text-yellow-600" />
                    </button>
                  )}
                  
                  {/* Data */}
                  <div className="text-sm font-medium text-gray-900 flex-shrink-0">
                    {formatDate(record.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          )          )}
          </div>
          {onViewMore && (
            <div className="pt-4 mt-auto">
              <button
                onClick={onViewMore}
                className="w-full h-12 flex items-center justify-center space-x-2 px-4 bg-blue-100 text-blue-700 rounded-lg shadow-sm hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <Eye className="w-4 h-4" />
                <span className="text-sm font-medium">Ver mais</span>
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
