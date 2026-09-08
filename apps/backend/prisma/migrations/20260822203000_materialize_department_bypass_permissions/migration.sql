-- O acesso por setor (Financeiro, Compras, Departamento Pessoal, Jurídico) deixou de liberar
-- rotas implicitamente: agora cada página exige a própria permissão na matriz de Acesso.
-- Esta migração grava explicitamente o que esses usuários já acessavam na prática, para que
-- ninguém perca página na virada. O filtro por setor repete o `includes` usado no app.
--
-- ON CONFLICT ... DO UPDATE reativa linhas gravadas como negadas: hoje o bypass de setor tem
-- precedência sobre elas, então mantê-las negadas removeria um acesso que a pessoa tem.

-- Financeiro
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."userId", m.module, 'acesso', true, NULL, NOW(), NOW()
FROM employees e
CROSS JOIN (VALUES
  ('ponto_financeiro_analise-extrato'),
  ('ponto_financeiro_gestao-solicitacoes'),
  ('ponto_fluig_aprovacoes-workflow'),
  ('ponto_natureza-orcamentaria'),
  ('ponto_financeiro_controle-financeiro'),
  ('ponto_financeiro_receitas'),
  ('ponto_financeiro_controle-nfs')
) AS m(module)
WHERE lower(e.department) LIKE '%financeiro%'
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;

-- Compras
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."userId", m.module, 'acesso', true, NULL, NOW(), NOW()
FROM employees e
CROSS JOIN (VALUES
  ('ponto_fluig_aprovacoes-workflow'),
  ('ponto_gerenciar-materiais'),
  ('ponto_mapa-cotacao'),
  ('ponto_ordem-de-compra'),
  ('ponto_entregas-logistica'),
  ('ponto_estoque'),
  ('ponto_ajuste-estoque'),
  ('ponto_furo-estoque'),
  ('ponto_fds-aprovadas'),
  ('ponto_solicitacoes-combustivel'),
  ('ponto_solicitacoes-reserva-veiculos'),
  ('ponto_solicitacoes-ferramentas'),
  ('ponto_fornecedores'),
  ('ponto_veiculos'),
  ('ponto_regioes-postos-combustivel'),
  ('ponto_reserva-veiculos'),
  ('ponto_solicitar-combustivel'),
  ('ponto_condicoes-pagamento')
) AS m(module)
WHERE lower(e.department) LIKE '%compras%'
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;

-- Departamento Pessoal
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."userId", m.module, 'acesso', true, NULL, NOW(), NOW()
FROM employees e
CROSS JOIN (VALUES
  ('ponto_dashboard'),
  ('ponto_funcionarios'),
  ('ponto_aniversariantes'),
  ('ponto_seguranca-do-trabalho'),
  ('ponto_gerenciar-atestados'),
  ('ponto_solicitacoes-dp'),
  ('ponto_gerenciar-solicitacoes-dp'),
  ('ponto_gerenciar-ferias'),
  ('ponto_gerenciar-feriados'),
  ('ponto_banco-horas'),
  ('ponto_folha-pagamento'),
  ('relatorios_alocacao'),
  ('ponto_centros-custo'),
  ('ponto_materiais-construcao'),
  ('ponto_conversas-whatsapp')
) AS m(module)
WHERE lower(e.department) LIKE '%pessoal%'
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;

-- Jurídico
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."userId", 'ponto_juridico', 'acesso', true, NULL, NOW(), NOW()
FROM employees e
WHERE lower(e.department) LIKE '%jurídico%'
   OR lower(e.department) LIKE '%juridico%'
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;

-- Meus Chamados não entra aqui de propósito: a rota estava aberta, mas o menu lateral já
-- exigia a permissão do módulo (ou Central de Chamados). Quem não a tinha nunca via o item,
-- então a rota passa a exigir o mesmo que o menu, sem conceder nada em massa.
