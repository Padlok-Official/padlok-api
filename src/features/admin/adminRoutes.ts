import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as adminController from './adminController';
import {
  inviteValidators,
  listAdminsValidators,
  updateAdminValidators,
  idParamValidators,
  listInvitationsValidators,
} from './adminValidators';

const router = Router();

router.use(authenticate);

/**
 * Invitation sub-routes — must come BEFORE the `/:id` pattern so Express
 * doesn't try to match "invitations" as an admin UUID.
 */
router.get(
  '/invitations',
  requirePermission('manage_admins'),
  listInvitationsValidators,
  handleValidation,
  adminController.listInvitations,
);

router.post(
  '/invitations/:id/resend',
  requirePermission('manage_admins'),
  idParamValidators,
  handleValidation,
  adminController.resendInvitation,
);

router.delete(
  '/invitations/:id',
  requirePermission('manage_admins'),
  idParamValidators,
  handleValidation,
  adminController.revokeInvitation,
);

router.post(
  '/invite',
  requirePermission('manage_admins'),
  inviteValidators,
  handleValidation,
  adminController.invite,
);

/** Admin CRUD */
router.get(
  '/',
  requirePermission('manage_admins'),
  listAdminsValidators,
  handleValidation,
  adminController.listAdmins,
);

router.get(
  '/:id',
  requirePermission('manage_admins'),
  idParamValidators,
  handleValidation,
  adminController.getAdmin,
);

router.patch(
  '/:id',
  requirePermission('manage_admins'),
  updateAdminValidators,
  handleValidation,
  adminController.updateAdmin,
);

router.delete(
  '/:id',
  requirePermission('manage_admins'),
  idParamValidators,
  handleValidation,
  adminController.deleteAdmin,
);

export default router;
