import React from 'react';
import { Clock, MapPin, Camera, CheckCircle, XCircle, DoorOpen, DoorClosed, Utensils, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TimeRecord } from '@/types';

interface TimeRecordsListProps {
  records: TimeRecord[];
}

export const TimeRecordsList: React.FC<TimeRecordsListProps> = ({ records }) => {
  const getTypeLabel = (type: string) => {
    const types = {
      ENTRY: 'Entrada',
      EXIT: 'Saída',
      LUNCH_START: 'Almoço',
      LUNCH_END: 'Retorno',
      BREAK_START: 'Início Pausa',
      BREAK_END: 'Fim Pausa',
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
    };
    return icons[type as keyof typeof icons] || <Clock className="w-5 h-5" />;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200">
          {records.map((record) => (
            <div key={record.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-gray-600">
                    {getTypeIcon(record.type)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {getTypeLabel(record.type)}
                      </span>
                      <Badge 
                        variant={record.isValid ? 'success' : 'error'}
                        size="sm"
                      >
                        {record.isValid ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Válido
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1" />
                            Inválido
                          </>
                        )}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTime(record.timestamp)}
                      </span>
                      {record.latitude && record.longitude && (
                        <span className="flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          Localizado
                        </span>
                      )}
                      {record.photoUrl && (
                        <span className="flex items-center">
                          <Camera className="w-3 h-3 mr-1" />
                          Foto
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(record.timestamp)}
                  </div>
                  {record.reason && (
                    <div className="text-xs text-red-600 mt-1">
                      {record.reason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
