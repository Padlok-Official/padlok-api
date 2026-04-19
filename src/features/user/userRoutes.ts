import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as userController from './userController';
import * as validators from './userValidators';

const router = Router();
router.use(authenticate);

// List users with filters (search, status, flagged).
router.get(
  '/',
  requirePermission('view_users'),
  validators.listValidators,
  handleValidation,
  userController.list,
);

// Single user with aggregates.
router.get(
  '/:id',
  requirePermission('view_users'),
  validators.idValidator,
  handleValidation,
  userController.getOne,
);

// Audit activity for a user.
router.get(
  '/:id/activity',
  requireAnyPermission(['view_users', 'view_activity_log']),
  validators.idValidator,
  handleValidation,
  userController.activity,
);

// User's transactions (buyer or seller).
router.get(
  '/:id/transactions',
  requireAnyPermission(['view_users', 'view_transactions']),
  validators.idValidator,
  handleValidation,
  userController.transactions,
);

// User's disputes.
router.get(
  '/:id/disputes',
  requireAnyPermission(['view_users', 'view_disputes']),
  validators.idValidator,
  handleValidation,
  userController.disputes,
);

// Activate / deactivate a user (soft suspend).
router.patch(
  '/:id/status',
  requirePermission('suspend_users'),
  validators.setStatusValidators,
  handleValidation,
  userController.setStatus,
);

export default router;
