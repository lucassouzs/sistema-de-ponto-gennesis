import api from './api';

export type RmMaterialListItem = {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  unit?: string;
  /** Produto ou Serviço (cadastro em materiais de construção). */
  productType?: string | null;
  /** Média ponderada das últimas 10 compras efetivas. */
  avgPaidUnitPrice?: number | null;
  medianPrice?: number | null;
};

export function getRmMaterialLabel(material?: RmMaterialListItem | null): string {
  const name = material?.name?.trim() || material?.description?.trim() || '';
  const code = material?.code?.trim() || '';
  if (code && name && code !== name) return `${code} — ${name}`;
  if (name) return name;
  if (code) return code;
  return 'Material sem nome';
}

/** True quando o item do catálogo é Serviço. */
export function isRmServiceMaterial(
  material?: Pick<RmMaterialListItem, 'productType'> | null
): boolean {
  const v = (material?.productType || '').trim().toLowerCase();
  return (
    v === 'serviço' ||
    v === 'servico' ||
    v === 'service' ||
    v === 'serviços' ||
    v === 'servicos'
  );
}

/** Busca materiais para RM (IDs de engenharia); mínimo 2 caracteres. */
export async function searchRmMaterials(search: string, limit = 50): Promise<RmMaterialListItem[]> {
  const term = search.trim();
  if (term.length < 2) return [];

  const res = await api.get('/material-requests/materials', {
    params: { search: term, limit },
  });

  return res.data?.data ?? [];
}
