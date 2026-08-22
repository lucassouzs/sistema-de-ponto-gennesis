-- Remove a permissão legada «Sistema de Gestão de OS (cadastros)».
-- Quem ainda só tinha essa chave recebe Locais, Equipamentos e Tipos de Serviço;
-- em seguida as linhas da chave antiga são apagadas.

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

DELETE FROM user_permissions
WHERE module = 'ponto_sistema-gestao-os_cadastros';
