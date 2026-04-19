import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as notificationController from './notificationController';
import * as validators from './notificationValidators';

const router = Router();
router.use(authenticate);

router.get(
  '/stats',
  requireAnyPermission(['send_notifications', 'view_messages']),
  notificationController.stats,
);

router.get(
  '/',
  requireAnyPermission(['send_notifications', 'view_messages']),
  validators.listValidators,
  handleValidation,
  notificationController.list,
);

router.post(
  '/send',
  requirePermission('send_notifications'),
  validators.sendValidators,
  handleValidation,
  notificationController.send,
);

router.post(
  '/:id/read',
  requireAnyPermission(['send_notifications', 'view_messages']),
  validators.idValidator,
  handleValidation,
  notificationController.markRead,
);

export default router;
