import { Router } from 'express';
import { ChatController } from '../controllers/ChatController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const chatController = new ChatController();

router.use(authenticate);
router.use(requireRole(['EMPLOYEE']));

// ===========================================================
//  CHAT DIRETO ENTRE USUÁRIOS (estilo WhatsApp)
//  Rotas específicas ANTES das rotas com parâmetro /:id
// ===========================================================

// Listar todos os usuários do sistema (para iniciar conversa)
router.get('/direct/users', (req, res, next) =>
  chatController.listUsers(req, res, next)
);

// Contagem de não lidas em chats diretos
router.get('/direct/unread/count', (req, res, next) =>
  chatController.getDirectUnreadCount(req, res, next)
);

// Listar todos os chats diretos do usuário
router.get('/direct', (req, res, next) =>
  chatController.getDirectChats(req, res, next)
);

// Abrir (ou criar) chat direto com um usuário
router.post('/direct', (req, res, next) =>
  chatController.openDirectChat(req, res, next)
);

// Criar grupo (suporta upload de foto via multipart)
router.post('/direct/groups',
  ChatController.uploadGroupAvatar(),
  (req, res, next) => chatController.createGroupChat(req, res, next)
);

// Sair de um grupo
router.delete('/direct/groups/:id/leave', (req, res, next) =>
  chatController.leaveGroupChat(req, res, next)
);

// Atualizar grupo (nome, descrição)
router.patch('/direct/groups/:id', (req, res, next) =>
  chatController.updateGroupChat(req, res, next)
);

// Foto do grupo: upload e remoção
router.patch('/direct/groups/:id/avatar',
  ChatController.uploadGroupAvatar(),
  (req, res, next) => chatController.updateGroupAvatar(req, res, next)
);
router.delete('/direct/groups/:id/avatar', (req, res, next) =>
  chatController.removeGroupAvatar(req, res, next)
);

// Adicionar membros ao grupo
router.post('/direct/groups/:id/members', (req, res, next) =>
  chatController.addGroupMembers(req, res, next)
);

// Remover um membro do grupo
router.delete('/direct/groups/:id/members/:userId', (req, res, next) =>
  chatController.removeGroupMember(req, res, next)
);

// Favoritar / desfavoritar mensagem
router.post('/direct/messages/:messageId/favorite', (req, res, next) =>
  chatController.favoriteMessage(req, res, next)
);
router.delete('/direct/messages/:messageId/favorite', (req, res, next) =>
  chatController.unfavoriteMessage(req, res, next)
);

// Editar / apagar mensagem (15 min, só remetente)
router.patch('/direct/messages/:messageId', (req, res, next) =>
  chatController.editDirectMessage(req, res, next)
);
router.delete('/direct/messages/:messageId', (req, res, next) =>
  chatController.deleteDirectMessage(req, res, next)
);

// Privacidade (só para mim — estilo WhatsApp)
router.post('/direct/messages/:messageId/hide-for-me', (req, res, next) =>
  chatController.hideMessageForMe(req, res, next)
);
router.post('/direct/:chatId/clear-for-me', (req, res, next) =>
  chatController.clearConversationForMe(req, res, next)
);

// Fixar / desafixar mensagem num chat
router.post('/direct/:chatId/pin/:messageId', (req, res, next) =>
  chatController.pinMessage(req, res, next)
);
router.delete('/direct/:chatId/pin', (req, res, next) =>
  chatController.unpinMessage(req, res, next)
);

// Enviar mensagem em chat direto
router.post('/direct/messages',
  ChatController.uploadFiles(),
  (req, res, next) => chatController.sendDirectMessage(req, res, next)
);

// Download de anexos (proxy autenticado para forçar "attachment")
router.get('/direct/attachments/download', (req, res, next) =>
  chatController.downloadDirectAttachment(req, res, next)
);

// Marcar mensagens de chat direto como lidas
router.patch('/direct/:id/read', (req, res, next) =>
  chatController.markAsRead(req, res, next)
);

// Obter chat direto específico com mensagens
router.get('/direct/:id', (req, res, next) =>
  chatController.getDirectChatById(req, res, next)
);

// ===========================================================
//  CHAT POR DEPARTAMENTO (modelo existente)
// ===========================================================

// Criar novo chat
router.post('/',
  ChatController.uploadFiles(),
  (req, res, next) => chatController.createChat(req, res, next)
);

// Aceitar chat
router.post('/:id/accept', (req, res, next) => 
  chatController.acceptChat(req, res, next)
);

// Rejeitar chat
router.delete('/:id/reject', (req, res, next) => 
  chatController.rejectChat(req, res, next)
);

// Deletar chat (iniciador ou destinatário)
router.delete('/:id', (req, res, next) => 
  chatController.deleteChat(req, res, next)
);

// Enviar mensagem (chatId vem no body)
router.post('/messages',
  ChatController.uploadFiles(),
  (req, res, next) => chatController.sendMessage(req, res, next)
);

// Listar chats pendentes
router.get('/pending', (req, res, next) => 
  chatController.getPendingChats(req, res, next)
);

// Listar chats ativos
router.get('/active', (req, res, next) => 
  chatController.getActiveChats(req, res, next)
);

// Listar chats encerrados
router.get('/closed', (req, res, next) => 
  chatController.getClosedChats(req, res, next)
);

// Contagem de pendentes
router.get('/pending/count', (req, res, next) => 
  chatController.getPendingCount(req, res, next)
);

// Contagem de não lidas
router.get('/unread/count', (req, res, next) => 
  chatController.getUnreadCount(req, res, next)
);

// Obter chat específico (parâmetro /:id DEVE vir por último entre GETs)
router.get('/:id', (req, res, next) => 
  chatController.getChatById(req, res, next)
);

// Marcar como lido
router.patch('/:id/read', (req, res, next) => 
  chatController.markAsRead(req, res, next)
);

// Encerrar chat
router.patch('/:id/close', (req, res, next) => 
  chatController.closeChat(req, res, next)
);

export default router;
