import { body, param, query } from 'express-validator';

const TYPES = ['warning', 'dispute_update', 'transaction', 'announcement', 'system'];

export const listValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('type').optional().isIn(TYPES),
  query('userId').optional().isUUID(),
  query('unread_only').optional().isBoolean().toBoolean(),
];

export const sendValidators = [
  body('type').isIn(TYPES).withMessage(`type must be one of: ${TYPES.join(', ')}`),
  body('title').isString().trim().isLength({ min: 1, max: 255 }),
  body('body').isString().trim().isLength({ min: 1, max: 2000 }),
  body('userId').optional({ nullable: true }).isUUID(),
  body('userIds').optional().isArray({ min: 1, max: 1000 }),
  body('userIds.*').optional().isUUID(),
  body('broadcast').optional().isBoolean(),
  body('channels.push').optional().isBoolean(),
  body('channels.sms').optional().isBoolean(),
  body('channels.email').optional().isBoolean(),
  body('data').optional().isObject(),
];

export const idValidator = [param('id').isUUID()];
