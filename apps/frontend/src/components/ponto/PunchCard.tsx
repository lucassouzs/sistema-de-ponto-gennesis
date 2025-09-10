'use client';

import React, { useState } from 'react';
import { MapPin, Clock, AlertCircle, DoorOpen, DoorClosed, Utensils, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePunchInOut } from '@/hooks/usePunchInOut';
import { useGeolocation } from '@/hooks/useGeolocation';
import { TimeRecordType } from '@/types';

interface PunchCardProps {
  onSuccess?: () => void;
}

export const PunchCard: React.FC<PunchCardProps> = ({ onSuccess }) => {
  const [selectedType, setSelectedType] = useState<TimeRecordType>(TimeRecordType.ENTRY);
  
  const { location, error: locationError, loading: locationLoading } = useGeolocation();
  const { 
    punchInOut, 
    loading: punchLoading, 
    error: punchError 
  } = usePunchInOut();

  const punchTypes: Array<{ type: TimeRecordType; label: string; icon: React.ReactNode }> = [
    { type: TimeRecordType.ENTRY, label: 'Entrada', icon: <DoorOpen className="w-5 h-5" /> },
    { type: TimeRecordType.LUNCH_START, label: 'Almoço', icon: <Utensils className="w-5 h-5" /> },
    { type: TimeRecordType.LUNCH_END, label: 'Retorno', icon: <UtensilsCrossed className="w-5 h-5" /> },
    { type: TimeRecordType.EXIT, label: 'Saída', icon: <DoorClosed className="w-5 h-5" /> },
  ];

  const handlePunch = async () => {
    if (!location) {
      alert('Não foi possível obter sua localização');
      return;
    }

    try {
      await punchInOut({
        type: selectedType,
        latitude: location.latitude,
        longitude: location.longitude,
      } as any);
      
      onSuccess?.();
    } catch (error) {
      console.error('Erro ao bater ponto:', error);
    }
  };

  const getLocationStatus = () => {
    if (locationLoading) return { text: 'Obtendo localização...', variant: 'info' as const };
    if (locationError) return { text: 'Erro na localização', variant: 'error' as const };
    if (location) return { text: 'Localização obtida', variant: 'success' as const };
    return { text: 'Aguardando localização', variant: 'warning' as const };
  };

  const locationStatus = getLocationStatus();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardContent>
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Bater Ponto
            </h2>
            <p className="text-gray-600">
              Temporariamente sem foto; a captura será reativada depois
            </p>
          </div>

          {/* Tipo de Ponto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Tipo de Registro
            </label>
            <div className="grid grid-cols-2 gap-3">
              {punchTypes.map((punchType) => (
                <button
                  key={punchType.type}
                  onClick={() => setSelectedType(punchType.type)}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left
                    ${selectedType === punchType.type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex items-center space-x-3">
                    {punchType.icon}
                    <span className="font-medium">{punchType.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Status da Localização */}
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <MapPin className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">Localização</p>
              <Badge variant={locationStatus.variant} size="sm">
                {locationStatus.text}
              </Badge>
            </div>
            {location && (
              <div className="text-xs text-gray-500">
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </div>
            )}
          </div>

          {/* Botão de Confirmar */}
          <div className="pt-4">
            <Button
              onClick={handlePunch}
              loading={punchLoading}
              disabled={!location || !!locationError}
              className="w-full"
              size="lg"
            >
              <Clock className="w-4 h-4 mr-2" />
              Bater Ponto - {punchTypes.find(p => p.type === selectedType)?.label}
            </Button>

            {punchError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{punchError}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
