import { body, param, query } from 'express-validator';

const ESCROW_STATUSES = [
  'initiated',
  'funded',
  'delivery_confirmed',
  'completed',
  'disputed',
  'refunded',
  'cancelled',
];

const DISPUTE_STATUSES = [
  'open',
  'under_review',
  'resolved_refund',
  'resolved_release',
  'closed',
];

export const listEscrowsValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(ESCROW_STATUSES),
  query('buyerId').optional().isUUID(),
  query('sellerId').optional().isUUID(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
];

export const escrowIdValidator = [param('id').isUUID().withMessage('Valid escrow id required')];

export const listDisputesValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(DISPUTE_STATUSES),
];

export const resolveDisputeValidators = [
  param('id').isUUID().withMessage('Valid dispute id required'),
  body('resolution')
    .isIn(['refund', 'release'])
    .withMessage('resolution must be "refund" or "release"'),
  body('admin_notes')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage('admin_notes must be ≤ 2000 characters'),
];

export const escrowStatsValidators = [
  query('currency').optional().isString().isLength({ min: 3, max: 3 }),
];
