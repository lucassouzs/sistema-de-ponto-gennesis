-- Os módulos "pai" (Central de Chamados e Espelho da Nota Fiscal) deixaram de liberar as páginas
-- filhas por herança: agora cada página exige a própria permissão na matriz de Acesso.
-- Esta migração grava explicitamente o acesso que esses usuários já tinham na prática.
--
-- ON CONFLICT ... DO UPDATE reativa linhas gravadas como negadas: enquanto a herança existia, o
-- acesso pelo pai tinha precedência sobre elas, então mantê-las negadas removeria acesso atual.

-- Central de Chamados -> páginas filhas e Meus Chamados
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."userId", m.module, 'acesso', true, NULL, NOW(), NOW()
FROM (
  SELECT DISTINCT "userId"
  FROM user_permissions
  WHERE module = 'ponto_sistema-gestao-os' AND action = 'acesso' AND allowed = true
) p
CROSS JOIN (VALUES
  ('ponto_meus-chamados'),
  ('ponto_sistema-gestao-os_planos'),
  ('ponto_sistema-gestao-os_relatorios'),
  ('ponto_sistema-gestao-os_cadastros'),
  ('ponto_sistema-gestao-os_locais'),
  ('ponto_sistema-gestao-os_equipamentos'),
  ('ponto_sistema-gestao-os_tipos-servico')
) AS m(module)
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;

-- Cadastros da Central de Chamados -> Locais, Equipamentos e Tipos de Serviço
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."userId", m.module, 'acesso', true, NULL, NOW(), NOW()
FROM (
  SELECT DISTINCT "userId"
  FROM user_permissions
  WHERE module = 'ponto_sistema-gestao-os_cadastros' AND action = 'acesso' AND allowed = true
) p
CROSS JOIN (VALUES
  ('ponto_sistema-gestao-os_locais'),
  ('ponto_sistema-gestao-os_equipamentos'),
  ('ponto_sistema-gestao-os_tipos-servico')
) AS m(module)
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;

-- Espelho da Nota Fiscal -> cadastros de apoio
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."userId", m.module, 'acesso', true, NULL, NOW(), NOW()
FROM (
  SELECT DISTINCT "userId"
  FROM user_permissions
  WHERE module = 'ponto_espelho-nf' AND action = 'acesso' AND allowed = true
) p
CROSS JOIN (VALUES
  ('ponto_espelho-nf_prestadores-servico'),
  ('ponto_espelho-nf_tomadores-servico'),
  ('ponto_espelho-nf_contas-bancarias'),
  ('ponto_espelho-nf_codigos-tributarios')
) AS m(module)
ON CONFLICT ("userId", module, action)
DO UPDATE SET allowed = true, "updatedAt" = NOW()
WHERE user_permissions.allowed = false;
