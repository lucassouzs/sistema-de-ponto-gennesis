/**
 * Utilitário para normalizar a resposta de centros de custo da API.
 * A API pode retornar { data: [...] } ou o cache do react-query pode ter formato diferente.
 */
export function normalizeCostCentersResponse(data: unknown): Array<{ id?: string; code?: string; name?: string; [key: string]: unknown }> {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  if (obj?.data && Array.isArray(obj.data)) return obj.data as any[];
  return [];
}
