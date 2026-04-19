import { body, param, query } from 'express-validator';

const STATUS_VALUES = ['active', 'away', 'inactive', 'suspended'];

export const inviteValidators = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('roleId').isUUID().withMessage('Role is required'),
];

export const listAdminsValidators = [
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('roleId').optional().isUUID(),
  query('status').optional().isIn(STATUS_VALUES),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const updateAdminValidators = [
  param('id').isUUID().withMessage('Invalid admin id'),
  body('name').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('status').optional().isIn(STATUS_VALUES),
  body('roleId').optional().isUUID(),
];

export const idParamValidators = [
  param('id').isUUID().withMessage('Invalid id'),
];

export const listInvitationsValidators = [
  query('status').optional().isIn(['pending', 'accepted', 'expired', 'revoked']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
