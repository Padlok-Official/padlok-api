import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as flagController from './flagController';
import * as validators from './flagValidators';

const router = Router();
router.use(authenticate);

// --- Risk alerts (derived signals) ---

router.get(
  '/alerts',
  requireAnyPermission(['flag_users', 'view_users']),
  validators.listAlertsValidators,
  handleValidation,
  flagController.listAlerts,
);

router.post(
  '/alerts/:id/acknowledge',
  requireAnyPermission(['flag_users', 'apply_flags']),
  validators.idValidator,
  handleValidation,
  flagController.acknowledgeAlert,
);

// --- User flags ---

router.get(
  '/stats',
  requireAnyPermission(['flag_users', 'view_users']),
  flagController.stats,
);

router.get(
  '/',
  requireAnyPermission(['flag_users', 'view_users']),
  validators.listFlagsValidators,
  handleValidation,
  flagController.listFlags,
);

router.post(
  '/',
  requirePermission('flag_users'),
  validators.createFlagValidators,
  handleValidation,
  flagController.createFlag,
);

router.get(
  '/:id',
  requireAnyPermission(['flag_users', 'view_users']),
  validators.idValidator,
  handleValidation,
  flagController.getFlag,
);

router.post(
  '/:id/resolve',
  requirePermission('flag_users'),
  validators.resolveFlagValidators,
  handleValidation,
  flagController.resolveFlag,
);

export default router;
