import { Router } from 'express';
import { KanbanController } from '../controllers/KanbanController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new KanbanController();

router.use(authenticate);

router.get('/boards', (req, res, next) => controller.listBoards(req, res, next));
router.post('/boards', (req, res, next) => controller.createBoard(req, res, next));
router.patch('/boards/:boardId', (req, res, next) => controller.updateBoard(req, res, next));
router.delete('/boards/:boardId', (req, res, next) => controller.deleteBoard(req, res, next));
router.get('/boards/:boardId/shares', (req, res, next) => controller.listBoardShares(req, res, next));
router.post('/boards/:boardId/shares', (req, res, next) => controller.addBoardShare(req, res, next));
router.patch('/boards/:boardId/shares/:userId', (req, res, next) =>
  controller.updateBoardShare(req, res, next),
);
router.delete('/boards/:boardId/shares/:userId', (req, res, next) =>
  controller.removeBoardShare(req, res, next),
);
router.get('/picker-users', (req, res, next) => controller.listPickerUsers(req, res, next));
router.get('/board', (req, res, next) => controller.getBoard(req, res, next));
router.get('/board/archived-cards', (req, res, next) =>
  controller.listArchivedCards(req, res, next),
);
router.get('/board/export-trello', (req, res, next) =>
  controller.exportBoardTrello(req, res, next),
);
router.post('/board/import-trello', (req, res, next) =>
  controller.importBoardTrello(req, res, next),
);
router.patch('/board/label-presets', (req, res, next) =>
  controller.updateBoardLabelPresets(req, res, next),
);

router.post('/columns', (req, res, next) => controller.createColumn(req, res, next));
router.patch('/columns/:id', (req, res, next) => controller.updateColumn(req, res, next));
router.delete('/columns/:id', (req, res, next) => controller.deleteColumn(req, res, next));

router.post('/cards', (req, res, next) => controller.createCard(req, res, next));
router.post('/cards/:cardId/members', (req, res, next) => controller.addCardMember(req, res, next));
router.delete('/cards/:cardId/members/:userId', (req, res, next) =>
  controller.removeCardMember(req, res, next),
);
router.get('/cards/:id', (req, res, next) => controller.getCardById(req, res, next));
router.get('/cards/:id/cost', (req, res, next) => controller.getCardCost(req, res, next));
router.patch('/cards/:id/move', (req, res, next) => controller.moveCard(req, res, next));
router.patch('/cards/:id', (req, res, next) => controller.updateCard(req, res, next));
router.post('/cards/:id/duplicate', (req, res, next) => controller.duplicateCard(req, res, next));
router.delete('/cards/:id', (req, res, next) => controller.deleteCard(req, res, next));

router.post('/cards/:cardId/checklist-items', (req, res, next) =>
  controller.createChecklistItem(req, res, next),
);
router.patch('/checklist-items/:id', (req, res, next) =>
  controller.updateChecklistItem(req, res, next),
);
router.delete('/checklist-items/:id', (req, res, next) =>
  controller.deleteChecklistItem(req, res, next),
);

router.post('/cards/:cardId/comments', (req, res, next) =>
  controller.createComment(req, res, next),
);
router.delete('/comments/:id', (req, res, next) => controller.deleteComment(req, res, next));

router.post(
  '/cards/:cardId/attachments',
  KanbanController.uploadAttachments(),
  (req, res, next) => controller.addAttachments(req, res, next),
);
router.post('/cards/:cardId/attachments/link', (req, res, next) =>
  controller.addLinkAttachment(req, res, next),
);
router.delete('/attachments/:id', (req, res, next) => controller.deleteAttachment(req, res, next));

export default router;
