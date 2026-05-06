import { useState, useEffect } from 'react';

interface GeolocationState {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export const useGeolocation = () => {
  const [location, setLocation] = useState<GeolocationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verifica se está em HTTPS ou localhost
  const isSecureContext = () => {
    return window.isSecureContext || 
           window.location.protocol === 'https:' || 
           window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1';
  };

  const getCurrentPosition = () => {
    // Verificar se o navegador suporta geolocalização
    if (!navigator.geolocation) {
      setError('Geolocalização não é suportada neste navegador');
      setLoading(false);
      return;
    }

    // Verificar se está em contexto seguro (HTTPS ou localhost)
    if (!isSecureContext()) {
      setError('Geolocalização requer HTTPS. Por favor, acesse o site via HTTPS.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Primeiro, verificar permissões usando Permissions API se disponível
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'denied') {
          setError('Permissão de localização negada. Por favor, permita o acesso à localização nas configurações do navegador.');
          setLoading(false);
          return;
        }
        
        // Se a permissão foi negada, tentar mesmo assim (pode ser prompt)
        requestLocation();
      }).catch(() => {
        // Se a API de permissões não funcionar, tentar mesmo assim
        requestLocation();
      });
    } else {
      // Se a API de permissões não estiver disponível, tentar diretamente
      requestLocation();
    }

    function requestLocation() {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
          setLoading(false);
          setError(null);
        },
        (error) => {
          let errorMessage = 'Erro ao obter localização';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Permissão de localização negada. Por favor, permita o acesso à localização nas configurações do navegador e recarregue a página.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Localização indisponível. Verifique se o GPS está ativado e tente novamente.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Timeout ao obter localização. Verifique sua conexão e tente novamente.';
              break;
            default:
              errorMessage = `Erro ao obter localização: ${error.message || 'Erro desconhecido'}`;
          }
          
          setError(errorMessage);
          setLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // Aumentado para 15 segundos
          maximumAge: 300000, // 5 minutos
        }
      );
    }
  };

  useEffect(() => {
    getCurrentPosition();
  }, []);

  return {
    location,
    loading,
    error,
    refetch: getCurrentPosition,
  };
};
