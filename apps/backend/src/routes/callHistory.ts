import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Não autenticado' });

    const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined;

    const accessibleChats = await prisma.chatParticipant.findMany({
      where: { userId, ...(chatId ? { chatId } : {}) },
      select: { chatId: true },
    });
    const chatIds = accessibleChats.map((c) => c.chatId);
    if (chatIds.length === 0) return res.json({ success: true, data: [] });

    const logs = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        isSystem: true,
        content: { startsWith: 'CALL_LOG:' },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const parsed = logs
      .map((m) => {
        try {
          const payload = JSON.parse(m.content.slice('CALL_LOG:'.length)) as Record<string, unknown>;
          return {
            id: m.id,
            chatId: m.chatId,
            createdAt: m.createdAt,
            ...payload,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('[call-history] erro ao listar histórico', error);
    return res.status(500).json({ success: false, message: 'Falha ao carregar histórico de chamadas' });
  }
});

export default router;
