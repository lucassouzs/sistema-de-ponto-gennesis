import api from '@/lib/api';

export type FluigApproverViewer = {
  id: string;
  userId: string;
  approverNameKey: string;
  approverName: string;
  user: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl?: string | null;
  };
};

export async function fetchFluigApproverViewers(nameKey: string): Promise<FluigApproverViewer[]> {
  const res = await api.get(`/fluig/aprovadores/${encodeURIComponent(nameKey)}/viewers`);
  return res.data?.data ?? [];
}

export async function fetchAllFluigApproverViewerKeys(): Promise<{
  byApprover: Record<string, string[]>;
  fullAccessUserIds: string[];
}> {
  const res = await api.get('/fluig/aprovadores/viewers');
  return {
    byApprover: res.data?.data ?? {},
    fullAccessUserIds: res.data?.fullAccessUserIds ?? [],
  };
}

export async function addFluigApproverViewer(
  nameKey: string,
  userId: string,
  approverName: string
): Promise<FluigApproverViewer> {
  const res = await api.post(`/fluig/aprovadores/${encodeURIComponent(nameKey)}/viewers`, {
    userId,
    approverName,
  });
  return res.data?.data;
}

export async function removeFluigApproverViewer(nameKey: string, userId: string): Promise<void> {
  await api.delete(`/fluig/aprovadores/${encodeURIComponent(nameKey)}/viewers/${encodeURIComponent(userId)}`);
}
