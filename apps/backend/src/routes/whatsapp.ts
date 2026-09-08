import { Router } from 'express';
import { WhatsAppController } from '../controllers/WhatsAppController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const controller = new WhatsAppController();

// Webhook PÚBLICO - Meta WhatsApp Cloud API (verificação GET + eventos POST)
router.get('/webhook', (req, res) => controller.verifyWebhook(req, res));
router.post('/webhook', (req, res, next) => controller.handleWebhook(req, res, next));

router.use(authenticate);
router.use(requireRole(['EMPLOYEE'])); // Apenas quem tem role EMPLOYEE (inclui admin, DP etc.) vê as conversas

router.get('/conversations', (req, res, next) =>
  controller.listConversations(req as any, res, next)
);

router.get('/medical-certificate-submissions', (req, res, next) =>
  controller.listMedicalCertificateSubmissions(req as any, res, next)
);

router.get('/conversations/:id', (req, res, next) =>
  controller.getConversation(req as any, res, next)
);

router.delete('/conversations/:id', (req, res, next) =>
  controller.deleteConversation(req as any, res, next)
);

router.post('/conversations/:id/messages', (req, res, next) =>
  controller.sendMessageToConversation(req as any, res, next)
);

// Encerra a conversa para o WhatsApp (status CANCELLED)
router.post('/conversations/:id/end', (req, res, next) =>
  controller.endConversation(req as any, res, next)
);

// Finaliza análise de um submission de atestado (PENDING -> PROCESSED)
router.post('/conversations/:id/submissions/:submissionId/finalize', (req, res, next) =>
  controller.finalizeMedicalCertificateSubmission(req as any, res, next)
);

// Download do arquivo do atestado (Content-Disposition: attachment)
router.get('/conversations/:id/submissions/:submissionId/file', (req, res, next) =>
  controller.downloadMedicalCertificateSubmissionFile(req as any, res, next)
);

export default router;
