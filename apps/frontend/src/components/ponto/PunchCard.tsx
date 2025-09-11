'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Clock, AlertCircle, DoorOpen, DoorClosed, Utensils, UtensilsCrossed, Camera, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePunchInOut } from '@/hooks/usePunchInOut';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useWebcam } from '@/hooks/useWebcam';
import { TimeRecordType } from '@/types';

interface PunchCardProps {
  onSuccess?: () => void;
}

export const PunchCard: React.FC<PunchCardProps> = ({ onSuccess }) => {
  const [selectedType, setSelectedType] = useState<TimeRecordType>(TimeRecordType.ENTRY);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  const { location, error: locationError, loading: locationLoading } = useGeolocation();
  const { 
    punchInOut, 
    loading: punchLoading, 
    error: punchError 
  } = usePunchInOut();

  const {
    videoRef,
    canvasRef,
    stream,
    error: cameraError,
    isReady: cameraReady,
    startCamera,
    stopCamera,
    capturePhoto,
    cleanup
  } = useWebcam();

  const punchTypes: Array<{ type: TimeRecordType; label: string; icon: React.ReactNode }> = [
    { type: TimeRecordType.ENTRY, label: 'Entrada', icon: <DoorOpen className="w-5 h-5" /> },
    { type: TimeRecordType.LUNCH_START, label: 'Almoço', icon: <Utensils className="w-5 h-5" /> },
    { type: TimeRecordType.LUNCH_END, label: 'Retorno', icon: <UtensilsCrossed className="w-5 h-5" /> },
    { type: TimeRecordType.EXIT, label: 'Saída', icon: <DoorClosed className="w-5 h-5" /> },
  ];

  // Cleanup da câmera quando componente for desmontado
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleTakePhoto = async () => {
    try {
      const photo = await capturePhoto();
      setCapturedPhoto(photo);
      setShowCamera(false);
      stopCamera();
    } catch (error) {
      console.error('Erro ao capturar foto:', error);
    }
  };

  const handleRetakePhoto = () => {
    setCapturedPhoto(null);
    setShowCamera(true);
  };

  const handleOpenCamera = async () => {
    setShowCamera(true);
    try {
      await startCamera();
    } catch (error) {
      console.error('Erro ao iniciar câmera:', error);
    }
  };

  const handleCloseCamera = () => {
    setShowCamera(false);
    stopCamera();
  };

  const handlePunch = async () => {
    if (!capturedPhoto) {
      alert('Por favor, tire uma foto antes de bater o ponto');
      return;
    }

    try {
      await punchInOut({
        type: selectedType,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        photo: capturedPhoto,
      } as any);
      
      setCapturedPhoto(null);
      onSuccess?.();
    } catch (error) {
      console.error('Erro ao bater ponto:', error);
    }
  };

  const getLocationStatus = () => {
    if (locationLoading) return { text: 'Obtendo localização...', variant: 'info' as const };
    if (locationError) return { text: 'Localização não disponível - ponto será registrado sem localização', variant: 'warning' as const };
    if (location) return { text: 'Localização registrada', variant: 'success' as const };
    return { text: 'Aguardando localização...', variant: 'info' as const };
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
                    p-4 rounded-lg border-2 transition-all text-center
                    ${selectedType === punchType.type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <div className="text-gray-600">
                      {punchType.icon}
                    </div>
                    <span className="font-medium text-gray-900">{punchType.label}</span>
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

          {/* Seção de Foto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Foto do Funcionário
            </label>
            
            {!capturedPhoto && !showCamera && (
              <div className="flex justify-center">
                <Button
                  onClick={handleOpenCamera}
                  variant="outline"
                  className="w-full max-w-xs"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Tirar Foto
                </Button>
              </div>
            )}

            {showCamera && (
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-64 object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                      <div className="text-white text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                        <p>Iniciando câmera...</p>
                      </div>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center space-x-2 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">{cameraError}</span>
                    </div>
                  </div>
                )}

                <div className="flex space-x-3">
                  <Button
                    onClick={handleTakePhoto}
                    disabled={!cameraReady}
                    className="flex-1"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Capturar Foto
                  </Button>
                  <Button
                    onClick={handleCloseCamera}
                    variant="outline"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {capturedPhoto && (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={capturedPhoto}
                    alt="Foto capturada"
                    className="w-full max-w-sm mx-auto rounded-lg border"
                  />
                  <Badge variant="success" className="absolute top-2 right-2">
                    Foto Capturada
                  </Badge>
                </div>
                <div className="flex justify-center">
                  <Button
                    onClick={handleRetakePhoto}
                    variant="outline"
                    size="sm"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Tirar Nova Foto
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Botão de Confirmar */}
          <div className="pt-4">
            <Button
              onClick={handlePunch}
              loading={punchLoading}
              disabled={!location || !!locationError || !capturedPhoto}
              className="w-full"
              size="lg"
            >
              <Clock className="w-4 h-4 mr-2" />
              Bater Ponto - {punchTypes.find(p => p.type === selectedType)?.label}
            </Button>

            {!capturedPhoto && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-2 text-yellow-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">Tire uma foto antes de bater o ponto</span>
                </div>
              </div>
            )}

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
