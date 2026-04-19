/**
 * Admin-scoped wallet routes. Read-only: we deliberately don't expose
 * mutating wallet ops from the admin dashboard. Refunds/releases flow
 * through the escrow dispute resolution path instead.
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireAnyPermission } from '@/middleware/requirePermission';
import { handleValidation } from '@/middleware/validation';
import * as walletController from './walletController';
import * as validators from './walletValidators';

const router = Router();

router.use(authenticate);

// GET /api/v1/wallet/stats — aggregate figures.
router.get(
  '/stats',
  requireAnyPermission(['view_transactions', 'view_revenue']),
  validators.walletStatsValidators,
  handleValidation,
  walletController.getStats,
);

// GET /api/v1/wallet/transactions — list wallet ledger entries.
router.get(
  '/transactions',
  requireAnyPermission(['view_transactions', 'view_revenue']),
  validators.listWalletTxValidators,
  handleValidation,
  walletController.listTransactions,
);

// GET /api/v1/wallet/transactions/:id — single ledger entry.
router.get(
  '/transactions/:id',
  requireAnyPermission(['view_transactions', 'view_revenue']),
  validators.walletTxIdValidator,
  handleValidation,
  walletController.getTransaction,
);

export default router;
