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
