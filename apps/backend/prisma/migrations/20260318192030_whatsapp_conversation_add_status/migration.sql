-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- DropIndex
DROP INDEX "whatsapp_conversations_phone_key";

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'PENDING';
