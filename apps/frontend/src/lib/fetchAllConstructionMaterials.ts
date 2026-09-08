import api from './api';

export type ConstructionMaterialListItem = {
  id: string;
  name: string;
  unit: string;
  code?: string | null;
  sinapiCode?: string | null;
  productType?: string | null;
  category?: string | null;
  isActive?: boolean;
};

const PAGE_SIZE = 100;

/** A API limita 100 por página; esta função busca todas as páginas. */
export async function fetchAllConstructionMaterials(params?: {
  isActive?: boolean;
  search?: string;
}): Promise<ConstructionMaterialListItem[]> {
  const all: ConstructionMaterialListItem[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await api.get('/construction-materials', {
      params: {
        page,
        limit: PAGE_SIZE,
        search: params?.search || undefined,
        isActive: params?.isActive !== undefined ? String(params.isActive) : undefined,
      },
    });

    const batch: ConstructionMaterialListItem[] = res.data?.data ?? [];
    all.push(...batch);
    totalPages = res.data?.pagination?.totalPages ?? 1;
    page += 1;
  }

  return all;
}

/** Busca paginada no servidor (até `limit` itens) — use em dropdowns com pesquisa assíncrona. */
export async function searchConstructionMaterials(
  search: string,
  limit = 50
): Promise<ConstructionMaterialListItem[]> {
  const term = search.trim();
  if (term.length < 2) return [];

  const res = await api.get('/construction-materials', {
    params: {
      page: 1,
      limit,
      search: term,
      isActive: 'true',
    },
  });

  return res.data?.data ?? [];
}

/** Extrai ID de Materiais e Serviços a partir do sinapiCode espelho (CM-{id}). */
export function constructionMaterialIdFromSinapiCode(sinapiCode?: string | null): string {
  if (!sinapiCode?.startsWith('CM-')) return '';
  return sinapiCode.slice(3).trim();
}

export type ResolvedConstructionMaterial = { id: string; name: string };

/** Resolve poucos nomes exatos para movimentação de estoque (sem carregar o catálogo inteiro). */
export async function resolveConstructionMaterialsByNames(
  names: string[]
): Promise<ResolvedConstructionMaterial[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (unique.length === 0) return [];

  const res = await api.post('/construction-materials/resolve-by-names', { names: unique });
  return res.data?.data ?? [];
}
