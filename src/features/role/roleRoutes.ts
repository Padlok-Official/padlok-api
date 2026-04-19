import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as roleController from './roleController';
import {
  createRoleValidators,
  updateRoleValidators,
  idParamValidators,
} from './roleValidators';

const router = Router();

// All role routes require authentication
router.use(authenticate);

/**
 * Role CRUD — all require manage_roles permission.
 */
router.get('/', requirePermission('manage_roles'), roleController.list);

router.get(
  '/:id',
  requirePermission('manage_roles'),
  idParamValidators,
  handleValidation,
  roleController.getById,
);

router.post(
  '/',
  requirePermission('manage_roles'),
  createRoleValidators,
  handleValidation,
  roleController.create,
);

router.patch(
  '/:id',
  requirePermission('manage_roles'),
  updateRoleValidators,
  handleValidation,
  roleController.update,
);

router.delete(
  '/:id',
  requirePermission('manage_roles'),
  idParamValidators,
  handleValidation,
  roleController.remove,
);

export default router;
