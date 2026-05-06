-- Mensagens de sistema (eventos do grupo / fixação)
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
