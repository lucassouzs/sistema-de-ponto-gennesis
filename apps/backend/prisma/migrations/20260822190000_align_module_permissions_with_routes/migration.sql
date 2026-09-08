-- As rotas Controle de NF's e Licitações PNCP passaram a exigir a própria chave de módulo,
-- em vez de aceitarem módulos relacionados como fallback. Materializa o acesso que esses
-- usuários já tinham na prática para que ninguém perca a página na virada.

-- Controle de NF's: quem entrava via Balanço Financeiro ou Controle Financeiro.
WITH eligible_users AS (
  SELECT DISTINCT u."userId"
  FROM user_permissions u
  WHERE u.module IN (
      'ponto_financeiro_analise-extrato',
      'ponto_financeiro_controle-financeiro'
    )
    AND u.action = 'acesso'
    AND u.allowed = true
)
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  eu."userId",
  'ponto_financeiro_controle-nfs',
  'acesso',
  true,
  NULL,
  NOW(),
  NOW()
FROM eligible_users eu
WHERE NOT EXISTS (
  SELECT 1
  FROM user_permissions x
  WHERE x."userId" = eu."userId"
    AND x.module = 'ponto_financeiro_controle-nfs'
    AND x.action = 'acesso'
);

-- Licitações PNCP: quem entrava via Licitações.
WITH eligible_users AS (
  SELECT DISTINCT u."userId"
  FROM user_permissions u
  WHERE u.module = 'ponto_licitacoes'
    AND u.action = 'acesso'
    AND u.allowed = true
)
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  eu."userId",
  'ponto_licitacoes-pncp',
  'acesso',
  true,
  NULL,
  NOW(),
  NOW()
FROM eligible_users eu
WHERE NOT EXISTS (
  SELECT 1
  FROM user_permissions x
  WHERE x."userId" = eu."userId"
    AND x.module = 'ponto_licitacoes-pncp'
    AND x.action = 'acesso'
);
