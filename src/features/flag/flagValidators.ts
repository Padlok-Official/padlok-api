import { body, param, query } from 'express-validator';

const SEVERITY = ['critical', 'warning', 'info'];

export const listFlagsValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('severity').optional().isIn(SEVERITY),
  query('userId').optional().isUUID(),
  query('resolved').optional().isBoolean().toBoolean(),
];

export const createFlagValidators = [
  body('userId').isUUID(),
  body('reason').isString().trim().isLength({ min: 5, max: 2000 }),
  body('severity').optional().isIn(SEVERITY),
  body('category').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('relatedDisputeId').optional({ nullable: true }).isUUID(),
  body('relatedTransactionId').optional({ nullable: true }).isUUID(),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
];

export const resolveFlagValidators = [
  param('id').isUUID(),
  body('resolutionNotes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
];

export const idValidator = [param('id').isUUID()];

export const listAlertsValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('severity').optional().isIn(SEVERITY),
  query('source').optional().isString(),
  query('acknowledged').optional().isBoolean().toBoolean(),
];
