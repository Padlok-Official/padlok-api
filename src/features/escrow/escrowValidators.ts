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

export const payoutRefundValidators = [
  param('id').isUUID().withMessage('Valid dispute id required'),
  body('note')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage('note must be ≤ 2000 characters'),
];

export const penalizeUserValidators = [
  param('id').isUUID().withMessage('Valid dispute id required'),
  body('targetUserId').isUUID().withMessage('Valid target user id required'),
  body('reason').isString().notEmpty().withMessage('Reason is required'),
  body('severity')
    .isIn(['critical', 'warning', 'info'])
    .withMessage('severity must be critical, warning, or info'),
];

export const flagDisputeValidators = [
  param('id').isUUID().withMessage('Valid dispute id required'),
  body('flagType').isString().notEmpty().withMessage('flagType is required'),
  body('note')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage('note must be ≤ 2000 characters'),
];

export const sendMessageValidators = [
  param('id').isUUID().withMessage('Valid dispute id required'),
  body('recipient')
    .isIn(['buyer', 'seller'])
    .withMessage('recipient must be "buyer" or "seller"'),
  body('templateId').optional({ nullable: true }).isUUID().withMessage('Invalid templateId'),
  body('body').isString().notEmpty().withMessage('Message body is required'),
  body('channel')
    .isIn(['email', 'sms', 'in-app'])
    .withMessage('channel must be email, sms, or in-app'),
];
