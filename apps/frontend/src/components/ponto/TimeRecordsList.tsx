import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Camera, DoorOpen, DoorClosed, Utensils, UtensilsCrossed, Eye, FileCheck, Calendar, User } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TimeRecord, TimeRecordWithDetails } from '@/types';

interface TimeRecordsListProps {
  records: TimeRecordWithDetails[];
  onViewMore?: () => void;
}

export const TimeRecordsList: React.FC<TimeRecordsListProps> = ({ records, onViewMore }) => {
  const [isMobile, setIsMobile] = useState(false);

  // Obter data atual formatada
  const getCurrentDate = () => {
    const today = new Date();
    return today.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).replace(/^\w/, c => c.toUpperCase());
  };

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);
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
    // Banco salva em UTC, usar getUTC para ler o valor correto
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatDate = (timestamp: string) => {
    // O timestamp já está em horário local, então extrair diretamente
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Definir os tipos de registro esperados para o dia
  const expectedRecords = [
    { type: 'ENTRY', label: 'Entrada', icon: <DoorOpen className="w-5 h-5" /> },
    { type: 'LUNCH_START', label: 'Almoço', icon: <Utensils className="w-5 h-5" /> },
    { type: 'LUNCH_END', label: 'Retorno', icon: <UtensilsCrossed className="w-5 h-5" /> },
    { type: 'EXIT', label: 'Saída', icon: <DoorClosed className="w-5 h-5" /> },
  ];

  // Se não há registros, mostrar os tipos esperados com --:--
  if (records.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-4 border-b-0 pt-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center">Registros</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">{getCurrentDate()}</p>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {expectedRecords.map((record) => (
              <div key={record.type} className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg text-center">
                <div className="text-gray-400 dark:text-gray-500 mb-1 sm:mb-2 text-sm sm:text-base">{record.icon}</div>
                <div className="text-sm sm:text-lg font-semibold text-gray-400 dark:text-gray-500">--:--:--</div>
              </div>
            ))}
          </div>
        </CardContent>
        
        {onViewMore && (
          <div className="pt-4 px-6 pb-6">
            <button
              onClick={onViewMore}
              className="w-full h-12 flex items-center justify-center space-x-2 px-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg shadow-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span className="text-sm font-medium">Ver mais</span>
            </button>
          </div>
        )}
      </Card>
    );
  }

  // Criar lista completa com registros existentes e faltantes
  const completeRecordsList = expectedRecords.map(expectedRecord => {
    const existingRecord = records.find(record => record.type === expectedRecord.type);
    
    if (existingRecord) {
      return {
        ...expectedRecord,
        timestamp: existingRecord.timestamp,
        hasRecord: true
      };
    } else {
      return {
        ...expectedRecord,
        timestamp: null,
        hasRecord: false
      };
    }
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4 border-b-0 pt-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center">Registros</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">{getCurrentDate()}</p>
      </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {completeRecordsList.map((record) => (
              <div key={record.type} className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg text-center">
                <div className={`mb-1 sm:mb-2 text-sm sm:text-base ${record.hasRecord ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  {record.icon}
                </div>
                <div className={`text-sm sm:text-lg font-semibold ${record.hasRecord ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                  {record.hasRecord && record.timestamp ? formatTime(record.timestamp) : '--:--:--'}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        
        {onViewMore && (
          <div className="pt-4 px-6 pb-6">
            <button
              onClick={onViewMore}
              className="w-full h-12 flex items-center justify-center space-x-2 px-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg shadow-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span className="text-sm font-medium">Ver mais</span>
            </button>
          </div>
        )}
    </Card>
  );
};
