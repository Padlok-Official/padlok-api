import { param, query } from 'express-validator';

const TX_TYPES = ['funding', 'withdrawal', 'escrow_lock', 'escrow_release', 'escrow_refund'];
const TX_STATUSES = ['pending', 'completed', 'failed', 'reversed'];

export const listWalletTxValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('type').optional().isIn(TX_TYPES),
  query('status').optional().isIn(TX_STATUSES),
  query('userId').optional().isUUID(),
  query('walletId').optional().isUUID(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
];

export const walletTxIdValidator = [param('id').isUUID().withMessage('Valid transaction id required')];

export const walletStatsValidators = [
  query('currency').optional().isString().isLength({ min: 3, max: 3 }),
];
