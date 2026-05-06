import { useRef, useState, useCallback } from 'react';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export const useWebcam = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  const stopTracks = (s?: MediaStream | null) => {
    try { s?.getTracks().forEach(t => t.stop()); } catch {}
  };

  const waitForVideoReady = useCallback(async (video: HTMLVideoElement, timeoutMs: number = 7000): Promise<void> => {
    const start = Date.now();
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const ready = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
        if (ready) {
          setIsReady(true);
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          setIsReady(false);
          reject(new Error('Câmera não ficou pronta a tempo. Verifique permissões e tente novamente.'));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }, []);

  const startWithConstraints = async (constraints: MediaStreamConstraints): Promise<boolean> => {
    try {
      // Verificar se o navegador suporta getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Seu navegador não suporta acesso à câmera. Use Chrome, Firefox, Edge ou Safari.');
        return false;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('Nenhuma trilha de vídeo disponível.');

      stopTracks(streamRef.current);
      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (!videoRef.current) return false;
      const video = videoRef.current;
      video.srcObject = mediaStream;
      video.muted = true;
      (video as any).playsInline = true;

      try { await video.play(); } catch {}
      try {
        await waitForVideoReady(video, 5000);
        return true;
      } catch {
        return false;
      }
    } catch (err: any) {
      // Tratar diferentes tipos de erros
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Permissão de câmera negada. Por favor, permita o acesso à câmera nas configurações do navegador e tente novamente.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('Nenhuma câmera encontrada. Verifique se há uma câmera conectada ao computador.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('A câmera está sendo usada por outro aplicativo. Feche outros programas que usam a câmera e tente novamente.');
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        // Continuar tentando outras estratégias
        return false;
      } else if (err.name === 'NotSupportedError') {
        setError('Acesso à câmera não é suportado neste navegador. Use Chrome, Firefox, Edge ou Safari.');
      } else {
        // Para outros erros, continuar tentando
        return false;
      }
      return false;
    }
  };

  const startCamera = useCallback(async (options?: { deviceId?: string; facingMode?: 'user' | 'environment' }) => {
    setError(null);
    setIsReady(false);

    // Verificar se o navegador suporta mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Seu navegador não suporta acesso à câmera. Use Chrome, Firefox, Edge ou Safari.');
      return;
    }

    // Verificar se há permissão antes de tentar (apenas se o navegador suportar)
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (permissionStatus.state === 'denied') {
          setError('Permissão de câmera negada. Por favor, permita o acesso à câmera nas configurações do navegador e recarregue a página.');
          return;
        }
      }
    } catch {
      // Se o navegador não suporta permissions API, continuar normalmente
    }

    // Estratégias em ordem: facingMode user -> genérico -> primeiro deviceId disponível -> facingMode environment (fallback final)
    const strategies: MediaStreamConstraints[] = [];
    if (options?.deviceId) {
      strategies.push({ video: { deviceId: { exact: options.deviceId } } as any, audio: false });
    } else if (options?.facingMode) {
      strategies.push({ video: { facingMode: { ideal: options.facingMode } } as any, audio: false });
    } else {
      strategies.push({ video: { facingMode: { ideal: 'user' } } as any, audio: false });
    }
    strategies.push({ video: true, audio: false });

    try {
      // tentar com primeiro deviceId disponível
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if (videoInputs.length > 0) {
        strategies.push({ video: { deviceId: { exact: videoInputs[0].deviceId } } as any, audio: false });
      }
    } catch {}

    strategies.push({ video: { facingMode: { ideal: 'environment' } } as any, audio: false });

    // Executar estratégias
    for (const constraints of strategies) {
      const ok = await startWithConstraints(constraints);
      if (ok) {
        setError(null);
        return;
      }
      // se falhou, para possíveis streams antes de tentar próximo
      stopTracks(streamRef.current);
      streamRef.current = null;
      setStream(null);
    }

    // Se nenhuma estratégia funcionou e não há erro específico já definido, mostrar mensagem genérica
    setError(prevError => {
      if (prevError) {
        return prevError; // Manter erro específico se já foi definido
      }
      return 'Não foi possível iniciar a câmera. Verifique permissões, feche apps que usam a câmera e tente novamente.';
    });
  }, [waitForVideoReady]);

  const stopCamera = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setIsReady(false);
  }, []);

  const capturePhoto = useCallback(async (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      if (!videoRef.current || !canvasRef.current) {
        const e = new Error('Elementos de vídeo ou canvas não encontrados');
        setError(e.message);
        reject(e);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        const e = new Error('Contexto do canvas não encontrado');
        setError(e.message);
        reject(e);
        return;
      }

      try { if (video.paused) { await video.play(); } } catch {}
      try { await waitForVideoReady(video, 4000); } catch (e: any) { setError(e.message); return reject(e); }

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const photoData = canvas.toDataURL('image/jpeg', 0.9);
      setError(null);
      resolve(photoData);
    });
  }, [waitForVideoReady]);

  const cleanup = useCallback(() => {
    stopCamera();
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    stream,
    error,
    isReady,
    startCamera,
    stopCamera,
    capturePhoto,
    cleanup,
  };
};
