-- Migra permissões granulares (visualizar/criar/editar/excluir) para uma linha por módulo com action = 'acesso'.
-- Cada chave de módulo corresponde a um submenu (rota), conforme packages/permission-modules.

WITH legacy AS (
  SELECT DISTINCT u."userId", u.module AS old_module
  FROM user_permissions u
  WHERE u.allowed = true
    AND u.action IN ('visualizar', 'criar', 'editar', 'excluir')
),
mapping(old_module, new_module) AS (
  VALUES
    ('dashboard', 'ponto_dashboard'),
    ('dashboard', 'ponto_chatgpt'),
    ('dashboard', 'ponto_bi'),
    ('dashboard', 'ponto_solicitacoes'),
    ('dashboard', 'ponto_aniversariantes'),
    ('funcionarios', 'ponto_funcionarios'),
    ('folha_pagamento', 'ponto_folha-pagamento'),
    ('folha_pagamento', 'relatorios_alocacao'),
    ('atestados', 'ponto_atestados'),
    ('ferias', 'ponto_ferias'),
    ('ferias', 'ponto_gerenciar-ferias'),
    ('ferias', 'ponto_gerenciar-feriados'),
    ('banco_horas', 'ponto_banco-horas'),
    ('materiais', 'ponto_solicitar-materiais'),
    ('contratos', 'ponto_orcamento'),
    ('contratos', 'ponto_contratos'),
    ('contratos', 'ponto_contratos_controle-geral'),
    ('contratos', 'ponto_andamento-da-os'),
    ('contratos', 'ponto_pleitos-gerados'),
    ('financeiro', 'ponto_financeiro'),
    ('financeiro', 'ponto_financeiro_analise'),
    ('financeiro', 'ponto_financeiro_analise-extrato'),
    ('permissoes', 'ponto_permissoes')
),
expanded AS (
  SELECT DISTINCT l."userId", m.new_module AS module
  FROM legacy l
  INNER JOIN mapping m ON l.old_module = m.old_module
)
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  e."userId",
  e.module,
  'acesso',
  true,
  NULL,
  NOW(),
  NOW()
FROM expanded e
WHERE NOT EXISTS (
  SELECT 1 FROM user_permissions x
  WHERE x."userId" = e."userId" AND x.module = e.module AND x.action = 'acesso'
);

DELETE FROM user_permissions WHERE action IN ('visualizar', 'criar', 'editar', 'excluir');
