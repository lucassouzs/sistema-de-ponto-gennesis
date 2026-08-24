-- Concede NFs Recebidas a quem já acessa métricas/financeiro relacionados.
WITH eligible_users AS (
  SELECT DISTINCT u."userId"
  FROM user_permissions u
  WHERE u.module IN (
      'ponto_financeiro_analise-extrato',
      'ponto_financeiro_controle-financeiro',
      'ponto_financeiro_controle-nfs',
      'ponto_financeiro_receitas',
      'ponto_financeiro'
    )
    AND u.action = 'acesso'
    AND u.allowed = true
)
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  eu."userId",
  'ponto_financeiro_nfs-recebidas',
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
    AND x.module = 'ponto_financeiro_nfs-recebidas'
    AND x.action = 'acesso'
);
