import { Router } from 'express';
import * as authController from './authController';
import {
  loginValidators,
  refreshValidators,
  logoutValidators,
  acceptInviteValidators,
  invitationPreviewValidators,
} from './authValidators';
import { handleValidation } from '@/middleware/validation';
import { authLimiter } from '@/middleware/security';
import { authenticate } from '@/middleware/auth';

const router = Router();

// Public — rate limited
router.post('/login', authLimiter, loginValidators, handleValidation, authController.login);
router.post('/refresh', authLimiter, refreshValidators, handleValidation, authController.refresh);
router.post(
  '/accept-invite',
  authLimiter,
  acceptInviteValidators,
  handleValidation,
  authController.acceptInvitation,
);
router.get(
  '/invitations/:token',
  authLimiter,
  invitationPreviewValidators,
  handleValidation,
  authController.invitationPreview,
);

// Authenticated
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, logoutValidators, handleValidation, authController.logout);

export default router;
