import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { approvalNotificationController } from '../controllers/ApprovalNotificationController';

const router = Router();

router.use(authenticate);

router.get(
  '/notification-counts',
  approvalNotificationController.getNotificationCounts.bind(approvalNotificationController),
);

export default router;
