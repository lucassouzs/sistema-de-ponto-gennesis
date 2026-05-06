-- Edição/apagamento de mensagens diretas (alinhamento schema ↔ banco).
-- Campos já existentes em uso com `prisma db push` ficam intactos pelo IF NOT EXISTS.

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
