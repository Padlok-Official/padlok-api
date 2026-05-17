/**
 * Admin-scoped escrow routes. All routes require a valid admin access token
 * (authenticate) and an appropriate permission key.
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as escrowController from './escrowController';
import * as validators from './escrowValidators';

const router = Router();

router.use(authenticate);

// GET /api/v1/escrow/stats — aggregate figures for the dashboard cards.
router.get(
  '/stats',
  requireAnyPermission(['view_transactions', 'manage_escrow']),
  validators.escrowStatsValidators,
  handleValidation,
  escrowController.getStats,
);

// GET /api/v1/escrow/disputes/message-templates
router.get(
  '/disputes/message-templates',
  requirePermission('send_messages'),
  escrowController.getMessageTemplates,
);

// GET /api/v1/escrow/disputes/stats — queue health (open + avg resolution).
router.get(
  '/disputes/stats',
  requirePermission('view_disputes'),
  escrowController.disputeStats,
);

// GET /api/v1/escrow/disputes/:id/timeline — chronological event list.
router.get(
  '/disputes/:id/timeline',
  requirePermission('view_disputes'),
  escrowController.disputeTimeline,
);

// GET /api/v1/escrow/disputes/:id — dispute detail + associated escrow.
router.get(
  '/disputes/:id',
  requirePermission('view_disputes'),
  escrowController.getDispute,
);

// GET /api/v1/escrow/disputes — list disputes.
router.get(
  '/disputes',
  requirePermission('view_disputes'),
  validators.listDisputesValidators,
  handleValidation,
  escrowController.listDisputes,
);

// POST /api/v1/escrow/disputes/:id/resolve — resolve a dispute.
router.post(
  '/disputes/:id/resolve',
  requirePermission('resolve_disputes'),
  validators.resolveDisputeValidators,
  handleValidation,
  escrowController.resolveDispute,
);

// POST /api/v1/escrow/disputes/:id/payout
router.post(
  '/disputes/:id/payout',
  requireAnyPermission(['resolve_disputes', 'release_funds']),
  validators.payoutRefundValidators,
  handleValidation,
  escrowController.payoutDispute,
);

// POST /api/v1/escrow/disputes/:id/refund
router.post(
  '/disputes/:id/refund',
  requireAnyPermission(['resolve_disputes', 'process_refunds']),
  validators.payoutRefundValidators,
  handleValidation,
  escrowController.refundDispute,
);

// POST /api/v1/escrow/disputes/:id/penalize
router.post(
  '/disputes/:id/penalize',
  requireAnyPermission(['suspend_users', 'flag_users']),
  validators.penalizeUserValidators,
  handleValidation,
  escrowController.penalizeUser,
);

// POST /api/v1/escrow/disputes/:id/flag
router.post(
  '/disputes/:id/flag',
  requirePermission('apply_flags'),
  validators.flagDisputeValidators,
  handleValidation,
  escrowController.flagDispute,
);


// POST /api/v1/escrow/disputes/:id/messages
router.post(
  '/disputes/:id/messages',
  requirePermission('send_messages'),
  validators.sendMessageValidators,
  handleValidation,
  escrowController.sendMessage,
);

// GET /api/v1/escrow/disputes/:id/messages
router.get(
  '/disputes/:id/messages',
  requirePermission('view_disputes'),
  escrowController.getMessages,
);

// GET /api/v1/escrow — list escrow transactions across all users.
router.get(
  '/',
  requireAnyPermission(['view_transactions', 'manage_escrow']),
  validators.listEscrowsValidators,
  handleValidation,
  escrowController.listEscrows,
);

// GET /api/v1/escrow/:id — single escrow detail + latest dispute.
router.get(
  '/:id',
  requireAnyPermission(['view_transactions', 'manage_escrow']),
  validators.escrowIdValidator,
  handleValidation,
  escrowController.getEscrow,
);

export default router;
