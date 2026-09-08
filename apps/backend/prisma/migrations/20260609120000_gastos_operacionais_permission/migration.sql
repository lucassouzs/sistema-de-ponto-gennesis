-- Concede acesso ao módulo Gastos Operacionais para quem já acessa Controle Geral de Contratos.
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."userId",
  'ponto_contratos_gastos-operacionais',
  'acesso',
  true,
  NULL,
  NOW(),
  NOW()
FROM user_permissions u
WHERE u.module = 'ponto_contratos_controle-geral'
  AND u.action = 'acesso'
  AND u.allowed = true
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions x
    WHERE x."userId" = u."userId"
      AND x.module = 'ponto_contratos_gastos-operacionais'
      AND x.action = 'acesso'
  );
