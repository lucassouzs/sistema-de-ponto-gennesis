/**
 * Credenciais obrigatórias para scripts k6 de carga (sem fallback silencioso).
 */

function trimEnv(name) {
  const v = __ENV[name];
  return v === undefined || v === null ? '' : String(v).trim();
}

export function requireEnv(name, hint) {
  const v = trimEnv(name);
  if (!v) {
    const msg = hint || `Defina: k6 run -e ${name}=...`;
    throw new Error(`Variável ${name} não definida. ${msg}`);
  }
  return v;
}

/** Usuário padrão do pipeline (criação RM, cotação, pagamento, aprovação RM). */
export function getUserCredentials() {
  return {
    email: requireEnv('USER_EMAIL', 'Ex.: -e USER_EMAIL=seu@email.com'),
    password: requireEnv('USER_PASSWORD', 'Ex.: -e USER_PASSWORD=sua-senha'),
  };
}

/**
 * Aprovadores de OC (3 papéis). Senha única via USER_PASSWORD.
 * Se COMPRAS/GESTOR/DIRETORIA não forem passados, usa USER_EMAIL para os três
 * (útil quando um único admin tem todas as permissões).
 */
export function getOcApproverCredentials() {
  const password = requireEnv('USER_PASSWORD');
  const fallbackEmail = trimEnv('USER_EMAIL');
  const compras = trimEnv('COMPRAS_EMAIL') || fallbackEmail;
  const gestor = trimEnv('GESTOR_EMAIL') || fallbackEmail;
  const diretoria = trimEnv('DIRETORIA_EMAIL') || fallbackEmail;

  if (!compras || !gestor || !diretoria) {
    throw new Error(
      'Defina USER_EMAIL (um admin com todos os papéis) ou COMPRAS_EMAIL, GESTOR_EMAIL e DIRETORIA_EMAIL.',
    );
  }

  return { compras, gestor, diretoria, password };
}

export function loginJsonBody(credentials) {
  return JSON.stringify({ email: credentials.email, password: credentials.password });
}

export function loginJsonBodyForEmail(email, password) {
  return JSON.stringify({ email, password });
}

/** Fornecedor da cotação k6 — obrigatório em produção (sem ID local padrão). */
export function requireSupplierId() {
  return requireEnv(
    'SUPPLIER_ID',
    'Ex.: -e SUPPLIER_ID=... ou $env:SUPPLIER_ID antes do pipeline. Rode: npx tsx scripts/consultar-fornecedores-ativos.ts',
  );
}
