/**
 * Contexto de centro de custo + OS para scripts k6 de Suprimentos.
 *
 * Variáveis:
 *   COST_CENTER_IDS=id1,id2   — lista fixa; distribui RMs alternando entre os CCs
 */

function parseJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

export function parseCostCenterIds() {
  const raw = String(__ENV.COST_CENTER_IDS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseServiceOrders(body) {
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
}

function buildContextFromOrder(cc, os) {
  return {
    costCenterId: cc.id,
    costCenterCode: cc.code,
    costCenterName: cc.name,
    serviceOrderId: os.id,
    serviceOrder: os.label || `OS ${os.numero}/${os.ano}`,
  };
}

export function fetchCostCenterById(token, baseUrl, jsonHeaders, http, costCenterId) {
  const res = http.get(`${baseUrl}/cost-centers/${encodeURIComponent(costCenterId)}`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'cost_center_by_id' },
  });
  if (res.status !== 200) return null;
  const body = parseJson(res);
  return body?.data || null;
}

export function fetchListableServiceOrders(token, baseUrl, jsonHeaders, http, costCenterId) {
  const osRes = http.get(`${baseUrl}/service-orders?costCenterId=${encodeURIComponent(costCenterId)}`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'service_orders' },
  });
  if (osRes.status !== 200) return [];
  return parseServiceOrders(parseJson(osRes));
}

/**
 * Resolve OS listável para cada costCenterId fixo (ordem preservada).
 * Falha com mensagem clara se algum CC não tiver OS.
 */
export function resolveFixedOsContexts(token, baseUrl, jsonHeaders, http, costCenterIds) {
  const contexts = [];

  for (const costCenterId of costCenterIds) {
    let cc = fetchCostCenterById(token, baseUrl, jsonHeaders, http, costCenterId);
    if (!cc) {
      // fallback: busca na listagem (alguns ambientes não expõem GET /:id)
      const listRes = http.get(`${baseUrl}/cost-centers?isActive=true&limit=500`, {
        headers: jsonHeaders(token),
        tags: { endpoint: 'cost_centers' },
      });
      const list = parseJson(listRes)?.data;
      if (Array.isArray(list)) {
        cc = list.find((c) => c.id === costCenterId) || null;
      }
    }

    if (!cc) {
      throw new Error(`COST_CENTER_IDS: centro "${costCenterId}" não encontrado na API.`);
    }
    if (cc.isActive === false) {
      throw new Error(`COST_CENTER_IDS: centro "${cc.code}" (${costCenterId}) está inativo.`);
    }

    const orders = fetchListableServiceOrders(token, baseUrl, jsonHeaders, http, costCenterId);
    if (orders.length === 0) {
      throw new Error(
        `COST_CENTER_IDS: centro "${cc.name}" (${cc.code}) sem OS listável. ` +
          'Precisa de pleito com contrato vinculado (mesmo critério da API).',
      );
    }

    contexts.push(buildContextFromOrder(cc, orders[0]));
  }

  return contexts;
}

/** Primeiro centro ativo com OS listável (comportamento legado). */
export function findFirstCostCenterWithServiceOrder(token, baseUrl, jsonHeaders, http) {
  const res = http.get(`${baseUrl}/cost-centers?isActive=true&limit=500`, {
    headers: jsonHeaders(token),
    tags: { endpoint: 'cost_centers' },
  });

  const costCenters = parseJson(res)?.data;
  if (!Array.isArray(costCenters) || costCenters.length === 0) {
    return null;
  }

  for (const cc of costCenters) {
    const orders = fetchListableServiceOrders(token, baseUrl, jsonHeaders, http, cc.id);
    if (orders.length === 0) continue;
    return buildContextFromOrder(cc, orders[0]);
  }

  return null;
}

/**
 * Resolve contextos para setup: lista fixa (COST_CENTER_IDS) ou auto-descoberta.
 */
export function resolveOsContexts(token, baseUrl, jsonHeaders, http) {
  const fixedIds = parseCostCenterIds();
  if (fixedIds.length > 0) {
    return resolveFixedOsContexts(token, baseUrl, jsonHeaders, http, fixedIds);
  }

  const single = findFirstCostCenterWithServiceOrder(token, baseUrl, jsonHeaders, http);
  return single ? [single] : [];
}

/** Alterna entre os contextos por iteração (seed) ou VU (load). */
export function pickOsContext(contexts, index) {
  if (!Array.isArray(contexts) || contexts.length === 0) return null;
  return contexts[((index % contexts.length) + contexts.length) % contexts.length];
}

export function formatOsContextsSummary(contexts) {
  return contexts
    .map((c) => `${c.costCenterCode}(${c.costCenterId})→OS=${c.serviceOrderId}`)
    .join(' | ');
}
