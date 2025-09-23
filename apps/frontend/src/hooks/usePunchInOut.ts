import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import { TimeRecordFormData } from '@/types';

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  return file;
}

export const usePunchInOut = () => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: TimeRecordFormData) => {
      const formData = new FormData();
      formData.append('type', data.type);
      
      if (data.latitude) {
        formData.append('latitude', data.latitude.toString());
      }
      if (data.longitude) {
        formData.append('longitude', data.longitude.toString());
      }
      if (data.photo) {
        if (typeof data.photo === 'string') {
          const file = await dataUrlToFile(data.photo, `punch-${Date.now()}.jpg`);
          formData.append('photo', file);
        } else {
          formData.append('photo', data.photo);
        }
      }
      formData.append('observation', data.observation || '');

      const response = await api.post('/time-records/punch', formData);
      return response.data;
    },
    onSuccess: (data) => {
      setError(null);
      toast.success('Ponto registrado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['time-records'] });
      queryClient.invalidateQueries({ queryKey: ['today-records'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Erro ao registrar ponto';
      setError(errorMessage);
      toast.error(errorMessage);
    },
  });

  return {
    punchInOut: mutation.mutateAsync,
    loading: mutation.isPending,
    error,
    data: mutation.data,
  };
};
