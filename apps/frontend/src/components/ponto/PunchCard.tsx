'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Clock, AlertCircle, DoorOpen, DoorClosed, Utensils, UtensilsCrossed, Camera, X, RotateCcw, CheckCircle, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePunchInOut } from '@/hooks/usePunchInOut';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useWebcam } from '@/hooks/useWebcam';
import { TimeRecordType } from '@/types';
import api from '@/lib/api';

interface PunchCardProps {
  onSuccess?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

export const PunchCard: React.FC<PunchCardProps> = ({ onSuccess, showCloseButton = false, onClose }) => {
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [lastRecord, setLastRecord] = useState<TimeRecordType | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [observation, setObservation] = useState('');
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [allPointsCompleted, setAllPointsCompleted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [punchData, setPunchData] = useState<{ type: TimeRecordType; timestamp: Date } | null>(null);
  
  const { location, error: locationError, loading: locationLoading, refetch: refetchLocation } = useGeolocation();
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

  // Função para determinar o próximo tipo de ponto baseado nos registros do dia
  const getNextPunchType = (): TimeRecordType => {
    // Se não há registros hoje, começar com entrada
    if (!todayRecords || todayRecords.length === 0) {
      return TimeRecordType.ENTRY;
    }

    // Verificar quais tipos já foram registrados hoje
    const hasEntry = todayRecords.some(r => r.type === TimeRecordType.ENTRY);
    const hasLunchStart = todayRecords.some(r => r.type === TimeRecordType.LUNCH_START);
    const hasLunchEnd = todayRecords.some(r => r.type === TimeRecordType.LUNCH_END);
    const hasExit = todayRecords.some(r => r.type === TimeRecordType.EXIT);

    // Determinar o próximo ponto baseado no que falta
    if (!hasEntry) return TimeRecordType.ENTRY;
    if (!hasLunchStart) return TimeRecordType.LUNCH_START;
    if (!hasLunchEnd) return TimeRecordType.LUNCH_END;
    if (!hasExit) return TimeRecordType.EXIT;

    // Se todos foram registrados, retornar entrada (próximo dia)
    return TimeRecordType.ENTRY;
  };

  const selectedType = getNextPunchType();

  // Função para verificar se todos os 4 pontos foram batidos ou se há ausência justificada
  const checkAllPointsCompleted = (records: any[]) => {
    const hasEntry = records.some(r => r.type === TimeRecordType.ENTRY);
    const hasLunchStart = records.some(r => r.type === TimeRecordType.LUNCH_START);
    const hasLunchEnd = records.some(r => r.type === TimeRecordType.LUNCH_END);
    const hasExit = records.some(r => r.type === TimeRecordType.EXIT);
    const hasAbsenceJustified = records.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
    
    // Se há ausência justificada, considerar como "completo" (não pode bater ponto)
    if (hasAbsenceJustified) {
      return true;
    }
    
    return hasEntry && hasLunchStart && hasLunchEnd && hasExit;
  };

  // Atualizar horário atual a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Buscar registros do usuário para hoje
  useEffect(() => {
    const fetchTodayRecords = async () => {
      try {
        const response = await api.get('/time-records/my-records/today');
        const records = response.data.data?.records || [];
        
        setTodayRecords(records);
        
        if (records.length > 0) {
          // Ordenar por data/hora e pegar o último registro
          const sortedRecords = records.sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          const lastRecordType = sortedRecords[0].type;
          setLastRecord(lastRecordType);
          console.log('Último registro encontrado:', lastRecordType);
        } else {
          setLastRecord(null);
          console.log('Nenhum registro encontrado para hoje');
        }
        
        // Verificar se todos os 4 pontos foram batidos
        const completed = checkAllPointsCompleted(records);
        setAllPointsCompleted(completed);
        
      } catch (error) {
        console.error('Erro ao buscar registros:', error);
        setLastRecord(null);
        setTodayRecords([]);
        setAllPointsCompleted(false);
      }
    };

    fetchTodayRecords();
  }, []);

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
      const now = new Date();
      await punchInOut({
        type: selectedType,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        photo: capturedPhoto,
        observation: observation.trim(),
      } as any);
      
      // Salvar dados do ponto batido para o modal de confirmação
      console.log('Ponto batido com sucesso, mostrando modal de confirmação');
      setPunchData({ type: selectedType, timestamp: now });
      setShowSuccessModal(true);
      console.log('Estado atualizado - showSuccessModal:', true, 'punchData:', { type: selectedType, timestamp: now });
      
      // Atualizar o último registro para o próximo tipo
      setLastRecord(selectedType);
      setCapturedPhoto(null);
      setObservation('');
      
      // Atualizar registros e verificar se todos os pontos foram completados
      const updatedRecords = [...todayRecords, { type: selectedType, timestamp: now }];
      setTodayRecords(updatedRecords);
      const completed = checkAllPointsCompleted(updatedRecords);
      setAllPointsCompleted(completed);
      
      // Chamar callbacks de sucesso
      onSuccess?.();
      
      // NÃO fechar o modal aqui - deixar o modal de confirmação aparecer
    } catch (error) {
      console.error('Erro ao bater ponto:', error);
    }
  };

  // Função para gerar comprovante em imagem
  const generateComprovante = () => {
    if (!punchData) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;

    // Fundo branco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Borda superior vermelha
    ctx.fillStyle = '#ce3736';
    ctx.fillRect(0, 0, width, 100);

    // Carregar e desenhar logo branca
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    
    return new Promise<void>((resolve) => {
      const drawImage = () => {
        // Logo branca (ajustar tamanho conforme necessário)
        const logoSize = 50;
        const logoX = 40;
        const logoY = 25;
        
        if (logo.complete && logo.naturalWidth > 0) {
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        }

        // Título - alinhado à esquerda após a logo
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const titleX = logoX + logoSize + 20;
        const titleY = 30;
        ctx.fillText('COMPROVANTE DE PONTO', titleX, titleY);

        // Data e hora do comprovante - alinhado abaixo do título
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, titleX, titleY + 35);

        // Conteúdo principal
        let y = 150;

        // Tipo de ponto
        const typeLabels: Record<TimeRecordType, string> = {
          [TimeRecordType.ENTRY]: 'ENTRADA',
          [TimeRecordType.EXIT]: 'SAÍDA',
          [TimeRecordType.LUNCH_START]: 'INÍCIO DO ALMOÇO',
          [TimeRecordType.LUNCH_END]: 'RETORNO DO ALMOÇO',
          [TimeRecordType.BREAK_START]: 'INÍCIO DO INTERVALO',
          [TimeRecordType.BREAK_END]: 'FIM DO INTERVALO',
          [TimeRecordType.ABSENCE_JUSTIFIED]: 'AUSÊNCIA JUSTIFICADA',
        };

        ctx.fillStyle = '#1F2937';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(typeLabels[punchData.type], width / 2, y);
        y += 60;

        // Data
        const dateStr = punchData.timestamp.toLocaleDateString('pt-BR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        ctx.fillStyle = '#4B5563';
        ctx.font = '20px Arial';
        ctx.fillText(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), width / 2, y);
        y += 50;

        // Horário
        const timeStr = punchData.timestamp.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        ctx.fillStyle = '#DC2626';
        ctx.font = 'bold 48px Arial';
        ctx.fillText(timeStr, width / 2, y);
        y += 100;

        // Linha divisória
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(width - 50, y);
        ctx.stroke();
        y += 40;

        // Informações adicionais
        ctx.fillStyle = '#6B7280';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Este comprovante é válido como registro de ponto.', 50, y);
        y += 30;
        ctx.fillText('Guarde este documento para seus registros.', 50, y);
        y += 30;
        ctx.fillText('Em caso de dúvidas, entre em contato com o Departamento Pessoal.', 50, y);

        // Rodapé
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Gennesis Attendance - Sistema de Controle de Ponto', width / 2, height - 30);

        // Converter para imagem e fazer download
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve();
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const fileName = `Comprovante_${typeLabels[punchData.type]}_${punchData.timestamp.toISOString().split('T')[0]}_${punchData.timestamp.toTimeString().split(' ')[0].replace(/:/g, '-')}.png`;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve();
        }, 'image/png');
      };

      logo.onload = drawImage;
      logo.onerror = () => {
        // Se a logo não carregar, desenhar sem ela
        drawImage();
      };
      logo.src = '/logobranca.png';
      
      // Timeout de segurança
      setTimeout(() => {
        if (!logo.complete) {
          drawImage();
        }
      }, 2000);
    });
  };

  const getLocationStatus = () => {
    if (locationLoading) return { text: 'Obtendo localização...', variant: 'info' as const };
    if (locationError) return { text: 'Localização não disponível - ponto será registrado sem localização', variant: 'warning' as const };
    if (location) return { text: 'Localização registrada', variant: 'success' as const };
    return { text: 'Aguardando localização...', variant: 'info' as const };
  };

  const locationStatus = getLocationStatus();

  return (
    <div className="w-full max-w-sm mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
      <div className="p-5 space-y-5">
        {/* Header minimalista */}
        <div className="relative text-center">
          {showCloseButton && onClose && (
            <button
              onClick={onClose}
              className="absolute top-0 right-0 p-1.5 hover:bg-gray-50 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {punchTypes.find(p => p.type === selectedType)?.label}
            </h2>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {currentTime.toLocaleDateString('pt-BR', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              }).replace(/^\w/, c => c.toUpperCase())}
            </div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 tracking-wide">
              {currentTime.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
          </div>
        </div>

          {allPointsCompleted ? (
            // Verificar se é ausência justificada ou todos os pontos batidos
            (() => {
              const hasAbsenceJustified = todayRecords.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
              
              if (hasAbsenceJustified) {
                return (
                  <div className="text-center space-y-4">
                    <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                          <Clock className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-blue-800 mb-2">
                            Ausência Justificada
                          </h3>
                          <p className="text-blue-700 text-sm">
                            Você possui ausência justificada para hoje. Não é necessário bater ponto.
                          </p>
                          <p className="text-blue-600 text-sm mt-2 font-medium">
                            Você poderá bater ponto novamente amanhã.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="text-center space-y-4">
                    <div className="p-6 bg-green-50 border-2 border-green-200 rounded-lg">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                          <Clock className="w-8 h-8 text-green-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-green-800 mb-2">
                            Parabéns! Todos os pontos foram batidos hoje
                          </h3>
                          <p className="text-green-700 text-sm">
                            Você completou todos os 4 registros obrigatórios: Entrada, Almoço, Retorno e Saída.
                          </p>
                          <p className="text-green-600 text-sm mt-2 font-medium">
                            Você poderá bater ponto novamente amanhã.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-center space-x-2 text-blue-700">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Próximo ponto: Entrada (amanhã)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
            })()
          ) : (
            // Mostrar o formulário normal quando ainda há pontos para bater
            <>


            {/* Status da Localização */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Localização</p>
                  {!location && (
                    <Badge variant={locationStatus.variant} size="sm" className="mt-1">
                      {locationStatus.text}
                    </Badge>
                  )}
                </div>
                {location && (
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </div>
                )}
              </div>
              {locationError && (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {locationError}
                  </p>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p className="font-medium">Dicas para resolver:</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                      <li>Verifique se o site está acessível via HTTPS</li>
                      <li>Permita o acesso à localização nas configurações do navegador</li>
                      <li>Verifique se o GPS está ativado (em dispositivos móveis)</li>
                      <li>Recarregue a página após permitir a localização</li>
                    </ul>
                  </div>
                  <Button
                    onClick={refetchLocation}
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Tentar novamente
                  </Button>
                </div>
              )}
            </div>

            {/* Seção de Foto */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Foto do Funcionário *
              </label>
              
              {!capturedPhoto && !showCamera && (
                <button
                  onClick={handleOpenCamera}
                  className="w-full p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <Camera className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Tirar Foto</span>
                  </div>
                </button>
              )}

              {showCamera && (
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-48 object-cover"
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
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                            Erro ao acessar a câmera
                          </p>
                          <p className="text-sm text-red-700 dark:text-red-400 mb-3">{cameraError}</p>
                          <div className="mt-3 text-xs text-red-600 dark:text-red-400 mb-3">
                            <p className="font-medium mb-1">Como resolver:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                              <li>Verifique se permitiu o acesso à câmera no navegador</li>
                              <li>Feche outros aplicativos que possam estar usando a câmera</li>
                              <li>Recarregue a página e tente novamente</li>
                              <li>Verifique se há uma câmera conectada ao computador</li>
                            </ul>
                          </div>
                          <Button
                            onClick={async () => {
                              stopCamera();
                              await new Promise(resolve => setTimeout(resolve, 500));
                              await startCamera();
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Tentar Novamente
                          </Button>
                        </div>
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
                      className="w-full h-56 object-cover rounded-lg border mx-auto max-w-sm"
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

            {/* Campo de Observação */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Observação (Opcional)
              </label>
              <textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Digite uma observação..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                rows={2}
                maxLength={500}
              />
              <div className="text-right text-xs text-gray-400 dark:text-gray-500">
                {observation.length}/500
              </div>
            </div>

            {/* Botão de Confirmar */}
            <button
              onClick={handlePunch}
              disabled={punchLoading || !capturedPhoto}
              className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center space-x-2 ${
                punchLoading || !capturedPhoto
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {punchLoading ? 'Registrando...' : `Confirmar ${punchTypes.find(p => p.type === selectedType)?.label}`}
              </span>
            </button>

            {punchError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">{punchError}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Confirmação de Ponto Batido - Renderizado via Portal */}
      {showSuccessModal && punchData && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
            <div className="p-6 space-y-4">
              {/* Ícone de sucesso */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </div>

              {/* Título */}
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Ponto Registrado com Sucesso!
                </h3>
              </div>

              {/* Informações do ponto */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tipo:</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {punchTypes.find(p => p.type === punchData.type)?.label}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Data:</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {punchData.timestamp.toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }).replace(/^\w/, c => c.toUpperCase())}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Horário:</span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {punchData.timestamp.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
              </div>

              {/* Botões */}
              <div className="flex flex-col space-y-2">
                <button
                  onClick={generateComprovante}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Download className="w-5 h-5" />
                  <span>Salvar Comprovante</span>
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    setPunchData(null);
                    if (onClose) {
                      onClose();
                    }
                  }}
                  className="w-full py-3 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
